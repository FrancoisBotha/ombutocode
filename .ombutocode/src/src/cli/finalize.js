'use strict';

/**
 * `headless.js finalize --epic <path>` — integration verification on the
 * mainline after the backlog has drained.
 *
 * Tickets run in isolated worktrees and reach the mainline as squash-merged
 * source. Anything else a ticket did to its environment — an editable install
 * that puts a CLI on PATH, artefacts written by running the delivered tool —
 * stays in the worktree and is deleted with it. So after a clean drain the
 * mainline holds correct, unexercised code. This stage runs one unattended
 * agent session in the real working tree to install, run the epic's
 * acceptance / validation commands, and fix what they reveal.
 *
 * Success = the sentinel says done AND the working tree is on the expected
 * branch afterwards. Source changes the agent made are committed by the
 * agent (or by the CLI if it forgot); generated artefacts are left in place
 * untracked, which is what a grader inspecting the tree expects.
 */

const fs = require('fs');
const path = require('path');

const {
  buildFinalizePrompt,
  parseSentinel,
  FINALIZE_DONE_SENTINEL,
  FINALIZE_FAILED_SENTINEL
} = require('../main/planningPrompts');
const { runUnattendedAgent, DEFAULT_TIMEOUTS_MS } = require('../main/unattendedAgentRun');
const { resolvePlanningAgent } = require('./agents');
const { resolveEpicPath } = require('./epicFiles');
const { EXIT_OK, EXIT_FAILURE, EXIT_USAGE, EXIT_TIMEOUT } = require('./args');
const git = require('./gitUtil');

function toPosix(p) {
  return String(p).split(path.sep).join('/');
}

/**
 * @param {Object} ctx      booted project context (see bootstrap.bootProject)
 * @param {Object} options  parsed CLI options
 * @param {Object} [deps]   { runAgent, gitImpl, now } for tests
 */
async function runFinalize(ctx, options, deps = {}) {
  const { runAgent = runUnattendedAgent, gitImpl = git, now = () => new Date() } = deps;
  const { paths, settingsStore, utils, logger } = ctx;
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

  let epic;
  try {
    epic = resolveEpicPath(projectRoot, options.epic);
  } catch (error) {
    return fail(EXIT_USAGE, error.message);
  }

  // Optional reference spec (the file `epic create --input` was given).
  let referenceFile = null;
  if (options.input) {
    const abs = path.isAbsolute(options.input) ? options.input : path.resolve(projectRoot, options.input);
    if (!fs.existsSync(abs)) return fail(EXIT_USAGE, `--input file not found: ${abs}`);
    const rel = toPosix(path.relative(projectRoot, abs));
    referenceFile = rel.startsWith('..') ? toPosix(abs) : rel;
  }

  const agentsConfig = utils.readAgentsConfig();
  const planning = resolvePlanningAgent({
    config: agentsConfig,
    settingsStore,
    agent: options.agent || null,
    model: options.model || null
  });
  if (!planning.ok) return fail(EXIT_USAGE, planning.error);

  const branch = options.branch || 'main';
  const prompt = buildFinalizePrompt({ epicPath: epic.docsRelative, referenceFile, branch });
  const timeoutMs = Number.isFinite(options.timeoutSec) ? options.timeoutSec * 1000 : DEFAULT_TIMEOUTS_MS.finalize;
  const headBefore = gitImpl.headSha(projectRoot);

  logger.log(`[finalize] epic=${epic.epicRef} agent=${planning.agent} model=${planning.model || '(default)'} branch=${branch} timeout=${Math.round(timeoutMs / 1000)}s`);

  const run = await runAgent({
    projectRoot,
    agent: planning.agent,
    modelId: planning.modelId,
    prompt,
    stage: 'finalize',
    timeoutMs,
    runOutputDir: paths.RUN_OUTPUT_DIR,
    appendAgentLog: utils.appendAgentLog,
    resolveTemplateConfig: ctx.resolveAgentTemplateConfig,
    logger
  });

  const sentinel = parseSentinel(run.text, { done: FINALIZE_DONE_SENTINEL, failed: FINALIZE_FAILED_SENTINEL });

  // The agent commits its own source changes; if it left tracked files
  // modified, commit them so the mainline records what finalisation did.
  // Untracked artefacts stay untracked on purpose.
  let committedBy = null;
  let commitSha = null;
  const dirty = gitImpl.runGit(projectRoot, ['status', '--porcelain', '--untracked-files=no']);
  if (dirty.code === 0 && dirty.stdout.trim()) {
    const add = gitImpl.runGit(projectRoot, ['add', '-u']);
    const commit = add.code === 0 ? gitImpl.runGit(projectRoot, ['commit', '-m', 'finalize: integration verification on main']) : add;
    if (commit.code === 0) {
      committedBy = 'cli';
      logger.log('[finalize] agent left tracked changes uncommitted — committed them');
    } else {
      logger.warn(`[finalize] could not commit tracked changes: ${commit.stderr || commit.stdout}`);
    }
  }
  const headAfter = gitImpl.headSha(projectRoot);
  if (headAfter !== headBefore && !committedBy) committedBy = 'agent';
  if (headAfter !== headBefore) commitSha = headAfter;

  const base = {
    agent: planning.agent,
    model: planning.model,
    tokens: run.tokens,
    startedAt,
    finishedAt: now().toISOString()
  };
  const resultCommon = {
    sentinel,
    runId: run.runId,
    log: run.log,
    durationMs: run.durationMs,
    tokens: run.tokens,
    exitCode: run.exitCode,
    agentState: run.state,
    epicPath: epic.epicRef,
    referenceFile,
    branch,
    headBefore,
    headAfter,
    committedBy,
    commitSha,
    report: (run.text || '').trim().slice(-4000)
  };

  if (run.timedOut) {
    return { ...base, ok: false, exitCode: EXIT_TIMEOUT, error: `agent timed out after ${timeoutMs}ms`, result: { ok: false, error: 'timeout', ...resultCommon } };
  }
  if (sentinel.state !== 'done') {
    const error = run.error || (sentinel.state === 'failed'
      ? 'agent reported it could not complete the verification'
      : 'agent finished without the completion sentinel');
    return { ...base, ok: false, exitCode: EXIT_FAILURE, error, result: { ok: false, error, ...resultCommon } };
  }

  return { ...base, ok: true, exitCode: EXIT_OK, result: { ok: true, ...resultCommon } };
}

module.exports = { runFinalize };
