'use strict';

/**
 * Shared Node-only boot for the headless entry points.
 *
 * `headless.js` used to open the database, wire the settings store, agent
 * runtime and scheduler inline. The CLI subcommands (`epic create`,
 * `tickets create`, `run`, `status`) need exactly the same wiring, so it lives
 * here and both the legacy scheduler console and the subcommands call
 * `bootProject()`.
 *
 * Nothing in here starts the scheduler — callers decide whether to.
 */

const path = require('path');
const fs = require('fs');

// src/cli → src → .ombutocode/src → .ombutocode → repo root
const APP_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

// codingagents.yml per-tool fields a benchmark profile may override in memory.
const AGENT_OVERRIDE_KEYS = [
  'cooldown_minutes',
  'rolling_window_hours',
  'rate_limit_cooldown_minutes',
  'max_concurrent',
  'budget_limit',
  'enabled'
];

/**
 * Resolve the project root the way headless.js always has:
 *   explicit path → OMBUTOCODE_PROJECT_ROOT → cwd with .ombutocode/.git → app root.
 *
 * @param {{ explicit?: string|null, cwd?: string, env?: Object, appRoot?: string }} [options]
 */
function resolveProjectRoot({ explicit = null, cwd = process.cwd(), env = process.env, appRoot = APP_ROOT } = {}) {
  if (explicit && !String(explicit).startsWith('-')) {
    const resolved = path.resolve(cwd, String(explicit));
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      return resolved;
    }
    throw new Error(`Project root is not a directory: ${explicit}`);
  }
  if (env.OMBUTOCODE_PROJECT_ROOT && fs.existsSync(env.OMBUTOCODE_PROJECT_ROOT)) {
    return path.resolve(env.OMBUTOCODE_PROJECT_ROOT);
  }
  if (cwd !== appRoot && (fs.existsSync(path.join(cwd, '.ombutocode')) || fs.existsSync(path.join(cwd, '.git')))) {
    return cwd;
  }
  return appRoot;
}

/**
 * Every path constant the runtime modules need, derived from the project root.
 */
function buildProjectPaths(projectRoot) {
  const ombutocodeDir = path.join(projectRoot, '.ombutocode');
  return {
    PROJECT_ROOT: projectRoot,
    OMBUTOCODE_DIR: ombutocodeDir,
    BACKLOG_PATH: path.join(ombutocodeDir, 'planning', 'backlog.yml'),
    ARCHIVE_PATH: path.join(ombutocodeDir, 'planning', 'archive.yml'),
    ARCHIVE_DB_PATH: path.join(ombutocodeDir, 'planning', 'archive.db'),
    REQUESTS_DB_PATH: path.join(ombutocodeDir, 'data', 'requests.db'),
    OMBUTOCODE_DB_PATH: path.join(ombutocodeDir, 'data', 'ombutocode.db'),
    AGENTS_PATH: path.join(ombutocodeDir, 'codingagents', 'codingagents.yml'),
    AGENT_LOG_DIR: path.join(ombutocodeDir, 'logs'),
    AGENT_LOG_PATH: path.join(ombutocodeDir, 'logs', 'codingagent-runs.jsonl'),
    RUN_OUTPUT_DIR: path.join(ombutocodeDir, 'run-output'),
    TICKETS_DIR: path.join(ombutocodeDir, 'data', 'tickets'),
    DOCS_DIR: path.join(projectRoot, 'docs'),
    EPICS_DIR: path.join(projectRoot, 'docs', 'Epics'),
    SKILLS_DIR: path.join(projectRoot, 'docs', 'Skills'),
    MANIFEST_PATH: path.join(ombutocodeDir, 'run-manifest.json'),
    PROFILES_DIR: path.join(ombutocodeDir, 'profiles')
  };
}

/**
 * Wrap a settings store so a set of keys read from an in-memory override map
 * instead of disk/env. `set`/`delete` still go to the real store — the
 * overrides are never persisted.
 */
function applySettingsOverrides(store, overrides) {
  if (!overrides || typeof overrides !== 'object' || Object.keys(overrides).length === 0) {
    return store;
  }
  const map = { ...overrides };
  return {
    get(key, defaultValue) {
      if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
      return store.get(key, defaultValue);
    },
    set: (key, value) => store.set(key, value),
    delete: (key) => store.delete(key),
    overrides: map
  };
}

/**
 * Wrap `readAgentsConfig` so every tool carries the profile's overrides
 * (cooldowns, concurrency, ...). Only known per-tool keys are applied.
 */
function applyAgentOverrides(readAgentsConfig, overrides) {
  if (!overrides || typeof overrides !== 'object' || Object.keys(overrides).length === 0) {
    return readAgentsConfig;
  }
  const patch = {};
  for (const key of AGENT_OVERRIDE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) patch[key] = overrides[key];
  }
  return function readAgentsConfigWithOverrides() {
    const config = readAgentsConfig();
    const tools = Array.isArray(config?.tools) ? config.tools : [];
    return { ...config, tools: tools.map((tool) => ({ ...tool, ...patch })) };
  };
}

/**
 * Open the database, settings, agent runtime and scheduler for a project.
 *
 * @param {Object} options
 * @param {string} options.projectRoot
 * @param {string} [options.appRoot]
 * @param {Object} [options.settingsOverrides]  in-memory settings (benchmark profile)
 * @param {Object} [options.agentOverrides]     in-memory codingagents.yml tool fields
 * @param {number} [options.evalPostMergeCooldownMs] scheduler post-merge eval cooldown
 * @param {Object} [options.logger]             console-like; boot messages go here
 * @returns {Promise<Object>} the boot context
 */
async function bootProject(options = {}) {
  const {
    projectRoot,
    appRoot = APP_ROOT,
    settingsOverrides = null,
    agentOverrides = null,
    evalPostMergeCooldownMs = undefined,
    logger = console
  } = options;

  if (!projectRoot) throw new Error('bootProject: projectRoot is required');
  const paths = buildProjectPaths(projectRoot);

  // Settings (file-based, replaces electron-store)
  const { createHeadlessSettings } = require('../main/headlessSettings');
  const settingsStore = applySettingsOverrides(createHeadlessSettings(paths.OMBUTOCODE_DIR), settingsOverrides);

  // Shared utility functions
  const {
    NOTE_OUTPUT_LIMIT,
    shorten,
    formatCommandLine,
    appendTicketNote,
    summarizeTrialMergeFailure,
    summarizeSquashMergeFailure,
    createUtilities,
    setDbModules
  } = require('../main/coreUtilities');

  const utils = createUtilities({
    projectRoot: paths.PROJECT_ROOT,
    backlogPath: paths.BACKLOG_PATH,
    agentsPath: paths.AGENTS_PATH,
    agentLogDir: paths.AGENT_LOG_DIR,
    agentLogPath: paths.AGENT_LOG_PATH,
    runOutputDir: paths.RUN_OUTPUT_DIR
  });
  utils.readAgentsConfig = applyAgentOverrides(utils.readAgentsConfig, agentOverrides);

  // Ensure .ombutocode structure
  const { ensureOmbutocodeStructure } = require('../main/projectInit');
  try {
    ensureOmbutocodeStructure(paths.PROJECT_ROOT, appRoot);
    logger.log('[Init] .ombutocode/ structure verified at', paths.PROJECT_ROOT);
  } catch (initError) {
    logger.error('[Init] Failed to initialize .ombutocode/ structure:', initError.message);
  }

  // Initialize SQLite databases
  const ombutocodeDb = require('../main/ombutocodeDb');
  const backlogDb = require('../main/backlogDb');
  const { setArchiveDb } = require('../main/backlogOperations');
  const { migrateFromYaml, isMigrationNeeded } = require('../main/archiveDb');
  let dbReady = false;

  try {
    const archiveDb = require('../main/archiveDb');
    setArchiveDb(archiveDb);

    // Legacy: migrate archive.yml -> archive.db if needed
    if (isMigrationNeeded(paths.ARCHIVE_PATH, paths.ARCHIVE_DB_PATH)) {
      logger.log('[Archive Migration] Starting YAML to SQLite migration...');
      await archiveDb.openDatabase(paths.ARCHIVE_DB_PATH);
      const result = await migrateFromYaml(paths.ARCHIVE_PATH);
      if (result.success) {
        fs.renameSync(paths.ARCHIVE_PATH, `${paths.ARCHIVE_PATH}.migrated`);
        logger.log(`[Archive Migration] Successfully migrated ${result.count} tickets to SQLite`);
      } else {
        logger.error('[Archive Migration] Migration failed:', result.error);
      }
      archiveDb.closeDatabase();
    }

    // Open unified database (creates schemas for archive + requests + backlog)
    await ombutocodeDb.open(paths.OMBUTOCODE_DB_PATH);
    logger.log('[Database] Unified database initialized at', paths.OMBUTOCODE_DB_PATH);

    // One-time migration from standalone DBs into unified DB
    if (fs.existsSync(paths.ARCHIVE_DB_PATH) || fs.existsSync(paths.REQUESTS_DB_PATH)) {
      const migResult = await ombutocodeDb.migrateFromStandalone(paths.ARCHIVE_DB_PATH, paths.REQUESTS_DB_PATH);
      logger.log('[Database] Standalone migration complete:', migResult);
    }

    // Wire backlogDb into coreUtilities so readBacklogData/writeBacklogData use SQLite
    setDbModules(backlogDb, ombutocodeDb);

    // One-time migration: backlog.yml → SQLite
    if (backlogDb.isMigrationNeeded(paths.BACKLOG_PATH)) {
      logger.log('[Backlog Migration] Starting YAML to SQLite migration...');
      const blResult = backlogDb.migrateFromYaml(paths.BACKLOG_PATH);
      if (blResult.success) {
        logger.log(`[Backlog Migration] Successfully migrated ${blResult.count} tickets`);
      } else {
        logger.error('[Backlog Migration] Migration failed:', blResult.error);
      }
      ombutocodeDb.saveDb();
    }

    // Wire ticket file manager for active ticket files
    const ticketFileManager = require('../main/ticketFileManager');
    ticketFileManager.setTicketsDir(paths.TICKETS_DIR);
    ticketFileManager.ensureTicketsDir();
    backlogDb.setTicketFileManager(ticketFileManager);

    // Crash recovery: sync orphaned ticket files back to DB
    const recovery = backlogDb.recoverOrphanedTicketFiles();
    if (recovery.recovered.length > 0) {
      ombutocodeDb.saveDb();
    }
    dbReady = true;
  } catch (error) {
    logger.error('[Database] Error during database initialization:', error);
  }

  // Scheduler logger
  const { createSchedulerLogger } = require('../main/schedulerLogger');
  const logSchedulerEvent = createSchedulerLogger();

  // Runtime callbacks
  const { createRuntimeCallbacks } = require('../main/coreCallbacks');
  const runOutputFilesByRunId = new Map();

  const { createRunSummarizer } = require('../main/runSummary');
  const { AgentRuntime, resolveAgentTemplateConfig } = require('../main/codingAgentRuntime');
  const readRunSummaryAgentId = () => (
    settingsStore.get('run_summary_agent', null)
    || settingsStore.get('eval_default_agent', null)
    || 'codex'
  );
  const isRunSummaryEnabled = () => settingsStore.get('run_summary_enabled', true) !== false;
  const runSummarizer = createRunSummarizer({
    projectRoot: paths.PROJECT_ROOT,
    runOutputDir: paths.RUN_OUTPUT_DIR,
    resolveTemplateConfig: resolveAgentTemplateConfig,
    readSummaryAgent: readRunSummaryAgentId,
    readSummaryModel: () => settingsStore.get('run_summary_model', null),
    getTicketById: (id) => backlogDb.getTicketById(id),
    updateTicketFields: (id, fields) => {
      backlogDb.updateTicketFields(id, fields);
      ombutocodeDb.saveDb();
    }
  });

  const callbacks = createRuntimeCallbacks({
    appendAgentLog: utils.appendAgentLog,
    updateTicket: utils.updateTicket,
    buildRunOutputFilePaths: utils.buildRunOutputFilePaths,
    writeRunOutputFiles: utils.writeRunOutputFiles,
    removeRunOutputFile: utils.removeRunOutputFile,
    runOutputFilesByRunId,
    logSchedulerEvent,
    appendTicketNote,
    formatCommandLine,
    shorten,
    NOTE_OUTPUT_LIMIT,
    summarizeSquashMergeFailure,
    summarizeTrialMergeFailure,
    readMaxEvalRetries: () => settingsStore.get('max_eval_retries', 2),
    projectRoot: paths.PROJECT_ROOT,
    onTitleBrandingUpdate: null,  // No Electron windows in headless mode
    isRunSummaryEnabled,
    isRunOutputRetained: () => settingsStore.get('retain_run_output', false) === true,
    startRunSummary: (ticket) => {
      if (!isRunSummaryEnabled()) return;
      if (!Array.isArray(ticket?.run_log_index) || ticket.run_log_index.length === 0) return;
      ticket.run_summary = { status: 'generating', started_at: new Date().toISOString() };
      setImmediate(() => {
        runSummarizer.summarizeTicketRuns(ticket.id).catch((error) => {
          logger.error(`[RunSummary] Unexpected failure for ${ticket.id}:`, error?.message);
        });
      });
    }
  });

  // Agent runtime
  const agentRuntime = new AgentRuntime({
    resolveTemplate: (agentName, _payload, runOptions = {}) =>
      resolveAgentTemplateConfig(paths.PROJECT_ROOT, agentName, runOptions),
    onRunStarted: callbacks.onRunStarted,
    onRunUpdated: callbacks.onRunUpdated,
    onRunFinished: callbacks.onRunFinished
  });

  // Scheduler
  const { createScheduler } = require('../main/scheduler');
  const schedulerDeps = {
    readBacklogData: utils.readBacklogData,
    writeBacklogData: utils.writeBacklogData,
    readAgentsConfig: utils.readAgentsConfig,
    readEvalDefaultAgent: () => {
      const agent = settingsStore.get('eval_default_agent', null);
      if (!agent) return null;
      const model = settingsStore.get('eval_default_model', null);
      return model ? { tool: agent, model } : agent;
    },
    readRefreshInterval: () => settingsStore.get('app_refresh_interval', 30),
    agentRuntime,
    projectRoot: paths.PROJECT_ROOT,
    logEvent: logSchedulerEvent,
    onEvalPreparationFailed: callbacks.createOnEvalPreparationFailed()
  };
  if (Number.isFinite(evalPostMergeCooldownMs)) {
    schedulerDeps.evalPostMergeCooldownMs = evalPostMergeCooldownMs;
  }
  const scheduler = createScheduler(schedulerDeps);

  // Wire circular dependency
  callbacks.setScheduler(scheduler);

  // Trim old agent logs
  utils.trimAgentLog();

  // Clean up old run-output log files
  const { cleanupRunOutput } = require('../main/runOutputCleanup');
  const activeRunFiles = new Set();
  for (const filePaths of runOutputFilesByRunId.values()) {
    if (filePaths.stdout) activeRunFiles.add(filePaths.stdout);
    if (filePaths.stderr) activeRunFiles.add(filePaths.stderr);
  }
  cleanupRunOutput(paths.RUN_OUTPUT_DIR, activeRunFiles);

  // Git version check (non-fatal)
  const { checkGitVersionSupport } = require('../main/gitVersionCheck');
  checkGitVersionSupport({
    logger,
    onWarning: ({ message, detail }) => {
      logger.warn(`[Git Warning] ${message}`);
      if (detail) logger.warn(`  ${detail}`);
    }
  }).catch((error) => {
    logger.warn('[Git] Startup git version check failed:', error?.message || error);
  });

  return {
    appRoot,
    paths,
    dbReady,
    settingsStore,
    utils,
    backlogDb,
    ombutocodeDb,
    agentRuntime,
    scheduler,
    callbacks,
    logSchedulerEvent,
    runOutputFilesByRunId,
    resolveAgentTemplateConfig,
    logger
  };
}

/**
 * Persist `scheduler_running` in codingagent-state.json — the console and the
 * `run` subcommand both flip it on start and off on every exit path.
 */
function persistSchedulerRunning(scheduler, running) {
  const state = scheduler.windowTracker.loadState();
  state.scheduler_running = Boolean(running);
  scheduler.windowTracker.saveState(state);
}

module.exports = {
  APP_ROOT,
  AGENT_OVERRIDE_KEYS,
  resolveProjectRoot,
  buildProjectPaths,
  applySettingsOverrides,
  applyAgentOverrides,
  bootProject,
  persistSchedulerRunning
};
