'use strict';

/**
 * Run-output summarisation.
 *
 * When a ticket's branch merges cleanly it moves to review and its stdout/stderr
 * logs are deleted. That throws away the only record of how the work actually
 * went. This module reads those logs before they are removed and has an agent
 * condense them into a structured per-phase summary stored on the ticket.
 *
 * Phase attribution is the awkward part: log files are named
 * `<ticketId>__<runId>.stdout.log` and carry no phase marker. The run-complete
 * handlers therefore record a manifest on `ticket.run_log_index` as each run
 * finishes, when `run.isTest` / `run.isEval` are still in scope. Tickets that
 * ran before that manifest existed cannot be summarised — their phases are
 * unknowable and their logs are already gone.
 */

const fs = require('fs');
const path = require('path');

const { extractTextFromStreamJson } = require('./runLifecycle');
const {
  runCodexDraftCommand,
  buildDraftArgsFromTemplate,
  parseCodexDraftOutput
} = require('./adHocTickets');

/** Phases in lifecycle order — also the order sections are rendered in. */
const PHASE_ORDER = ['impl', 'test', 'eval', 'merge_resolve'];

const PHASE_LABELS = {
  impl: 'Implementation',
  test: 'Test',
  eval: 'Evaluation',
  merge_resolve: 'Merge Resolve'
};

/**
 * Characters of flattened log text kept from each end of a phase's output.
 *
 * The head holds the agent's plan and the tail holds the outcome; the middle is
 * tool-call churn that summarises poorly and costs the most tokens. 50k each
 * side keeps a typical 260KB stream-json log inside a sane prompt.
 */
const HEAD_BUDGET_CHARS = 50_000;
const TAIL_BUDGET_CHARS = 50_000;

const SUMMARY_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Derive the lifecycle phase of a completed run.
 *
 * @param {{ isTest?: boolean, isEval?: boolean, isMergeResolve?: boolean }} run
 * @returns {string} one of PHASE_ORDER
 */
function resolveRunPhase(run = {}) {
  if (run.isMergeResolve) return 'merge_resolve';
  if (run.isEval) return 'eval';
  if (run.isTest) return 'test';
  return 'impl';
}

/**
 * Append a run to a ticket's log manifest, replacing any entry with the same
 * run id so a retried write cannot duplicate a phase.
 *
 * @param {Object} ticket - mutated in place
 * @param {{ runId: string, phase: string, agentName?: string, finishedAt?: string, stdoutLogFile?: string, stderrLogFile?: string }} entry
 * @returns {Array} the updated manifest
 */
function recordRunLogEntry(ticket, entry) {
  if (!ticket || !entry || !entry.runId) return ticket?.run_log_index || [];

  const existing = Array.isArray(ticket.run_log_index) ? ticket.run_log_index : [];
  const withoutDuplicate = existing.filter(item => item?.runId !== entry.runId);

  withoutDuplicate.push({
    runId: entry.runId,
    phase: PHASE_ORDER.includes(entry.phase) ? entry.phase : 'impl',
    agentName: entry.agentName || null,
    finishedAt: entry.finishedAt || null,
    stdout_log_file: entry.stdoutLogFile || null,
    stderr_log_file: entry.stderrLogFile || null
  });

  ticket.run_log_index = withoutDuplicate;
  return ticket.run_log_index;
}

/**
 * Group manifest entries by phase, preserving chronological order within each
 * phase so a retried implementation reads as one continuous story.
 *
 * @param {Array} runLogIndex
 * @returns {Array<{ phase: string, label: string, entries: Array }>}
 */
function groupRunsByPhase(runLogIndex = []) {
  const entries = Array.isArray(runLogIndex) ? runLogIndex : [];
  const buckets = new Map();

  for (const entry of entries) {
    if (!entry) continue;
    const phase = PHASE_ORDER.includes(entry.phase) ? entry.phase : 'impl';
    if (!buckets.has(phase)) buckets.set(phase, []);
    buckets.get(phase).push(entry);
  }

  return PHASE_ORDER
    .filter(phase => buckets.has(phase))
    .map(phase => ({
      phase,
      label: PHASE_LABELS[phase],
      entries: buckets.get(phase).slice().sort((a, b) => (
        String(a.finishedAt || '').localeCompare(String(b.finishedAt || ''))
      ))
    }));
}

/**
 * Keep the head and tail of a long transcript, marking what was dropped.
 *
 * @param {string} text
 * @param {{ head?: number, tail?: number }} [budget]
 * @returns {string}
 */
function truncateForPrompt(text, { head = HEAD_BUDGET_CHARS, tail = TAIL_BUDGET_CHARS } = {}) {
  const value = String(text || '');
  if (value.length <= head + tail) return value;

  const omitted = value.length - head - tail;
  return [
    value.slice(0, head),
    `\n\n[... ${omitted.toLocaleString('en-US')} characters of tool-call output omitted ...]\n\n`,
    value.slice(value.length - tail)
  ].join('');
}

/**
 * Read and flatten every log file for one phase into plain text.
 *
 * @param {Array} entries - manifest entries for a single phase
 * @param {string} projectRoot
 * @param {{ readFile?: Function, existsSync?: Function }} [io]
 * @returns {string}
 */
function readPhaseTranscript(entries, projectRoot, io = {}) {
  const readFile = io.readFile || ((p) => fs.readFileSync(p, 'utf8'));
  const exists = io.existsSync || ((p) => fs.existsSync(p));
  const parts = [];

  for (const entry of entries) {
    for (const relative of [entry?.stdout_log_file, entry?.stderr_log_file]) {
      if (!relative) continue;
      const absolute = path.isAbsolute(relative) ? relative : path.join(projectRoot, relative);
      if (!exists(absolute)) continue;
      try {
        const raw = readFile(absolute);
        const flattened = extractTextFromStreamJson(raw);
        if (flattened.trim()) parts.push(flattened);
      } catch (error) {
        // An unreadable log should not sink the whole summary — note and move on.
        parts.push(`[Unable to read ${relative}: ${error?.message || 'unknown error'}]`);
      }
    }
  }

  return parts.join('\n\n');
}

/**
 * Build the summarisation prompt for one phase.
 *
 * @param {{ ticket: Object, phase: string, transcript: string }} params
 * @returns {string}
 */
function buildRunSummaryPrompt({ ticket, phase, transcript }) {
  const label = PHASE_LABELS[phase] || phase;
  return `You are summarising the ${label.toLowerCase()} phase of an automated coding run so a human reviewer can understand what happened without reading the raw transcript.

Ticket: ${ticket?.id || 'unknown'} — ${ticket?.title || 'untitled'}

Respond with ONLY a JSON object, no prose and no code fence, with exactly these keys:
{
  "what_changed": "2-4 sentences describing what the agent actually did in this phase",
  "files_touched": ["relative/path.js"],
  "decisions": ["notable choices or assumptions the agent made"],
  "problems": ["errors, failures, or things it struggled with"],
  "follow_ups": ["work it deliberately left undone or flagged for later"]
}

Rules:
- Every array may be empty. Do not invent entries to fill them.
- Report what the transcript shows, not what should ideally have happened.
- If the transcript is truncated in the middle, summarise what is visible and say so in what_changed.
- Keep each array entry to one short sentence.

--- BEGIN TRANSCRIPT ---
${transcript}
--- END TRANSCRIPT ---`;
}

function toStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .map(item => (typeof item === 'string' ? item.trim() : String(item ?? '').trim()))
      .filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

/**
 * Parse an agent's summary response into the section shape.
 *
 * A malformed response degrades to `{ raw }` rather than throwing — a rambling
 * agent should still leave the reviewer something readable.
 *
 * @param {string} rawOutput
 * @returns {{ what_changed: string, files_touched: string[], decisions: string[], problems: string[], follow_ups: string[], raw?: string }}
 */
function parseRunSummaryOutput(rawOutput) {
  const text = String(rawOutput || '').trim();
  const empty = {
    what_changed: '',
    files_touched: [],
    decisions: [],
    problems: [],
    follow_ups: []
  };

  if (!text) return { ...empty, raw: '' };

  let parsed = null;
  try {
    parsed = parseCodexDraftOutput(text);
  } catch (_) {
    parsed = null;
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ...empty, raw: text };
  }

  return {
    what_changed: typeof parsed.what_changed === 'string' ? parsed.what_changed.trim() : '',
    files_touched: toStringArray(parsed.files_touched),
    decisions: toStringArray(parsed.decisions),
    problems: toStringArray(parsed.problems),
    follow_ups: toStringArray(parsed.follow_ups)
  };
}

/**
 * Delete every run-output log file belonging to a ticket.
 *
 * @param {string} ticketId
 * @param {string} runOutputDir
 * @param {{ log?: Function, error?: Function }} [logger=console]
 * @returns {number} count of files removed
 */
function deleteTicketRunLogs(ticketId, runOutputDir, logger = console) {
  try {
    if (!ticketId || !fs.existsSync(runOutputDir)) return 0;
    const files = fs.readdirSync(runOutputDir).filter(f => f.startsWith(`${ticketId}__`));
    for (const file of files) {
      try {
        fs.unlinkSync(path.join(runOutputDir, file));
      } catch (_) {
        // Another process may have taken it already; nothing to do.
      }
    }
    if (files.length > 0) {
      (logger.log || console.log)(`[RunSummary] Removed ${files.length} log file(s) for ${ticketId}`);
    }
    return files.length;
  } catch (error) {
    (logger.error || console.error)(`[RunSummary] Failed to remove logs for ${ticketId}:`, error?.message);
    return 0;
  }
}

/**
 * Build the summariser.
 *
 * @param {Object} deps
 * @param {string} deps.projectRoot
 * @param {string} deps.runOutputDir
 * @param {Function} deps.resolveTemplateConfig - (projectRoot, agentId) => template
 * @param {Function} deps.readSummaryAgent - () => agent id
 * @param {Function} deps.readSummaryModel - () => model id or null
 * @param {Function} deps.getTicketById
 * @param {Function} deps.updateTicketFields - (ticketId, fields) => void
 * @param {Function} [deps.runDraftCommand]
 * @param {Function} [deps.now]
 * @param {Object} [deps.logger]
 */
function createRunSummarizer({
  projectRoot,
  runOutputDir,
  resolveTemplateConfig,
  readSummaryAgent,
  readSummaryModel,
  getTicketById,
  updateTicketFields,
  runDraftCommand = runCodexDraftCommand,
  now = () => new Date().toISOString(),
  logger = console
}) {
  /** ticketId → in-flight promise, so a re-entrant transition cannot double-spend. */
  const inFlight = new Map();

  async function summarizePhase({ ticket, phase, entries }) {
    const transcript = readPhaseTranscript(entries, projectRoot);
    if (!transcript.trim()) return null;

    const agentId = String(readSummaryAgent() || '').trim().toLowerCase() || 'codex';
    const template = resolveTemplateConfig(projectRoot, agentId);
    const modelId = String(readSummaryModel() || '').trim();
    const prompt = buildRunSummaryPrompt({
      ticket,
      phase,
      transcript: truncateForPrompt(transcript)
    });

    // Claude with --print takes its prompt on stdin, not as an argv entry.
    const useStdin = template.stdin !== undefined
      || (Array.isArray(template.args) && template.args.includes('--print'));

    const args = buildDraftArgsFromTemplate(
      template.args,
      useStdin ? null : prompt,
      projectRoot,
      modelId ? { modelId } : {}
    ).filter(a => a != null && a !== '');

    const { stdout } = await runDraftCommand({
      command: template.command,
      args,
      cwd: projectRoot,
      stdinData: useStdin ? prompt : null,
      timeoutMs: SUMMARY_TIMEOUT_MS
    });

    return {
      phase,
      label: PHASE_LABELS[phase] || phase,
      ...parseRunSummaryOutput(stdout)
    };
  }

  /**
   * Summarise every phase of a ticket, persist the result, then delete the logs.
   *
   * Resolves rather than rejects on failure: this runs detached from the status
   * transition and an unhandled rejection there would be invisible.
   *
   * @param {string} ticketId
   * @returns {Promise<{ status: string, sections?: Array, error?: string }>}
   */
  async function summarizeTicketRuns(ticketId) {
    if (inFlight.has(ticketId)) return inFlight.get(ticketId);

    const task = (async () => {
      const startedAt = now();
      try {
        const ticket = getTicketById(ticketId);
        if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

        const groups = groupRunsByPhase(ticket.run_log_index);
        if (groups.length === 0) {
          // Nothing to summarise — most likely a ticket that ran before the
          // manifest existed. Record it so the icon shows a real state.
          const summary = {
            status: 'unavailable',
            reason: 'No run logs were recorded for this ticket.',
            generated_at: now()
          };
          updateTicketFields(ticketId, { run_summary: summary });
          return summary;
        }

        const sections = [];
        for (const group of groups) {
          try {
            const section = await summarizePhase({ ticket, phase: group.phase, entries: group.entries });
            if (section) sections.push(section);
          } catch (error) {
            // One bad phase should not lose the others.
            sections.push({
              phase: group.phase,
              label: group.label,
              what_changed: '',
              files_touched: [],
              decisions: [],
              problems: [],
              follow_ups: [],
              error: error?.message || 'Summarisation failed'
            });
            (logger.error || console.error)(
              `[RunSummary] Phase ${group.phase} failed for ${ticketId}:`, error?.message
            );
          }
        }

        const summary = {
          status: 'ready',
          agent: String(readSummaryAgent() || '').trim().toLowerCase() || 'codex',
          started_at: startedAt,
          generated_at: now(),
          sections
        };
        updateTicketFields(ticketId, { run_summary: summary });
        (logger.log || console.log)(
          `[RunSummary] Summarised ${sections.length} phase(s) for ${ticketId}`
        );
        return summary;
      } catch (error) {
        const summary = {
          status: 'failed',
          started_at: startedAt,
          generated_at: now(),
          error: error?.message || 'Summarisation failed'
        };
        try {
          updateTicketFields(ticketId, { run_summary: summary });
        } catch (_) {
          // Ticket may have been archived mid-flight.
        }
        (logger.error || console.error)(`[RunSummary] Failed for ${ticketId}:`, error?.message);
        return summary;
      } finally {
        // Logs are deleted on every path — a failed summary must not leak them.
        deleteTicketRunLogs(ticketId, runOutputDir, logger);
        inFlight.delete(ticketId);
      }
    })();

    inFlight.set(ticketId, task);
    return task;
  }

  /** True while a ticket's summary job is running — the cleanup path checks this. */
  function isSummarizing(ticketId) {
    return inFlight.has(ticketId);
  }

  return { summarizeTicketRuns, isSummarizing };
}

/**
 * Reset summaries stranded in `generating` by an app quit, and drop their logs.
 *
 * Without this a ticket keeps a spinner forever, because the job that would
 * have cleared it died with the previous process.
 *
 * @param {Object} deps
 * @param {Function} deps.listTickets
 * @param {Function} deps.updateTicketFields
 * @param {string} deps.runOutputDir
 * @param {Function} [deps.now]
 * @param {Object} [deps.logger]
 * @returns {number} count of tickets reset
 */
function resetStaleRunSummaries({ listTickets, updateTicketFields, runOutputDir, now = () => new Date().toISOString(), logger = console }) {
  let reset = 0;
  try {
    const tickets = listTickets() || [];
    for (const ticket of tickets) {
      if (ticket?.run_summary?.status !== 'generating') continue;
      updateTicketFields(ticket.id, {
        run_summary: {
          status: 'failed',
          started_at: ticket.run_summary.started_at || null,
          generated_at: now(),
          error: 'Summarisation was interrupted by an application restart.'
        }
      });
      deleteTicketRunLogs(ticket.id, runOutputDir, logger);
      reset += 1;
    }
    if (reset > 0) {
      (logger.log || console.log)(`[RunSummary] Reset ${reset} interrupted summary job(s)`);
    }
  } catch (error) {
    (logger.error || console.error)('[RunSummary] Unable to reset stale summaries:', error?.message);
  }
  return reset;
}

module.exports = {
  PHASE_ORDER,
  PHASE_LABELS,
  HEAD_BUDGET_CHARS,
  TAIL_BUDGET_CHARS,
  resolveRunPhase,
  recordRunLogEntry,
  groupRunsByPhase,
  truncateForPrompt,
  readPhaseTranscript,
  buildRunSummaryPrompt,
  parseRunSummaryOutput,
  deleteTicketRunLogs,
  createRunSummarizer,
  resetStaleRunSummaries
};
