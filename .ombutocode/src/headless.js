#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// 1. Resolve project root
// ---------------------------------------------------------------------------
const APP_ROOT = path.resolve(__dirname, '..', '..');

function resolveProjectRoot() {
  // CLI argument: node headless.js /path/to/project
  const cliArg = process.argv[2];
  if (cliArg && !cliArg.startsWith('-') && fs.existsSync(cliArg) && fs.statSync(cliArg).isDirectory()) {
    return path.resolve(cliArg);
  }
  // Environment variable
  if (process.env.OMBUTOCODE_PROJECT_ROOT && fs.existsSync(process.env.OMBUTOCODE_PROJECT_ROOT)) {
    return path.resolve(process.env.OMBUTOCODE_PROJECT_ROOT);
  }
  // Current working directory (if it has .ombutocode/ or .git/)
  const cwd = process.cwd();
  if (cwd !== APP_ROOT && (fs.existsSync(path.join(cwd, '.ombutocode')) || fs.existsSync(path.join(cwd, '.git')))) {
    return cwd;
  }
  // Fallback: self-hosting mode
  return APP_ROOT;
}

const PROJECT_ROOT = resolveProjectRoot();

// ---------------------------------------------------------------------------
// 2. Compute path constants
// ---------------------------------------------------------------------------
const OMBUTOCODE_DIR     = path.join(PROJECT_ROOT, '.ombutocode');
const BACKLOG_PATH     = path.join(OMBUTOCODE_DIR, 'planning', 'backlog.yml');
const ARCHIVE_PATH     = path.join(OMBUTOCODE_DIR, 'planning', 'archive.yml');
const ARCHIVE_DB_PATH  = path.join(OMBUTOCODE_DIR, 'planning', 'archive.db');
const REQUESTS_DB_PATH = path.join(OMBUTOCODE_DIR, 'data', 'requests.db');
const OMBUTOCODE_DB_PATH = path.join(OMBUTOCODE_DIR, 'data', 'ombutocode.db');
const AGENTS_PATH      = path.join(OMBUTOCODE_DIR, 'codingagents', 'codingagents.yml');
const AGENT_LOG_DIR    = path.join(OMBUTOCODE_DIR, 'logs');
const AGENT_LOG_PATH   = path.join(AGENT_LOG_DIR, 'codingagent-runs.jsonl');
const RUN_OUTPUT_DIR   = path.join(OMBUTOCODE_DIR, 'run-output');

// ---------------------------------------------------------------------------
// 3. Headless settings (file-based, replaces electron-store)
// ---------------------------------------------------------------------------
const { createHeadlessSettings } = require('./src/main/headlessSettings');
const settingsStore = createHeadlessSettings(OMBUTOCODE_DIR);

// ---------------------------------------------------------------------------
// 4. Shared utility functions
// ---------------------------------------------------------------------------
const {
  NOTE_OUTPUT_LIMIT,
  collapseWhitespace,
  shorten,
  formatCommandLine,
  sanitizePathSegment,
  appendTicketNote,
  summarizeTrialMergeFailure,
  summarizeSquashMergeFailure,
  createUtilities,
  setDbModules
} = require('./src/main/coreUtilities');

const utils = createUtilities({
  projectRoot: PROJECT_ROOT,
  backlogPath: BACKLOG_PATH,
  agentsPath: AGENTS_PATH,
  agentLogDir: AGENT_LOG_DIR,
  agentLogPath: AGENT_LOG_PATH,
  runOutputDir: RUN_OUTPUT_DIR
});

// ---------------------------------------------------------------------------
// 5. Ensure .ombutocode structure
// ---------------------------------------------------------------------------
const { ensureOmbutocodeStructure } = require('./src/main/projectInit');
try {
  ensureOmbutocodeStructure(PROJECT_ROOT, APP_ROOT);
  console.log('[Init] .ombutocode/ structure verified at', PROJECT_ROOT);
} catch (initError) {
  console.error('[Init] Failed to initialize .ombutocode/ structure:', initError.message);
}

// ---------------------------------------------------------------------------
// Main async boot
// ---------------------------------------------------------------------------
(async function main() {
  // 6. Initialize SQLite databases
  const ombutocodeDb = require('./src/main/ombutocodeDb');
  const { setArchiveDb } = require('./src/main/backlogOperations');
  const { migrateFromYaml, isMigrationNeeded } = require('./src/main/archiveDb');

  try {
    const archiveDb = require('./src/main/archiveDb');
    setArchiveDb(archiveDb);

    // Legacy: migrate archive.yml -> archive.db if needed
    if (isMigrationNeeded(ARCHIVE_PATH, ARCHIVE_DB_PATH)) {
      console.log('[Archive Migration] Starting YAML to SQLite migration...');
      await archiveDb.openDatabase(ARCHIVE_DB_PATH);
      const result = await migrateFromYaml(ARCHIVE_PATH);
      if (result.success) {
        fs.renameSync(ARCHIVE_PATH, `${ARCHIVE_PATH}.migrated`);
        console.log(`[Archive Migration] Successfully migrated ${result.count} tickets to SQLite`);
      } else {
        console.error('[Archive Migration] Migration failed:', result.error);
      }
      archiveDb.closeDatabase();
    }

    // Open unified database (creates schemas for archive + requests + backlog)
    await ombutocodeDb.open(OMBUTOCODE_DB_PATH);
    console.log('[Database] Unified database initialized at', OMBUTOCODE_DB_PATH);

    // One-time migration from standalone DBs into unified DB
    if (fs.existsSync(ARCHIVE_DB_PATH) || fs.existsSync(REQUESTS_DB_PATH)) {
      const migResult = await ombutocodeDb.migrateFromStandalone(ARCHIVE_DB_PATH, REQUESTS_DB_PATH);
      console.log('[Database] Standalone migration complete:', migResult);
    }

    // Wire backlogDb into coreUtilities so readBacklogData/writeBacklogData use SQLite
    const backlogDb = require('./src/main/backlogDb');
    setDbModules(backlogDb, ombutocodeDb);

    // One-time migration: backlog.yml → SQLite
    if (backlogDb.isMigrationNeeded(BACKLOG_PATH)) {
      console.log('[Backlog Migration] Starting YAML to SQLite migration...');
      const blResult = backlogDb.migrateFromYaml(BACKLOG_PATH);
      if (blResult.success) {
        console.log(`[Backlog Migration] Successfully migrated ${blResult.count} tickets`);
      } else {
        console.error('[Backlog Migration] Migration failed:', blResult.error);
      }
      ombutocodeDb.saveDb();
    }

    // Wire ticket file manager for active ticket files
    const ticketFileManager = require('./src/main/ticketFileManager');
    const TICKETS_DIR = path.join(OMBUTOCODE_DIR, 'data', 'tickets');
    ticketFileManager.setTicketsDir(TICKETS_DIR);
    ticketFileManager.ensureTicketsDir();
    backlogDb.setTicketFileManager(ticketFileManager);

    // Crash recovery: sync orphaned ticket files back to DB
    const recovery = backlogDb.recoverOrphanedTicketFiles();
    if (recovery.recovered.length > 0) {
      ombutocodeDb.saveDb();
    }
  } catch (error) {
    console.error('[Database] Error during database initialization:', error);
  }

  // 7. Scheduler logger
  const { createSchedulerLogger } = require('./src/main/schedulerLogger');
  const logSchedulerEvent = createSchedulerLogger();

  // 8. Runtime callbacks
  const { createRuntimeCallbacks } = require('./src/main/coreCallbacks');
  const runOutputFilesByRunId = new Map();

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
    projectRoot: PROJECT_ROOT,
    onTitleBrandingUpdate: null  // No Electron windows in headless mode
  });

  // 9. Agent runtime
  const { AgentRuntime, resolveAgentTemplateConfig } = require('./src/main/codingAgentRuntime');

  const agentRuntime = new AgentRuntime({
    resolveTemplate: (agentName, _payload, options = {}) =>
      resolveAgentTemplateConfig(PROJECT_ROOT, agentName, options),
    onRunStarted: callbacks.onRunStarted,
    onRunUpdated: callbacks.onRunUpdated,
    onRunFinished: callbacks.onRunFinished
  });

  // 10. Scheduler
  const { createScheduler } = require('./src/main/scheduler');
  const scheduler = createScheduler({
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
    projectRoot: PROJECT_ROOT,
    logEvent: logSchedulerEvent,
    onEvalPreparationFailed: callbacks.createOnEvalPreparationFailed()
  });

  // 11. Wire circular dependency
  callbacks.setScheduler(scheduler);

  // Trim old agent logs
  utils.trimAgentLog();

  // Clean up old run-output log files
  const { cleanupRunOutput } = require('./src/main/runOutputCleanup');
  const activeRunFiles = new Set();
  for (const paths of runOutputFilesByRunId.values()) {
    if (paths.stdout) activeRunFiles.add(paths.stdout);
    if (paths.stderr) activeRunFiles.add(paths.stderr);
  }
  cleanupRunOutput(RUN_OUTPUT_DIR, activeRunFiles);

  // Git version check (non-fatal)
  const { checkGitVersionSupport } = require('./src/main/gitVersionCheck');
  checkGitVersionSupport({
    logger: console,
    onWarning: ({ message, detail }) => {
      console.warn(`[Git Warning] ${message}`);
      if (detail) console.warn(`  ${detail}`);
    }
  }).catch((error) => {
    console.warn('[Git] Startup git version check failed:', error?.message || error);
  });

  // 12. Start scheduler
  scheduler.start();
  console.log('[Scheduler] Started in headless mode');

  // Persist scheduler running state
  const state = scheduler.windowTracker.loadState();
  state.scheduler_running = true;
  scheduler.windowTracker.saveState(state);

  // ---------------------------------------------------------------------------
  // 13. Console display
  // ---------------------------------------------------------------------------
  const isTTY = process.stdout.isTTY;
  const ACTIVE_COLUMNS = ['todo', 'building', 'in_progress', 'eval', 'merging', 'review'];

  function formatDuration(ms) {
    if (!ms || ms < 0) return '0s';
    const totalSeconds = Math.floor(ms / 1000);
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
  }

  function renderBoard() {
    const now = new Date();
    const timestamp = now.toISOString().replace('T', ' ').slice(0, 19);
    const schedulerStatus = scheduler.getStatus();
    const backlogData = utils.readBacklogData();
    const tickets = Array.isArray(backlogData.tickets) ? backlogData.tickets : [];
    const refreshInterval = settingsStore.get('app_refresh_interval', 30);

    // Group tickets by status
    const byStatus = {};
    for (const col of ACTIVE_COLUMNS) {
      byStatus[col] = [];
    }
    for (const ticket of tickets) {
      const status = (ticket.status || '').toLowerCase();
      if (byStatus[status]) {
        byStatus[status].push(ticket);
      }
    }

    // Build active run lookup by ticketId
    const activeRunsByTicket = {};
    for (const run of (schedulerStatus.activeRuns || [])) {
      activeRunsByTicket[run.ticketId] = run;
    }

    const lines = [];
    const SEP = '\u2550'.repeat(55);
    const THIN_SEP = '\u2500'.repeat(55);

    lines.push(SEP);
    lines.push(` OMBUTOCODE HEADLESS  |  ${timestamp}`);
    lines.push(SEP);
    lines.push('');

    // Sort review column so most recently updated tickets appear first
    if (byStatus.review && byStatus.review.length > 1) {
      byStatus.review.sort((a, b) => {
        const ta = a.last_updated || '';
        const tb = b.last_updated || '';
        return tb.localeCompare(ta);
      });
    }

    for (const col of ACTIVE_COLUMNS) {
      const colTickets = byStatus[col];
      const label = col.toUpperCase();
      lines.push(` ${label} (${colTickets.length})`);

      for (const ticket of colTickets) {
        const id = (ticket.id || '???').padEnd(10);
        const title = (ticket.title || 'Untitled').slice(0, 40);
        const parts = [`   ${id}${title}`];

        // Show agent info
        const assignee = ticket.assignee || ticket.agent?.name;
        if (assignee && assignee !== 'NONE') {
          parts.push(`[${assignee}]`);
        }

        // Show PID and elapsed time for running tickets
        const activeRun = activeRunsByTicket[ticket.id];
        if (activeRun) {
          if (activeRun.pid) {
            parts.push(`pid=${activeRun.pid}`);
          }
          if (activeRun.startedAt) {
            const elapsed = now.getTime() - new Date(activeRun.startedAt).getTime();
            parts.push(formatDuration(elapsed));
          }
        }

        lines.push(parts.join('  '));
      }

      lines.push('');
    }

    // Status line
    const statusLabel = schedulerStatus.status?.toUpperCase() || 'UNKNOWN';
    lines.push(THIN_SEP);
    lines.push(` Scheduler: ${statusLabel}  |  Refresh: ${refreshInterval}s`);
    lines.push(SEP);

    return lines.join('\n');
  }

  function displayBoard() {
    const output = renderBoard();
    if (isTTY) {
      console.clear();
    } else {
      console.log('');  // separator for piped output
    }
    console.log(output);
  }

  // Initial display
  displayBoard();

  // Periodic refresh
  const refreshMs = settingsStore.get('app_refresh_interval', 30) * 1000;
  const displayInterval = setInterval(displayBoard, refreshMs);

  // ---------------------------------------------------------------------------
  // 14. Graceful shutdown
  // ---------------------------------------------------------------------------
  let shuttingDown = false;

  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[Headless] Received ${signal}, shutting down...`);

    clearInterval(displayInterval);
    scheduler.stop();

    // Persist stopped state
    const state = scheduler.windowTracker.loadState();
    state.scheduler_running = false;
    scheduler.windowTracker.saveState(state);

    console.log('[Headless] Scheduler stopped. Exiting.');
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
})();
