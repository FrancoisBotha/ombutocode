'use strict';

/**
 * `headless.js run [--until drained] [--max-seconds N] [--profile <name>]`
 *
 * Starts the scheduler exactly as the console does, then polls the backlog
 * until the pipeline drains (every in-flight ticket has reached review/done
 * and its squash-merge commit is reachable from HEAD), a ticket blocks, the
 * pipeline stalls, or the time budget runs out. Without a drain condition it
 * simply shows the legacy console board.
 *
 * Decision logic lives in runState.js (pure); this file is the wiring.
 */

const fs = require('fs');

const { persistSchedulerRunning } = require('./bootstrap');
const { runSchedulerConsole } = require('./console');
const {
  evaluateRunState,
  createRunTracker,
  DEFAULT_STALL_MS,
  DEFAULT_MAX_MERGE_REVERTS,
  OUTCOME_EXIT_CODES
} = require('./runState');
const git = require('./gitUtil');
const { EXIT_FAILURE } = require('./args');

const DEFAULT_POLL_SECONDS = 3;
const DISPATCH_NUDGE_MS = 30_000;
const PROGRESS_MIN_MS = 5_000;

/**
 * Has this ticket's merge landed on HEAD? Uses the sha the callbacks record
 * on the ticket (`merge_commit_sha`); falls back to the `[TICKET-ID]` squash
 * commit subject, then to "the ticket branch was deleted after merge".
 * Results are memoised per ticket + sha because git is not free.
 */
function createMergeLandedCheck(projectRoot, gitImpl = git) {
  const cache = new Map();
  return function mergeLanded(ticket) {
    if (!ticket?.id) return null;
    const sha = ticket.merge_commit_sha || null;
    const key = `${ticket.id}@${sha || ''}`;
    if (cache.has(key)) return cache.get(key);

    let landed;
    if (sha) {
      landed = gitImpl.isAncestorOfHead(projectRoot, sha);
    } else if (gitImpl.findSquashCommitForTicket(projectRoot, ticket.id)) {
      landed = true;
    } else {
      landed = !gitImpl.branchExists(projectRoot, `ticket/${ticket.id}`);
    }
    // Only cache positives — a merge that has not landed yet may land later.
    if (landed) cache.set(key, landed);
    return landed;
  };
}

/** Parse the agent run log (JSONL) from a byte offset onwards. */
function readAgentLogEntries(logPath, fromOffset = 0) {
  try {
    if (!fs.existsSync(logPath)) return [];
    const fd = fs.openSync(logPath, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      if (size <= fromOffset) return [];
      const buffer = Buffer.alloc(size - fromOffset);
      fs.readSync(fd, buffer, 0, buffer.length, fromOffset);
      return buffer.toString('utf-8').split('\n').filter(Boolean).map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return [];
  }
}

function fileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

/**
 * Phase per run id from the scheduler's own `ticket.status_changed` events
 * (details.from is the status the run was dispatched in). This is the most
 * reliable source: the agent run log carries no phase, and short test/eval
 * runs can finish between two polls.
 */
function readRunPhasesFromSchedulerLogs(logsDb, runIds) {
  const phases = new Map();
  if (!logsDb || typeof logsDb.readLogs !== 'function' || runIds.size === 0) return phases;
  let logs = [];
  try {
    logs = logsDb.readLogs({ event_type: 'ticket.status_changed', limit: 5000 }).logs || [];
  } catch {
    return phases;
  }
  for (const entry of logs) {
    if (!entry?.run_id || !runIds.has(entry.run_id) || phases.has(entry.run_id)) continue;
    let details = entry.details;
    if (typeof details === 'string') {
      try { details = JSON.parse(details); } catch { details = null; }
    }
    const from = String(details?.from || '').toLowerCase();
    const phase = from === 'test' ? 'test'
      : from === 'eval' ? 'eval'
        : from === 'merging' ? 'merge_resolve'
          : (from === 'in_progress' || from === 'building' || from === 'todo') ? 'impl'
            : null;
    if (phase) phases.set(entry.run_id, phase);
  }
  return phases;
}

/**
 * Build the per-ticket manifest result from the final backlog, the tracker
 * and the agent-run log entries produced during this run.
 */
function buildTicketResults({ tickets, tracker, logEntries, mergeLanded, logsDb = null }) {
  const finishedByRun = new Map();
  const startedByRun = new Map();
  for (const entry of logEntries) {
    if (!entry?.runId || !entry.ticketId) continue;
    if (entry.event === 'run_started') startedByRun.set(entry.runId, entry);
    if (entry.event === 'run_finished') finishedByRun.set(entry.runId, entry);
  }

  const allRunIds = new Set([...startedByRun.keys(), ...finishedByRun.keys()]);
  const loggedPhases = readRunPhasesFromSchedulerLogs(logsDb, allRunIds);

  const results = [];
  for (const id of tracker.trackedIds) {
    const ticket = tickets.find((t) => t.id === id);
    const record = tracker.getRecord(id) || {};
    const phaseByRun = new Map((ticket?.run_log_index || []).map((e) => [e.runId, e.phase]));
    const phaseFor = (runId) => phaseByRun.get(runId) || loggedPhases.get(runId) || tracker.phaseForRun(runId) || 'impl';
    const runs = [];
    const seen = new Set();
    for (const [runId, finished] of finishedByRun) {
      if (finished.ticketId !== id) continue;
      seen.add(runId);
      const started = startedByRun.get(runId);
      runs.push({
        runId,
        phase: phaseFor(runId),
        agent: finished.agentName || started?.agentName || null,
        state: finished.state || null,
        startedAt: finished.startedAt || started?.startedAt || null,
        finishedAt: finished.finishedAt || finished.ts || null,
        durationMs: Number.isFinite(finished.durationMs) ? finished.durationMs : null,
        exitCode: Number.isInteger(finished.exitCode) ? finished.exitCode : null
      });
    }
    for (const [runId, started] of startedByRun) {
      if (started.ticketId !== id || seen.has(runId)) continue;
      runs.push({
        runId,
        phase: phaseFor(runId),
        agent: started.agentName || null,
        state: 'unfinished',
        startedAt: started.startedAt || null,
        finishedAt: null,
        durationMs: null,
        exitCode: null
      });
    }
    runs.sort((a, b) => String(a.startedAt || '').localeCompare(String(b.startedAt || '')));

    const finalStatus = ticket?.status || null;
    results.push({
      id,
      title: ticket?.title || '',
      finalStatus,
      dependencies: Array.isArray(ticket?.dependencies) ? ticket.dependencies : [],
      assignee: ticket?.assignee ?? null,
      failCount: Number(ticket?.fail_count) || 0,
      mergeCommitSha: ticket?.merge_commit_sha || null,
      mergeLanded: finalStatus === 'review' && ticket ? mergeLanded(ticket) : null,
      startedAt: record.firstBuildingAt || record.firstInFlightAt || null,
      finishedAt: record.finishedAt || null,
      runs
    });
  }
  return results;
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (signal) signal.once('wake', () => { clearTimeout(timer); resolve(); });
  });
}

/**
 * @param {Object} ctx      boot context
 * @param {Object} options  parsed CLI options
 * @param {Object} [deps]   { gitImpl, now, progress } for tests
 */
async function runSchedulerUntilDrained(ctx, options, deps = {}) {
  const { gitImpl = git, now = () => new Date(), progress = (line) => process.stderr.write(`${line}\n`) } = deps;
  const { paths, scheduler, utils, settingsStore, logger } = ctx;
  const projectRoot = paths.PROJECT_ROOT;

  const pollMs = Math.max(500, (Number.isFinite(options.pollSeconds) ? options.pollSeconds : DEFAULT_POLL_SECONDS) * 1000);
  const stallMs = Number.isFinite(options.stallMinutes) ? options.stallMinutes * 60 * 1000 : DEFAULT_STALL_MS;
  const maxMergeReverts = Number.isFinite(options.maxMergeReverts) ? options.maxMergeReverts : DEFAULT_MAX_MERGE_REVERTS;
  const maxSeconds = Number.isFinite(options.maxSeconds) && options.maxSeconds > 0 ? options.maxSeconds : null;
  const progressEveryMs = Math.max(PROGRESS_MIN_MS, (Number(settingsStore.get('app_refresh_interval', 30)) || 30) * 1000);

  const startedAtDate = now();
  const startedAt = startedAtDate.toISOString();
  const logOffset = fileSize(paths.AGENT_LOG_PATH);
  const headBefore = gitImpl.headSha(projectRoot);
  const mergeLanded = createMergeLandedCheck(projectRoot, gitImpl);
  const tracker = createRunTracker({ now });

  const { EventEmitter } = require('events');
  const wake = new EventEmitter();
  let interrupted = null;
  const onSignal = (signal) => {
    if (interrupted) return;
    interrupted = signal;
    logger.log(`\n[run] Received ${signal}, stopping scheduler...`);
    wake.emit('wake');
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));

  scheduler.start();
  logger.log('[Scheduler] Started in headless mode');
  persistSchedulerRunning(scheduler, true);

  let decision = { outcome: 'continue', exitCode: null, reason: 'starting', details: {} };
  let lastProgressAt = 0;
  let lastNudgeAt = startedAtDate.getTime();
  let lastFingerprintChangeAt = tracker.lastChangeAtMs;
  let polls = 0;

  try {
    for (;;) {
      const nowMs = now().getTime();
      const tickets = ctx.dbReady ? utils.readBacklogData().tickets : [];
      const status = scheduler.getStatus();
      tracker.observe(tickets, status.activeRuns || []);
      polls += 1;

      if (interrupted) {
        decision = { outcome: 'interrupted', exitCode: OUTCOME_EXIT_CODES.interrupted, reason: `interrupted by ${interrupted}`, details: {} };
        break;
      }

      decision = evaluateRunState({
        tickets,
        activeRuns: status.activeRuns || [],
        agentPauses: status.agentPauses || [],
        trackedIds: tracker.trackedIds,
        mergeLanded,
        nowMs,
        startedAtMs: startedAtDate.getTime(),
        lastChangeAtMs: tracker.lastChangeAtMs,
        maxSeconds,
        stallMs,
        mergeRevertCount: tracker.mergeRevertCount,
        maxMergeReverts
      });

      const changed = tracker.lastChangeAtMs !== lastFingerprintChangeAt;
      lastFingerprintChangeAt = tracker.lastChangeAtMs;
      if (changed || nowMs - lastProgressAt >= progressEveryMs) {
        lastProgressAt = nowMs;
        const counts = {};
        for (const t of tickets) counts[t.status] = (counts[t.status] || 0) + 1;
        const countText = ['todo', 'building', 'in_progress', 'test', 'eval', 'merging', 'review']
          .filter((s) => counts[s]).map((s) => `${s}=${counts[s]}`).join(' ');
        const elapsed = Math.round((nowMs - startedAtDate.getTime()) / 1000);
        progress(`[run +${elapsed}s] ${status.status} runs=${(status.activeRuns || []).length} ${countText || 'no tickets'} | ${decision.reason}`);
      }

      if (decision.outcome !== 'continue') break;

      // The scheduler is event-driven; nudge it when idle so an expired
      // provider pause or a freshly unblocked dependency gets picked up.
      if ((status.activeRuns || []).length === 0 && nowMs - lastNudgeAt >= DISPATCH_NUDGE_MS) {
        lastNudgeAt = nowMs;
        try { scheduler.dispatch({ reason: 'cli-poll' }); } catch (error) { logger.warn(`[run] dispatch nudge failed: ${error.message}`); }
      }

      await sleep(pollMs, wake);
    }
  } finally {
    try { scheduler.stop(); } catch (error) { logger.warn(`[run] scheduler.stop failed: ${error.message}`); }
    persistSchedulerRunning(scheduler, false);
  }

  const finishedAtDate = now();
  const tickets = ctx.dbReady ? utils.readBacklogData().tickets : [];
  const logEntries = readAgentLogEntries(paths.AGENT_LOG_PATH, logOffset);
  const ticketResults = buildTicketResults({
    tickets,
    tracker,
    logEntries,
    mergeLanded,
    logsDb: ctx.dbReady ? require('../main/logsDb') : null
  });
  const exitCode = decision.exitCode ?? EXIT_FAILURE;

  const result = {
    ok: decision.outcome === 'drained',
    outcome: decision.outcome,
    reason: decision.reason,
    details: decision.details,
    exitCode,
    startedAt,
    finishedAt: finishedAtDate.toISOString(),
    durationMs: finishedAtDate.getTime() - startedAtDate.getTime(),
    polls,
    headBefore,
    headAfter: gitImpl.headSha(projectRoot),
    mergeReverts: tracker.mergeRevertCount,
    executionOrder: tracker.executionOrder,
    tickets: ticketResults,
    limits: { maxSeconds, stallMs, maxMergeReverts, pollMs }
  };

  return {
    ok: result.ok,
    exitCode,
    error: result.ok ? null : decision.reason,
    agent: null,
    model: null,
    tokens: null,
    startedAt,
    finishedAt: result.finishedAt,
    result
  };
}

/** Legacy console mode: identical to `node headless.js` with no subcommand. */
function runSchedulerConsoleMode(ctx) {
  runSchedulerConsole(ctx);
  return new Promise(() => {}); // the console owns the process lifetime
}

module.exports = {
  DEFAULT_POLL_SECONDS,
  createMergeLandedCheck,
  readAgentLogEntries,
  readRunPhasesFromSchedulerLogs,
  buildTicketResults,
  runSchedulerUntilDrained,
  runSchedulerConsoleMode
};
