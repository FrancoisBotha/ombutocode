'use strict';

/**
 * `headless.js epic create --input <file>`
 *
 * Turns a reference specification into exactly one epic in docs/Epics/ using
 * the unattended epic prompt, verifies the sentinel against the file system,
 * and makes sure the epic is committed (agents build in worktrees and cannot
 * see uncommitted files).
 */

const fs = require('fs');
const path = require('path');

const {
  EPIC_DONE_SENTINEL,
  EPIC_FAILED_SENTINEL,
  selectEpicSkill,
  buildEpicPrompt,
  parseSentinel
} = require('../main/planningPrompts');
const { runUnattendedAgent, DEFAULT_TIMEOUTS_MS } = require('../main/unattendedAgentRun');
const { resolvePlanningAgent } = require('./agents');
const {
  toPosix,
  scanSkillFiles,
  findSkillByName,
  readSkillContent,
  findDefaultContextDocs,
  listExistingEpics,
  snapshotEpicFiles
} = require('./epicFiles');
const git = require('./gitUtil');
const { EXIT_OK, EXIT_FAILURE, EXIT_USAGE, EXIT_TIMEOUT } = require('./args');

/**
 * Pure verification: given the sentinel and the before/after epic file sets,
 * decide which file (if any) is the new epic.
 */
function verifyEpicOutcome({ sentinel, before, after }) {
  const newFiles = [...after].filter((name) => !before.has(name)).sort();
  if (sentinel.state !== 'done') {
    return {
      ok: false,
      epicFile: null,
      newFiles,
      reason: sentinel.state === 'failed'
        ? `agent reported "${EPIC_FAILED_SENTINEL}"`
        : `agent did not print "${EPIC_DONE_SENTINEL}"`
    };
  }
  const named = sentinel.path ? path.basename(sentinel.path.replace(/\\/g, '/')) : null;
  if (named && after.has(named) && !before.has(named)) {
    return { ok: true, epicFile: named, newFiles, reason: null };
  }
  if (newFiles.length === 1) {
    return { ok: true, epicFile: newFiles[0], newFiles, reason: null };
  }
  if (newFiles.length === 0) {
    return { ok: false, epicFile: null, newFiles, reason: 'sentinel reported done but no new epic file appeared in docs/Epics/' };
  }
  return {
    ok: false,
    epicFile: null,
    newFiles,
    reason: `sentinel reported done but ${newFiles.length} new files appeared and none matches the sentinel path`
  };
}

/**
 * @param {Object} ctx      boot context
 * @param {Object} options  parsed CLI options
 * @param {Object} [deps]   { runAgent, gitImpl, now } for tests
 */
async function runEpicCreate(ctx, options, deps = {}) {
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

  // Reference spec: project-relative or absolute, must exist.
  const inputAbsolute = path.isAbsolute(options.input) ? options.input : path.resolve(projectRoot, options.input);
  if (!fs.existsSync(inputAbsolute) || !fs.statSync(inputAbsolute).isFile()) {
    return fail(EXIT_USAGE, `--input file not found: ${inputAbsolute}`);
  }
  const referenceFile = toPosix(path.relative(projectRoot, inputAbsolute)).startsWith('..')
    ? toPosix(inputAbsolute)
    : toPosix(path.relative(projectRoot, inputAbsolute));

  // Planning agent + model
  const agentsConfig = utils.readAgentsConfig();
  const planning = resolvePlanningAgent({
    config: agentsConfig,
    settingsStore,
    agent: options.agent || null,
    model: options.model || null
  });
  if (!planning.ok) return fail(EXIT_USAGE, planning.error);

  // Skill selection
  const epicSkills = scanSkillFiles(paths.SKILLS_DIR, 'Epics');
  let skill = null;
  if (options.skill) {
    skill = findSkillByName(scanSkillFiles(paths.SKILLS_DIR), options.skill);
    if (!skill) return fail(EXIT_USAGE, `--skill "${options.skill}" not found under docs/Skills/`);
  } else {
    skill = selectEpicSkill(epicSkills, { mode: 'unattended' });
    if (!skill) {
      skill = selectEpicSkill(epicSkills, { mode: 'bulk' });
      if (skill) {
        logger.warn(`[epic] No "Epic Generation - Unattended" skill in docs/Skills/Epics/ — falling back to ${skill.name}`);
      } else {
        logger.warn('[epic] No epic generation skill found in docs/Skills/Epics/ — running without a skill');
      }
    }
  }
  const skillContent = readSkillContent(skill);

  const existingEpics = listExistingEpics(paths.EPICS_DIR);
  const defaults = findDefaultContextDocs(paths.DOCS_DIR);
  const commit = options.noCommit !== true;

  const prompt = buildEpicPrompt({
    mode: 'unattended',
    referenceFile,
    skillContent,
    existingEpics,
    commit,
    prd: defaults.prd,
    arch: defaults.arch,
    styleGuide: defaults.styleGuide,
    codeMap: defaults.codeMap
  });

  fs.mkdirSync(paths.EPICS_DIR, { recursive: true });
  const before = snapshotEpicFiles(paths.EPICS_DIR);
  const timeoutMs = Number.isFinite(options.timeoutSec) ? options.timeoutSec * 1000 : DEFAULT_TIMEOUTS_MS.epic;

  logger.log(`[epic] agent=${planning.agent} model=${planning.model || '(default)'} skill=${skill ? skill.name : '(none)'} input=${referenceFile} timeout=${Math.round(timeoutMs / 1000)}s`);

  const run = await runAgent({
    projectRoot,
    agent: planning.agent,
    modelId: planning.modelId,
    prompt,
    stage: 'epic',
    timeoutMs,
    runOutputDir: paths.RUN_OUTPUT_DIR,
    appendAgentLog: utils.appendAgentLog,
    resolveTemplateConfig: ctx.resolveAgentTemplateConfig,
    logger
  });

  const sentinel = parseSentinel(run.text, { done: EPIC_DONE_SENTINEL, failed: EPIC_FAILED_SENTINEL });
  const after = snapshotEpicFiles(paths.EPICS_DIR);
  const verdict = verifyEpicOutcome({ sentinel, before, after });

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
    referenceFile,
    skill: skill ? skill.name : null,
    newFiles: verdict.newFiles
  };

  if (run.timedOut) {
    return { ...base, ok: false, exitCode: EXIT_TIMEOUT, error: `agent timed out after ${timeoutMs}ms`, result: { ok: false, error: 'timeout', ...resultCommon } };
  }
  if (!verdict.ok) {
    const error = run.error || verdict.reason;
    return { ...base, ok: false, exitCode: EXIT_FAILURE, error, result: { ok: false, error, ...resultCommon } };
  }

  const epicPath = `docs/Epics/${verdict.epicFile}`;
  const epicStem = verdict.epicFile.replace(/\.md$/i, '');

  // Commit verification / fix-up
  let committed = false;
  let committedBy = null;
  let commitSha = null;
  if (commit) {
    if (gitImpl.isFileCommitted(projectRoot, epicPath)) {
      committed = true;
      committedBy = 'agent';
      commitSha = gitImpl.headSha(projectRoot);
    } else {
      const commitResult = gitImpl.commitFile(projectRoot, epicPath, `docs: add ${epicStem}`);
      if (commitResult.ok) {
        committed = true;
        committedBy = 'cli';
        commitSha = commitResult.sha;
        logger.log(`[epic] agent left ${epicPath} uncommitted — committed as "docs: add ${epicStem}"`);
      } else {
        logger.warn(`[epic] failed to commit ${epicPath}: ${commitResult.output}`);
      }
    }
  }

  return {
    ...base,
    ok: true,
    exitCode: EXIT_OK,
    result: {
      ok: true,
      epicPath,
      epicStem,
      committed,
      committedBy,
      commitSha,
      ...resultCommon
    }
  };
}

module.exports = { verifyEpicOutcome, runEpicCreate };
