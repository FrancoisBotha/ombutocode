'use strict';

/**
 * `headless.js tickets create --epic <path> --assignee <tool[:model]>`
 *
 * Breaks an epic into tickets with the shared ticket-generation prompt. The
 * agent writes rows through `.ombutocode/tools/ticket-write.cjs`; this
 * command verifies the sentinel against the database, then enforces the
 * post-conditions the scheduler depends on regardless of what the agent
 * wrote: requested status, exact assignee object, epic `Status: TICKETS`.
 */

const fs = require('fs');
const path = require('path');

const {
  TICKETS_DONE_SENTINEL,
  TICKETS_FAILED_SENTINEL,
  TICKET_WRITE_TOOL_PATH,
  buildTicketPrompt,
  parseSentinel
} = require('../main/planningPrompts');
const { runUnattendedAgent, DEFAULT_TIMEOUTS_MS } = require('../main/unattendedAgentRun');
const { parseAssigneeSpec, validateAssignee, resolvePlanningAgent } = require('./agents');
const {
  scanSkillFiles,
  findSkillByName,
  readSkillContent,
  resolveEpicPath,
  readEpicStatus,
  updateEpicStatus
} = require('./epicFiles');
const { EXIT_OK, EXIT_FAILURE, EXIT_USAGE, EXIT_TIMEOUT } = require('./args');
const git = require('./gitUtil');

function normalizeEpicRef(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.?\//, '').trim().toLowerCase();
}

function assigneeEquals(actual, expected) {
  if (!actual || typeof actual !== 'object') return false;
  const keys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (keys.join(',') !== expectedKeys.join(',')) return false;
  return expectedKeys.every((k) => actual[k] === expected[k]);
}

/**
 * Pure verification: which tickets are new for this epic and which fields
 * need fixing to satisfy the requested status / assignee.
 */
function verifyTicketOutcome({ sentinel, before, after, epicRef, status, assignee }) {
  const beforeIds = before instanceof Set ? before : new Set(before);
  const wanted = normalizeEpicRef(epicRef);
  const wantedFile = path.basename(wanted);
  const newTickets = after.filter((t) => t?.id && !beforeIds.has(t.id));
  const forEpic = newTickets.filter((t) => {
    const ref = normalizeEpicRef(t.epic_ref);
    return ref === wanted || path.basename(ref) === wantedFile;
  });
  const strays = newTickets.filter((t) => !forEpic.includes(t)).map((t) => t.id);

  const fixes = [];
  for (const ticket of forEpic) {
    if (String(ticket.status || '').toLowerCase() !== status) {
      fixes.push({ id: ticket.id, field: 'status', from: ticket.status ?? null, to: status });
    }
    if (!assigneeEquals(ticket.assignee, assignee)) {
      fixes.push({ id: ticket.id, field: 'assignee', from: ticket.assignee ?? null, to: assignee });
    }
  }

  let reason = null;
  if (sentinel.state === 'failed') reason = `agent reported "${TICKETS_FAILED_SENTINEL}"`;
  else if (sentinel.state === 'missing') reason = `agent did not print "${TICKETS_DONE_SENTINEL}"`;
  else if (forEpic.length === 0) reason = `sentinel reported done but no new ticket with epic_ref ${epicRef} is in the database`;

  return { ok: reason === null, reason, tickets: forEpic, strays, fixes };
}

function listDbBackups(dataDir) {
  try {
    return new Set(fs.readdirSync(dataDir).filter((f) => f.startsWith('ombutocode.db.before-insert-')));
  } catch {
    return new Set();
  }
}

/**
 * @param {Object} ctx      boot context
 * @param {Object} options  parsed CLI options
 * @param {Object} [deps]   { runAgent, now } for tests
 */
async function runTicketsCreate(ctx, options, deps = {}) {
  const { runAgent = runUnattendedAgent, gitImpl = git, now = () => new Date() } = deps;
  const { paths, settingsStore, utils, backlogDb, ombutocodeDb, logger } = ctx;
  const projectRoot = paths.PROJECT_ROOT;
  const startedAt = now().toISOString();

  const fail = (exitCode, message, extra = {}) => ({
    ok: false,
    exitCode,
    error: message,
    agent: extra.agent || null,
    model: extra.model || null,
    tokens: extra.tokens || null,
    startedAt,
    finishedAt: now().toISOString(),
    result: { ok: false, error: message, ...extra.result }
  });

  if (!ctx.dbReady) return fail(EXIT_FAILURE, 'backlog database failed to open — see boot errors above');

  let epic;
  try {
    epic = resolveEpicPath(projectRoot, options.epic);
  } catch (error) {
    return fail(EXIT_USAGE, error.message);
  }

  const status = options.status === 'backlog' ? 'backlog' : 'todo';
  const agentsConfig = utils.readAgentsConfig();

  let assignee = null;
  if (options.assignee) {
    const check = validateAssignee(agentsConfig, parseAssigneeSpec(options.assignee));
    if (!check.ok) return fail(EXIT_USAGE, check.error, { result: { validTools: check.validTools, validModels: check.validModels } });
    assignee = check.assignee;
  } else if (status === 'todo') {
    return fail(EXIT_USAGE, '--assignee is required when tickets are written to todo.');
  }

  const planning = resolvePlanningAgent({
    config: agentsConfig,
    settingsStore,
    agent: options.agent || null,
    model: options.model || null
  });
  if (!planning.ok) return fail(EXIT_USAGE, planning.error);

  // ticket-write.cjs resolves sql.js relative to the project, not the app.
  const toolPath = path.join(projectRoot, TICKET_WRITE_TOOL_PATH);
  const sqlJsPath = path.join(projectRoot, '.ombutocode', 'src', 'node_modules', 'sql.js');
  if (!fs.existsSync(toolPath)) {
    return fail(EXIT_FAILURE, `ticket-write tool missing at ${toolPath} — the agent cannot write tickets`);
  }
  if (!fs.existsSync(sqlJsPath)) {
    return fail(EXIT_FAILURE, `${TICKET_WRITE_TOOL_PATH} requires ${sqlJsPath} (run "npm install" in .ombutocode/src of the project)`);
  }

  // Skill
  let skill = null;
  if (options.skill) {
    skill = findSkillByName(scanSkillFiles(paths.SKILLS_DIR), options.skill);
    if (!skill) return fail(EXIT_USAGE, `--skill "${options.skill}" not found under docs/Skills/`);
  } else {
    const ticketSkills = scanSkillFiles(paths.SKILLS_DIR, 'Ticket Generation');
    skill = findSkillByName(ticketSkills, 'ticket generation') || ticketSkills[0] || null;
    if (!skill) logger.warn('[tickets] No skill found in docs/Skills/Ticket Generation/ — running without a skill');
  }
  const skillContent = readSkillContent(skill);

  const closeout = String(options.closeout || 'all').toLowerCase();
  const prompt = buildTicketPrompt({
    epicPath: epic.docsRelative,
    skillContent,
    status,
    assignee,
    closeout
  });

  const dataDir = path.dirname(paths.OMBUTOCODE_DB_PATH);
  const backupsBefore = listDbBackups(dataDir);
  const beforeIds = new Set(utils.readBacklogData().tickets.map((t) => t.id));
  const timeoutMs = Number.isFinite(options.timeoutSec) ? options.timeoutSec * 1000 : DEFAULT_TIMEOUTS_MS.tickets;

  logger.log(`[tickets] epic=${epic.epicRef} agent=${planning.agent} model=${planning.model || '(default)'} assignee=${JSON.stringify(assignee)} status=${status} timeout=${Math.round(timeoutMs / 1000)}s`);

  const run = await runAgent({
    projectRoot,
    agent: planning.agent,
    modelId: planning.modelId,
    prompt,
    stage: 'tickets',
    timeoutMs,
    runOutputDir: paths.RUN_OUTPUT_DIR,
    appendAgentLog: utils.appendAgentLog,
    resolveTemplateConfig: ctx.resolveAgentTemplateConfig,
    logger
  });

  // The agent wrote through a separate process — pick up its rows before
  // anything in this process saves the in-memory copy back to disk.
  try {
    ombutocodeDb.reloadFromDisk();
  } catch (error) {
    logger.warn(`[tickets] reloadFromDisk failed: ${error.message}`);
  }

  const sentinel = parseSentinel(run.text, { done: TICKETS_DONE_SENTINEL, failed: TICKETS_FAILED_SENTINEL });
  const after = utils.readBacklogData().tickets;
  const verdict = verifyTicketOutcome({
    sentinel,
    before: beforeIds,
    after,
    epicRef: epic.epicRef,
    status,
    assignee: assignee || null
  });

  const base = {
    agent: planning.agent,
    model: planning.model,
    tokens: run.tokens,
    startedAt,
    finishedAt: now().toISOString()
  };
  const resultCommon = {
    epicPath: epic.epicRef,
    sentinel,
    runId: run.runId,
    log: run.log,
    durationMs: run.durationMs,
    tokens: run.tokens,
    exitCode: run.exitCode,
    agentState: run.state,
    skill: skill ? skill.name : null,
    assignee,
    status,
    strayTickets: verdict.strays
  };

  if (run.timedOut) {
    return { ...base, ok: false, exitCode: EXIT_TIMEOUT, error: `agent timed out after ${timeoutMs}ms`, result: { ok: false, error: 'timeout', ...resultCommon, tickets: verdict.tickets.map((t) => t.id) } };
  }
  if (!verdict.ok) {
    const error = run.error || verdict.reason;
    return { ...base, ok: false, exitCode: EXIT_FAILURE, error, result: { ok: false, error, ...resultCommon, tickets: verdict.tickets.map((t) => t.id) } };
  }

  // Post-conditions: requested status and exact assignee on every new ticket.
  const fixedUp = [];
  if (verdict.fixes.length > 0) {
    const byId = new Map();
    for (const fix of verdict.fixes) {
      if (!byId.has(fix.id)) byId.set(fix.id, {});
      byId.get(fix.id)[fix.field] = fix.to;
      fixedUp.push(fix);
    }
    for (const [id, fields] of byId) {
      backlogDb.updateTicketFields(id, fields);
      logger.log(`[tickets] fixed ${id}: ${Object.keys(fields).join(', ')}`);
    }
    ombutocodeDb.saveDb();
  }

  // Epic status → TICKETS
  let epicStatus = readEpicStatus(epic.absolute).toUpperCase();
  let epicStatusUpdated = false;
  if (epicStatus !== 'TICKETS') {
    updateEpicStatus(epic.absolute, 'TICKETS');
    epicStatusUpdated = true;
    epicStatus = 'TICKETS';
    logger.log(`[tickets] set ${epic.epicRef} Status: TICKETS`);
  }
  // Commit the status flip when the epic itself is tracked: build agents work
  // in worktrees and would otherwise read the epic in its last committed
  // (NEW) state, and a dirty tree gets in the way of the squash-merge stash.
  let epicStatusCommitted = false;
  if (epicStatusUpdated) {
    try {
      if (!gitImpl.isFileCommitted(projectRoot, epic.epicRef)) {
        const commitResult = gitImpl.commitFile(projectRoot, epic.epicRef, `docs: ${epic.fileName.replace(/\.md$/, '')} status TICKETS`);
        epicStatusCommitted = !!commitResult?.ok;
        if (epicStatusCommitted) logger.log(`[tickets] committed epic status change`);
      }
    } catch (error) {
      logger.warn(`[tickets] could not commit epic status change: ${error.message}`);
    }
  }

  // ticket-write leaves a pre-insert DB backup for the caller to remove once verified.
  const removedBackups = [];
  for (const name of listDbBackups(dataDir)) {
    if (backupsBefore.has(name)) continue;
    try {
      fs.unlinkSync(path.join(dataDir, name));
      removedBackups.push(name);
    } catch {
      // leave it — harmless
    }
  }

  const tickets = utils.readBacklogData().tickets
    .filter((t) => verdict.tickets.some((n) => n.id === t.id))
    .map((t) => ({
      id: t.id,
      title: t.title || '',
      status: t.status,
      dependencies: Array.isArray(t.dependencies) ? t.dependencies : [],
      assignee: t.assignee ?? null
    }));

  return {
    ...base,
    ok: true,
    exitCode: EXIT_OK,
    result: {
      ok: true,
      ...resultCommon,
      tickets,
      fixedUp,
      epicStatus,
      epicStatusUpdated,
      epicStatusCommitted,
      closeout,
      removedBackups
    }
  };
}

module.exports = { normalizeEpicRef, verifyTicketOutcome, runTicketsCreate };
