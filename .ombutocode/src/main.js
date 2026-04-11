const { app, BrowserWindow, ipcMain, protocol, Menu } = require('electron');
const TITLE_BRANDING_KEY = 'ombutocode:titleBranding';
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const Store = require('electron-store');
const { AgentInvocationError, AgentRuntime, resolveAgentTemplateConfig, agentDisplayName } = require('./src/main/codingAgentRuntime');
const { resolveEvalOutcomeAfterRun, resolveTestOutcomeAfterRun, formatTestOutcomeNote, extractTextFromStreamJson } = require('./src/main/runLifecycle');
const { createScheduler, buildRetryContext } = require('./src/main/scheduler');
const { checkGitVersionSupport } = require('./src/main/gitVersionCheck');
const { cleanupOnDoneTransition } = require('./src/main/statusTransitionCleanup');
const { cleanupRunOutput } = require('./src/main/runOutputCleanup');
const { migrateToOmbutocodeStructure } = require('./src/main/projectMigration');
const { ensureOmbutocodeStructure } = require('./src/main/projectInit');
const { squashMergeTicketBranchSync, commitWorktreeChangesSync, createWorktreeSync, removeWorktree } = require('./src/main/worktreeManager');
const {
  normalizePromptPayload,
  buildCodexDraftPrompt,
  parseCodexDraftOutput,
  validateTicketDraft,
  buildTicketFromDraft,
  appendTicketToBacklog,
  runCodexDraftCommand,
  createAdHocTicketCreator
} = require('./src/main/adHocTickets');
const {
  migrateFromYaml,
  isMigrationNeeded
} = require('./src/main/archiveDb');
const {
  searchTickets,
  getDistinctEpicRefs,
  getArchiveData,
  getMaxTicketNumericId
} = require('./src/main/archiveDb');
const requestsDb = require('./src/main/requestsDb');
const ombutocodeDb = require('./src/main/ombutocodeDb');
const logsDb = require('./src/main/logsDb');
const backlogDb = require('./src/main/backlogDb');
const { createSchedulerLogger } = require('./src/main/schedulerLogger');
const fileTreeService = require('./src/main/fileTreeService');
const {
  readBacklog,
  updateBacklogTicketStatus,
  deleteBacklogTicket,
  moveBacklogTicketToArchive,
  hasResolvedDependencies,
  normalizeDependencyId,
  setArchiveDb
} = require('./src/main/backlogOperations');
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Ombuto Code's own installation directory (.ombutocode/src/ → project root)
const APP_ROOT = path.resolve(__dirname, '..', '..');

// Resolve the target project root dynamically
function resolveProjectRoot() {
  // 1. CLI argument: electron . /path/to/project
  //    Skip '.' (Electron app dir) and the electron binary path itself
  const cliArg = process.argv[process.argv.length - 1];
  if (cliArg && cliArg !== '.' && !cliArg.startsWith('-') && path.resolve(cliArg) !== APP_ROOT
      && fs.existsSync(cliArg) && fs.statSync(cliArg).isDirectory()) {
    return path.resolve(cliArg);
  }
  // 2. Environment variable
  if (process.env.OMBUTOCODE_PROJECT_ROOT && fs.existsSync(process.env.OMBUTOCODE_PROJECT_ROOT)) {
    return path.resolve(process.env.OMBUTOCODE_PROJECT_ROOT);
  }
  // 3. Current working directory (if it has .ombutocode/ or .git/)
  const cwd = process.cwd();
  if (cwd !== APP_ROOT && (fs.existsSync(path.join(cwd, '.ombutocode')) || fs.existsSync(path.join(cwd, '.git')))) {
    return cwd;
  }
  // 4. Fallback: self-hosting mode
  return APP_ROOT;
}

const PROJECT_ROOT = resolveProjectRoot();
fileTreeService.init(PROJECT_ROOT);
const OMBUTOCODE_DIR    = path.join(PROJECT_ROOT, '.ombutocode');
const BACKLOG_PATH    = path.join(OMBUTOCODE_DIR, 'planning', 'backlog.yml');
const ARCHIVE_PATH    = path.join(OMBUTOCODE_DIR, 'planning', 'archive.yml');
const ARCHIVE_DB_PATH = path.join(OMBUTOCODE_DIR, 'planning', 'archive.db');
const REQUESTS_DB_PATH = path.join(OMBUTOCODE_DIR, 'data', 'requests.db');
const OMBUTOCODE_DB_PATH = path.join(OMBUTOCODE_DIR, 'data', 'ombutocode.db');
const EPICS_DIR    = path.join(OMBUTOCODE_DIR, 'epics');
const AGENTS_PATH     = path.join(OMBUTOCODE_DIR, 'codingagents', 'codingagents.yml');
const AGENT_LOG_DIR   = path.join(OMBUTOCODE_DIR, 'logs');
const AGENT_LOG_PATH  = path.join(AGENT_LOG_DIR, 'codingagent-runs.jsonl');
const RUN_OUTPUT_DIR  = path.join(OMBUTOCODE_DIR, 'run-output');
const NOTE_OUTPUT_LIMIT = 200;
const DEFAULT_RUN_LOG_TAIL_CHARS = 12000;

// Settings store for app preferences
const settingsStore = new Store({
  name: 'app-settings',
  schema: {
    project_name: {
      type: 'string',
      default: ''
    },
    eval_default_agent: {
      type: ['string', 'null'],
      default: null
    },
    eval_default_model: {
      type: ['string', 'null'],
      default: null
    },
    ad_hoc_ticket_agent: {
      type: ['string', 'null'],
      default: null
    },
    ad_hoc_ticket_model: {
      type: ['string', 'null'],
      default: null
    },
    app_refresh_interval: {
      type: 'number',
      minimum: 1,
      default: 30
    },
    enable_review_notification_sound: {
      type: 'boolean',
      default: true
    },
    theme: {
      type: 'string',
      enum: ['light', 'dark'],
      default: 'light'
    }
  }
});
settingsStore.delete('scheduler_default_running');

function readBacklogData() {
  try {
    return backlogDb.readBacklogData();
  } catch {
    return { version: 1, updated_at: '', tickets: [] };
  }
}

function writeBacklogData(data) {
  data.updated_at = new Date().toISOString().split('T')[0];
  backlogDb.writeBacklogData(data);
  ombutocodeDb.saveDb();
}

function appendTicketNote(ticket, message) {
  ticket.notes = ticket.notes ? `${ticket.notes}\n${message}` : message;
}

function summarizeTrialMergeFailure(error) {
  const details = error && typeof error === 'object' ? error.details : null;
  const stdout = shorten(details?.stdout || '');
  const stderr = shorten(details?.stderr || '');
  const lines = [];

  if (stdout) {
    lines.push(`stdout: ${stdout}`);
  }
  if (stderr) {
    lines.push(`stderr: ${stderr}`);
  }

  if (lines.length === 0) {
    lines.push(`error: ${error?.message || 'Unknown trial-merge preparation failure.'}`);
  }

  return lines;
}

function summarizeSquashMergeFailure(error) {
  const details = error && typeof error === 'object' ? error.details : null;
  const stdout = shorten(details?.stdout || '');
  const stderr = shorten(details?.stderr || '');
  const lines = [];

  if (stdout) {
    lines.push(`stdout: ${stdout}`);
  }
  if (stderr) {
    lines.push(`stderr: ${stderr}`);
  }
  if (details?.dirty) {
    lines.push('main worktree has local uncommitted changes');
  }
  if (details?.conflict) {
    lines.push('squash merge reported conflicts');
  }

  if (lines.length === 0) {
    lines.push(`error: ${error?.message || 'Unknown squash-merge failure.'}`);
  }

  return lines;
}

function readAgentsConfig() {
  try {
    const content = fs.readFileSync(AGENTS_PATH, 'utf-8');
    return yaml.load(content) || { version: 1, tools: [] };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { version: 1, tools: [] };
    }
    throw error;
  }
}

function resolveDefaultModelId(toolId) {
  const config = readAgentsConfig();
  const tool = (config?.tools || []).find(t => t.id === toolId && t.enabled);
  const model = (tool?.models || []).find(m => m.enabled);
  return model?.model_id || '';
}

/**
 * Resolve the model_id for a specific tool+model combination.
 * If preferredModelId matches an enabled model's `id`, return its `model_id`.
 * Otherwise fall back to the first enabled model (resolveDefaultModelId).
 */
function resolveModelId(toolId, preferredModelId) {
  if (!preferredModelId) return resolveDefaultModelId(toolId);
  const config = readAgentsConfig();
  const tool = (config?.tools || []).find(t => t.id === toolId && t.enabled);
  if (!tool) return '';
  const match = (tool.models || []).find(m => m.enabled && m.id === preferredModelId);
  if (match) return match.model_id || '';
  return resolveDefaultModelId(toolId);
}

function formatAcceptanceCriteria(ticket) {
  return Array.isArray(ticket?.acceptance_criteria)
    ? ticket.acceptance_criteria
        .map((c, i) => `${i + 1}. ${c.replace(/^\[[ x]\]\s*/, '')}`)
        .join('\n')
    : '';
}

function collapseWhitespace(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function shorten(text, maxChars = NOTE_OUTPUT_LIMIT) {
  const value = collapseWhitespace(text);
  if (!value) return '';
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...`;
}

function formatCommandLine(command, args) {
  const joinedArgs = Array.isArray(args) ? args.join(' ') : '';
  return [command, joinedArgs].filter(Boolean).join(' ').trim();
}

function appendAgentLog(entry) {
  try {
    fs.mkdirSync(AGENT_LOG_DIR, { recursive: true });
    fs.appendFileSync(AGENT_LOG_PATH, `${JSON.stringify(entry)}\n`, 'utf-8');
  } catch (error) {
    console.warn('Unable to write agent run log:', error?.message || error);
  }
}

function trimAgentLog() {
  try {
    if (!fs.existsSync(AGENT_LOG_PATH)) return;
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const lines = fs.readFileSync(AGENT_LOG_PATH, 'utf-8').split('\n').filter(Boolean);
    const kept = lines.filter((line) => {
      try {
        const { ts } = JSON.parse(line);
        return typeof ts === 'string' && ts.slice(0, 10) >= todayPrefix;
      } catch {
        return false;
      }
    });
    fs.writeFileSync(AGENT_LOG_PATH, kept.length ? kept.join('\n') + '\n' : '', 'utf-8');
    const removed = lines.length - kept.length;
    if (removed > 0) {
      console.log(`[AgentLog] Trimmed ${removed} entries older than ${todayPrefix}`);
    }
  } catch (error) {
    console.warn('Unable to trim agent run log:', error?.message || error);
  }
}

const runOutputFilesByRunId = new Map();

function sanitizePathSegment(value) {
  return String(value || 'unknown')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 120);
}

function buildRunOutputFilePaths(run) {
  const safeTicketId = sanitizePathSegment(run.ticketId);
  const safeRunId = sanitizePathSegment(run.runId);
  const baseName = `${safeTicketId}__${safeRunId}`;
  const stdoutPath = path.join(RUN_OUTPUT_DIR, `${baseName}.stdout.log`);
  const stderrPath = path.join(RUN_OUTPUT_DIR, `${baseName}.stderr.log`);
  return {
    stdoutPath,
    stderrPath,
    stdoutRelative: path.relative(PROJECT_ROOT, stdoutPath),
    stderrRelative: path.relative(PROJECT_ROOT, stderrPath)
  };
}

function ensureRunOutputDirectory() {
  fs.mkdirSync(RUN_OUTPUT_DIR, { recursive: true });
}

function writeRunOutputFiles(logPaths, run) {
  if (!logPaths) return;
  ensureRunOutputDirectory();
  fs.writeFileSync(logPaths.stdoutPath, String(run.stdout || ''), 'utf-8');
  fs.writeFileSync(logPaths.stderrPath, String(run.stderr || ''), 'utf-8');
}

function removeRunOutputFile(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.warn('Unable to remove run output file:', filePath, error?.message || error);
  }
}

function resolveProjectPath(filePath) {
  if (!filePath) return null;
  return path.isAbsolute(filePath) ? filePath : path.join(PROJECT_ROOT, filePath);
}

function readFileTail(filePath, maxChars = DEFAULT_RUN_LOG_TAIL_CHARS) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { text: '', truncated: false };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  if (content.length <= maxChars) {
    return { text: content, truncated: false };
  }
  return {
    text: content.slice(content.length - maxChars),
    truncated: true
  };
}

function updateTicket(ticketId, updater) {
  const ticket = backlogDb.getTicketById(ticketId);
  if (!ticket) return false;

  updater(ticket);
  ticket.last_updated = new Date().toISOString();
  backlogDb.updateTicketFields(ticketId, ticket);
  // Only persist DB when data was written to DB (not just to ticket file)
  if (!backlogDb.ACTIVE_STATUSES || !backlogDb.ACTIVE_STATUSES.has(ticket.status)) {
    ombutocodeDb.saveDb();
  }
  return true;
}

let agentRuntime;
const activeFeatureEvals = new Map(); // runId → { fileName, epicRef, tickets }
const createAdHocFromPrompt = createAdHocTicketCreator({
  projectRoot: PROJECT_ROOT,
  resolveTemplateConfig: resolveAgentTemplateConfig,
  readAdHocTicketAgent: () => (
    settingsStore.get('ad_hoc_ticket_agent', null)
    || settingsStore.get('eval_default_agent', null)
    || 'codex'
  ),
  readAdHocTicketModel: () => {
    const internalId = settingsStore.get('ad_hoc_ticket_model', null);
    if (!internalId) return null;
    const agentId = settingsStore.get('ad_hoc_ticket_agent', null)
      || settingsStore.get('eval_default_agent', null)
      || 'codex';
    const config = readAgentsConfig();
    const tool = (config?.tools || []).find(t => t.id === agentId);
    const model = (tool?.models || []).find(m => m.id === internalId);
    return model?.model_id || internalId;
  },
  runDraftCommand: runCodexDraftCommand,
  readBacklogData,
  writeBacklogData,
  getArchivedMaxId: () => getMaxTicketNumericId('AD_HOC-')
});

// Initialize @electron/remote
require('@electron/remote/main').initialize();

// Register custom protocol
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('ombutocode', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('ombutocode')
}

// Handle the protocol 
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('Another instance is running, quitting...');
  app.quit();
  return;
}

app.on('second-instance', (event, commandLine, workingDirectory) => {
  console.log('Second instance detected, focusing main window');
  
  // Focus the main window
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  
  // Look for URL in command line arguments
  if (commandLine && commandLine.length > 1) {
    const urlArg = commandLine.find(arg => arg && typeof arg === 'string' && arg.startsWith('ombutocode://'));
    if (urlArg) {
      console.log('Handling URL from command line:', urlArg);
      handleUrl(urlArg);
    }
  }
});

function handleUrl(url) {
  try {
    if (!url || typeof url !== 'string' || !url.startsWith('ombutocode://')) {
      console.log('Invalid or missing URL:', url);
      return;
    }

    // Ensure the URL is properly formatted
    const parsedUrl = new URL(url);
    if (parsedUrl.pathname === '/auth/dropbox/callback') {
      const code = parsedUrl.searchParams.get('code');
      const state = parsedUrl.searchParams.get('state');
      
      if (!code || !state) {
        console.error('Missing code or state in callback URL');
        return;
      }
      
      const mainWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        mainWindow.webContents.send('dropbox-auth-callback', { code, state });
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      } else {
        console.error('No browser window available to handle the callback');
      }
    }
  } catch (error) {
    console.error('Error handling URL:', error);
    console.error('URL that caused the error:', url);
  }
}

let mainWindow;

agentRuntime = new AgentRuntime({
  resolveTemplate: (agentName, _payload, options = {}) =>
    resolveAgentTemplateConfig(PROJECT_ROOT, agentName, options),
  onRunStarted: (run) => {
    const displayName = agentDisplayName(run.agentName);
    const logPrefix = String(run.agentName || 'agent').toUpperCase();
    const commandLine = formatCommandLine(run.command, run.args);
    appendAgentLog({
      ts: new Date().toISOString(),
      event: 'run_started',
      agentName: run.agentName,
      runId: run.runId,
      ticketId: run.ticketId,
      state: run.state,
      pid: run.pid,
      command: run.command,
      args: run.args,
      commandLine,
      startedAt: run.startedAt
    });
    console.log(
      `[${logPrefix}] run_started runId=${run.runId} ticketId=${run.ticketId} pid=${run.pid || 'n/a'} command="${commandLine}"`
    );
    logSchedulerEvent('run.started', 'info', `Run started: ${run.agentName} on ${run.ticketId}`, { ticketId: run.ticketId, runId: run.runId, agentName: run.agentName, details: { pid: run.pid, commandLine } });
    const logPaths = buildRunOutputFilePaths(run);
    runOutputFilesByRunId.set(run.runId, logPaths);
    writeRunOutputFiles(logPaths, run);

    updateTicket(run.ticketId, (ticket) => {
      // Keep EVAL, TEST, and MERGING tickets in their status while runs are active.
      if (ticket.status === 'eval') {
        // Keep eval status while evaluator runs
      } else if (ticket.status === 'test') {
        // Keep test status while test agent runs
      } else if (ticket.status === 'merging') {
        // Keep merging status while merge agent runs
      } else {
        ticket.status = 'in_progress';
      }
      ticket.assignee = run.agentName;
      ticket.agent = {
        name: run.agentName,
        run_id: run.runId,
        state: run.state,
        started_at: run.startedAt,
        finished_at: null,
        duration_ms: null,
        pid: run.pid || null,
        signal: null,
        command: run.command,
        args: run.args,
        exit_code: null,
        stdout_tail: null,
        stderr_tail: null,
        stdout_log_file: logPaths.stdoutRelative,
        stderr_log_file: logPaths.stderrRelative,
        stdout_truncated: false,
        stderr_truncated: false,
        error: null
      };
      // Clear notes only on implementation runs (fresh cycle). Test, eval,
      // and merge runs append to keep the progression visible.
      if (ticket.status !== 'test' && ticket.status !== 'eval' && ticket.status !== 'merging') {
        ticket.notes = '';
      }
    });
  },
  onRunUpdated: (run) => {
    const logPaths = runOutputFilesByRunId.get(run.runId);
    writeRunOutputFiles(logPaths, run);
  },
  onRunFinished: (run) => {
    const displayName = agentDisplayName(run.agentName);
    const logPrefix = String(run.agentName || 'agent').toUpperCase();
    const commandLine = formatCommandLine(run.command, run.args);
    const stdoutSummary = shorten(run.stdout, NOTE_OUTPUT_LIMIT);
    const stderrSummary = shorten(run.stderr, NOTE_OUTPUT_LIMIT);

    appendAgentLog({
      ts: new Date().toISOString(),
      event: 'run_finished',
      agentName: run.agentName,
      runId: run.runId,
      ticketId: run.ticketId,
      state: run.state,
      pid: run.pid,
      signal: run.signal,
      durationMs: run.durationMs,
      command: run.command,
      args: run.args,
      commandLine,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      exitCode: run.exitCode,
      error: run.error || null,
      stdout: run.stdout,
      stderr: run.stderr,
      stdoutTruncated: run.stdoutTruncated,
      stderrTruncated: run.stderrTruncated
    });

    console.log(
      `[${logPrefix}] run_finished runId=${run.runId} ticketId=${run.ticketId} state=${run.state} exit=${run.exitCode} signal=${run.signal || 'none'} durationMs=${run.durationMs}`
    );
    if (stdoutSummary) {
      console.log(`[${logPrefix}] stdout: ${stdoutSummary}`);
    }
    if (stderrSummary) {
      console.log(`[${logPrefix}] stderr: ${stderrSummary}`);
    }
    const logPaths = runOutputFilesByRunId.get(run.runId);
    writeRunOutputFiles(logPaths, run);
    let keepRunLogs = run.state !== 'completed';

    // Automatic git commit for successful implementation runs (per feature_GIT_WORKTREES.md)
    // Eval and test runs do NOT commit - they only validate. Implementation runs commit their changes.
    let implementationCommitted = false;
    if (!run.isEval && !run.isTest && run.state === 'completed' && run.exitCode === 0 && run.workingDirectory) {
      try {
        const commitResult = commitWorktreeChangesSync(run.ticketId, {
          projectRoot: PROJECT_ROOT,
          worktreePath: run.workingDirectory,
          commitMessage: `${run.ticketId}: Implementation changes`
        });

        if (commitResult.committed) {
          implementationCommitted = true;
          console.log(
            `[${logPrefix}] Auto-committed changes to ticket branch: ${commitResult.commitSha}`
          );
          logSchedulerEvent('autocommit.success', 'info', `Auto-committed changes: ${commitResult.commitSha}`, { ticketId: run.ticketId, runId: run.runId, agentName: run.agentName });
        } else {
          console.log(
            `[${logPrefix}] No changes to commit (${commitResult.message})`
          );
        }
      } catch (commitError) {
        console.error(
          `[${logPrefix}] Failed to auto-commit changes: ${commitError.message}`
        );
        logSchedulerEvent('autocommit.failure', 'warn', `Failed to auto-commit: ${commitError.message}`, { ticketId: run.ticketId, runId: run.runId, agentName: run.agentName });
        // Non-fatal - continue with ticket status update
      }
    }

    updateTicket(run.ticketId, (ticket) => {
      let evalOutcome = resolveEvalOutcomeAfterRun({
        runState: run.state,
        currentStatus: ticket.status,
        stdout: run.stdout,
        stderr: run.stderr,
        runError: run.error,
        epicRef: ticket.epic_ref,
        finishedAt: run.finishedAt
      });
      const previousStatus = ticket.status;

      // Merging-specific outcome handling — skip normal eval/status flow
      if (previousStatus === 'merging') {
        const existingAgent = ticket.agent && typeof ticket.agent === 'object' ? ticket.agent : {};
        let mergeResolved = false;

        if (run.state === 'completed' && run.exitCode === 0) {
          const rawOutput = `${run.stdout || ''}\n${run.stderr || ''}`;
          const plainText = extractTextFromStreamJson(rawOutput);
          const reportedSuccess = /MERGE_RESOLVE_RESULT:\s*SUCCESS/i.test(plainText);

          if (reportedSuccess) {
            const evalPassed = ticket.eval_summary?.verdict === 'PASS';

            if (evalPassed) {
              // Eval already passed — attempt squash merge before moving to review
              try {
                const mergeResult = squashMergeTicketBranchSync(ticket.id, {
                  projectRoot: PROJECT_ROOT,
                  title: ticket.title
                });
                ticket.status = 'review';
                ticket.agent = {
                  ...existingAgent,
                  name: run.agentName,
                  run_id: run.runId,
                  state: 'completed',
                  finished_at: run.finishedAt || null,
                  duration_ms: run.durationMs,
                  exit_code: run.exitCode,
                  error: null
                };
                appendTicketNote(ticket, 'Merge resolved. Squash merge completed.');
                logSchedulerEvent('merge_resolve.success', 'info', `Merge resolve succeeded and squash merge completed for ${ticket.id}`, { ticketId: ticket.id, runId: run.runId, details: { commitSha: mergeResult.commitSha } });
                removeWorktree(ticket.id, { projectRoot: PROJECT_ROOT }).catch((err) => {
                  console.error(`[Scheduler] Failed to remove worktree for ${ticket.id}:`, err.message);
                });
                mergeResolved = true;
              } catch (mergeError) {
                // Squash merge still fails after resolve — back to merge_failed
                ticket.agent = {
                  ...existingAgent,
                  name: run.agentName,
                  run_id: run.runId,
                  state: 'merge_failed',
                  finished_at: run.finishedAt || null,
                  duration_ms: run.durationMs,
                  exit_code: run.exitCode,
                  error: null
                };
                keepRunLogs = true;
                appendTicketNote(ticket, `Merge resolved but squash merge still failed: ${mergeError?.message || 'unknown'}.`);
                logSchedulerEvent('merge_resolve.squash_failed', 'warn', `Merge resolve succeeded but squash merge still failed for ${ticket.id}`, { ticketId: ticket.id, runId: run.runId });
              }
            } else {
              // Eval hasn't passed yet — send to eval (which will attempt merge after pass)
              ticket.status = 'eval';
              ticket.agent = {
                ...existingAgent,
                name: run.agentName,
                run_id: run.runId,
                state: 'completed',
                finished_at: run.finishedAt || null,
                duration_ms: run.durationMs,
                exit_code: run.exitCode,
                error: null
              };
              appendTicketNote(ticket, 'Merge resolved. Queued for eval.');
              logSchedulerEvent('merge_resolve.success', 'info', `Merge resolve succeeded for ${ticket.id}`, { ticketId: ticket.id, runId: run.runId });
              mergeResolved = true;
            }
          } else {
            // No SUCCESS marker — treat as merge_failed for retry
            ticket.agent = {
              ...existingAgent,
              name: run.agentName,
              run_id: run.runId,
              state: 'merge_failed',
              finished_at: run.finishedAt || null,
              duration_ms: run.durationMs,
              exit_code: run.exitCode,
              error: null
            };
            keepRunLogs = true;
            appendTicketNote(ticket, 'Merge resolve completed but agent did not report SUCCESS.');
            logSchedulerEvent('merge_resolve.aborted', 'warn', `Merge resolve aborted for ${ticket.id} (no SUCCESS marker)`, { ticketId: ticket.id, runId: run.runId });
          }
        } else {
          // Run crashed — treat as merge_failed for retry
          ticket.agent = {
            ...existingAgent,
            name: run.agentName,
            run_id: run.runId,
            state: 'merge_failed',
            finished_at: run.finishedAt || null,
            duration_ms: run.durationMs,
            exit_code: run.exitCode,
            error: run.error || null
          };
          keepRunLogs = true;
          appendTicketNote(ticket, `Merge resolve run failed (exit code ${run.exitCode}).`);
          logSchedulerEvent('merge_resolve.failed', 'warn', `Merge resolve failed for ${ticket.id}`, { ticketId: ticket.id, runId: run.runId });
        }

        // Failed merge resolves: increment fail_count and enforce maxRetries
        if (!mergeResolved) {
          ticket.status = 'todo';
          if (typeof ticket.fail_count !== 'number') {
            ticket.fail_count = 0;
          }
          ticket.fail_count += 1;
          logSchedulerEvent('ticket.fail_count_incremented', 'warn', `Ticket ${ticket.id} merge failure count: ${ticket.fail_count}`, { ticketId: ticket.id, runId: run.runId, agentName: run.agentName, details: { failCount: ticket.fail_count } });
          const maxRetries = settingsStore.get('max_eval_retries', 2);
          if (ticket.fail_count >= maxRetries) {
            ticket.assignee = 'NONE';
            console.log(`[Backlog] Ticket ${ticket.id} has failed ${ticket.fail_count} times (max: ${maxRetries}). Setting assignee to NONE to prevent automation pickup.`);
            logSchedulerEvent('ticket.max_retries_reached', 'error', `Ticket ${ticket.id} reached max retries (${ticket.fail_count}/${maxRetries}). Assignee set to NONE.`, { ticketId: ticket.id, runId: run.runId, agentName: run.agentName, details: { failCount: ticket.fail_count, maxRetries } });
          } else {
            console.log(`[Backlog] Ticket ${ticket.id} merge failure count: ${ticket.fail_count}/${maxRetries}`);
          }
        }
        // Skip normal evalOutcome/status flow for merging tickets
        return;
      }

      // Test-specific outcome handling — parse structured test output
      if (previousStatus === 'test') {
        const testOutcome = resolveTestOutcomeAfterRun({
          runState: run.state,
          currentStatus: ticket.status,
          stdout: run.stdout,
          stderr: run.stderr,
          runError: run.error,
          finishedAt: run.finishedAt
        });

        ticket.status = testOutcome.nextStatus;

        const testNote = formatTestOutcomeNote({
          finishedAt: run.finishedAt,
          previousStatus,
          verdict: testOutcome.verdict,
          reasons: testOutcome.reasons,
          testSummary: testOutcome.testSummary
        });
        if (testNote) {
          appendTicketNote(ticket, testNote);
        }

        if (testOutcome.verdict === 'fail') {
          if (typeof ticket.fail_count !== 'number') ticket.fail_count = 0;
          ticket.fail_count += 1;
          ticket.test_summary = testOutcome.testSummary;
          logSchedulerEvent('test.fail', 'warn', `Test failed for ${ticket.id}`, { ticketId: ticket.id, runId: run.runId, agentName: run.agentName, details: { failCount: ticket.fail_count } });

          const maxRetries = settingsStore.get('max_eval_retries', 2);
          if (ticket.fail_count >= maxRetries) {
            ticket.assignee = 'NONE';
            logSchedulerEvent('ticket.max_retries_reached', 'error', `Ticket ${ticket.id} reached max retries (${ticket.fail_count}/${maxRetries}). Assignee set to NONE.`, { ticketId: ticket.id, runId: run.runId, agentName: run.agentName });
          }
        } else if (testOutcome.verdict === 'pass') {
          ticket.test_summary = null;
          logSchedulerEvent('test.pass', 'info', `Test passed for ${ticket.id}`, { ticketId: ticket.id, runId: run.runId, agentName: run.agentName });
        }

        // Set agent metadata and notes, then return (skip eval flow)
        const existingAgent = ticket.agent && typeof ticket.agent === 'object' ? ticket.agent : {};
        ticket.agent = {
          ...existingAgent,
          name: run.agentName,
          run_id: run.runId,
          state: run.state,
          started_at: run.startedAt || existingAgent.started_at || null,
          finished_at: run.finishedAt || null,
          duration_ms: run.durationMs,
          pid: run.pid || existingAgent.pid || null,
          signal: run.signal || null,
          command: run.command || existingAgent.command || null,
          args: run.args || existingAgent.args || [],
          exit_code: run.exitCode,
          stdout_tail: null,
          stderr_tail: null,
          stdout_log_file: keepRunLogs ? (logPaths?.stdoutRelative || existingAgent.stdout_log_file || null) : null,
          stderr_log_file: keepRunLogs ? (logPaths?.stderrRelative || existingAgent.stderr_log_file || null) : null,
          stdout_truncated: !!run.stdoutTruncated,
          stderr_truncated: !!run.stderrTruncated,
          error: run.error || null
        };

        if (run.state !== 'completed') {
          appendTicketNote(ticket, `Run crashed: ${run.error || 'unknown error'}`);
        }
        return;
      }

      if (previousStatus === 'eval' && evalOutcome.nextStatus === 'review' && evalOutcome.verdict === 'pass') {
        logSchedulerEvent('eval.pass', 'info', `Eval passed for ${ticket.id}`, { ticketId: ticket.id, runId: run.runId, agentName: run.agentName });
        try {
          const mergeResult = squashMergeTicketBranchSync(ticket.id, {
            projectRoot: PROJECT_ROOT,
            title: ticket.title
          });
          appendTicketNote(ticket, 'Eval passed. Squash merge completed.');
          logSchedulerEvent('eval.squash_merge', 'info', `Squash merge completed: ${mergeResult.branch} -> ${mergeResult.baseBranch}`, { ticketId: ticket.id, runId: run.runId, details: { commitSha: mergeResult.commitSha } });
          // Clean up worktree and branch after successful merge
          removeWorktree(ticket.id, { projectRoot: PROJECT_ROOT }).catch((err) => {
            console.error(`[Scheduler] Failed to remove worktree for ${ticket.id}:`, err.message);
          });
        } catch (error) {
          const isConflict = error?.details?.conflict === true;
          const mergeDetails = summarizeSquashMergeFailure(error);
          if (isConflict) {
            appendTicketNote(ticket, 'Eval passed but squash merge hit conflicts.');
            logSchedulerEvent('eval.squash_conflict', 'warn', `Squash merge conflict for ${ticket.id}`, { ticketId: ticket.id, runId: run.runId });
          } else {
            appendTicketNote(ticket, 'Eval passed but squash merge failed. Manual merge required.');
          }
          if (isConflict) {
            evalOutcome = {
              nextStatus: 'todo',
              verdict: 'fail',
              evalSummary: {
                verdict: 'FAIL',
                criteria_checks: evalOutcome?.evalSummary?.criteria_checks || [],
                timestamp: run.finishedAt || new Date().toISOString()
              },
              reasons: [
                `Automatic squash merge failed due to conflicts: ${error?.message || 'unknown error'}`
              ]
            };
            // Flag for merge resolution — agent.state will be set after ticket update
            ticket._mergeFailed = true;
          }
        }
      }

      // Guard: if implementation run produced no commits, don't promote to test
      const isImplementationPhase = previousStatus === 'in_progress' || previousStatus === 'building';
      if (isImplementationPhase && evalOutcome.nextStatus === 'test' && !implementationCommitted) {
        evalOutcome = {
          nextStatus: 'todo',
          verdict: 'fail',
          reasons: ['Implementation run completed but produced no code changes.']
        };
        appendTicketNote(ticket, 'Implementation produced no code changes.');
        logSchedulerEvent('implementation.empty', 'warn', `Implementation run for ${ticket.id} produced no changes`, { ticketId: ticket.id, runId: run.runId, agentName: run.agentName });
      }

      ticket.status = evalOutcome.nextStatus;

      // Eval verdict note
      if (previousStatus === 'eval') {
        if (evalOutcome.verdict === 'pass' && evalOutcome.nextStatus === 'review') {
          appendTicketNote(ticket, 'Eval passed.');
        } else if (evalOutcome.verdict === 'fail' || evalOutcome.nextStatus === 'todo') {
          const reasons = Array.isArray(evalOutcome.reasons) && evalOutcome.reasons.length > 0
            ? evalOutcome.reasons.map(r => `- ${r}`).join('\n')
            : '';
          appendTicketNote(ticket, reasons ? `Eval failed.\n${reasons}` : 'Eval failed.');
          logSchedulerEvent('eval.fail', 'warn', `Eval failed for ${ticket.id}`, { ticketId: ticket.id, runId: run.runId, agentName: run.agentName });
        }
      }

      // Track run failures and enforce max-retries limit.
      // A failure is any outcome that sends the ticket back to todo — process
      // crashes, eval verdict failures, AND empty implementation runs.
      const isRunFailure = run.state === 'failed' && evalOutcome.nextStatus === 'todo';
      const isEvalVerdictFailure = previousStatus === 'eval'
        && evalOutcome.nextStatus === 'todo'
        && evalOutcome.verdict !== 'pass';
      const isImplementationFailure = isImplementationPhase
        && evalOutcome.nextStatus === 'todo'
        && evalOutcome.verdict === 'fail';
      if (isRunFailure || isEvalVerdictFailure || isImplementationFailure) {
        if (typeof ticket.fail_count !== 'number') {
          ticket.fail_count = 0;
        }
        if (typeof ticket.eval_fail_count !== 'number') {
          ticket.eval_fail_count = 0;
        }
        ticket.fail_count += 1;
        if (isEvalVerdictFailure) {
          ticket.eval_fail_count += 1;
          logSchedulerEvent('ticket.eval_fail_count_incremented', 'warn', `Ticket ${ticket.id} eval failure count: ${ticket.eval_fail_count}`, { ticketId: ticket.id, runId: run.runId, agentName: run.agentName, details: { evalFailCount: ticket.eval_fail_count } });
        }
        logSchedulerEvent('ticket.fail_count_incremented', 'warn', `Ticket ${ticket.id} failure count: ${ticket.fail_count}`, { ticketId: ticket.id, runId: run.runId, agentName: run.agentName, details: { failCount: ticket.fail_count } });
        const maxRetries = settingsStore.get('max_eval_retries', 2);
        if (ticket.fail_count >= maxRetries) {
          ticket.assignee = 'NONE';
          console.log(`[Backlog] Ticket ${ticket.id} has failed ${ticket.fail_count} times (max: ${maxRetries}). Setting assignee to NONE to prevent automation pickup.`);
          logSchedulerEvent('ticket.max_retries_reached', 'error', `Ticket ${ticket.id} reached max retries (${ticket.fail_count}/${maxRetries}). Assignee set to NONE.`, { ticketId: ticket.id, runId: run.runId, agentName: run.agentName, details: { failCount: ticket.fail_count, maxRetries } });
        } else {
          console.log(`[Backlog] Ticket ${ticket.id} failure count: ${ticket.fail_count}/${maxRetries}`);
        }
      }

      // Reset fail_count only on eval pass (ticket moving to review), not on
      // any completed run — a completed run with verdict FAIL should not reset.
      if (previousStatus === 'eval' && evalOutcome.nextStatus === 'review' && evalOutcome.verdict === 'pass') {
        if (typeof ticket.fail_count === 'number' && ticket.fail_count > 0) {
          console.log(`[Backlog] Ticket ${ticket.id} eval passed. Resetting fail_count from ${ticket.fail_count} to 0.`);
          ticket.fail_count = 0;
        }
        if (typeof ticket.eval_fail_count === 'number' && ticket.eval_fail_count > 0) {
          ticket.eval_fail_count = 0;
        }
      }

      if (previousStatus === 'eval') {
        ticket.eval_summary = evalOutcome.evalSummary;

        // Update acceptance_criteria with tick marks from eval results
        if (evalOutcome.evalSummary && Array.isArray(ticket.acceptance_criteria) && Array.isArray(evalOutcome.evalSummary.criteria_checks)) {
          const checks = evalOutcome.evalSummary.criteria_checks;
          ticket.acceptance_criteria = ticket.acceptance_criteria.map((criterion) => {
            const clean = criterion.replace(/^\[[ x]\]\s*/, '');
            const match = checks.find((c) =>
              c.criterion && (
                c.criterion.toLowerCase().includes(clean.toLowerCase()) ||
                clean.toLowerCase().includes(c.criterion.toLowerCase())
              )
            );
            if (match) {
              return match.result === 'PASS' ? `[x] ${clean}` : `[ ] ${clean}`;
            }
            return clean;
          });
        }
      }

      const existingAgent = ticket.agent && typeof ticket.agent === 'object' ? ticket.agent : {};
      ticket.agent = {
        ...existingAgent,
        name: run.agentName,
        run_id: run.runId,
        state: run.state,
        started_at: run.startedAt || existingAgent.started_at || null,
        finished_at: run.finishedAt || null,
        duration_ms: run.durationMs,
        pid: run.pid || existingAgent.pid || null,
        signal: run.signal || null,
        command: run.command || existingAgent.command || null,
        args: run.args || existingAgent.args || [],
        exit_code: run.exitCode,
        stdout_tail: null,
        stderr_tail: null,
        stdout_log_file: keepRunLogs ? (logPaths?.stdoutRelative || existingAgent.stdout_log_file || null) : null,
        stderr_log_file: keepRunLogs ? (logPaths?.stderrRelative || existingAgent.stderr_log_file || null) : null,
        stdout_truncated: !!run.stdoutTruncated,
        stderr_truncated: !!run.stderrTruncated,
        error: run.error || null
      };

      // Set merge_failed state when squash merge hit conflicts after eval pass
      if (ticket._mergeFailed) {
        ticket.agent.state = 'merge_failed';
        delete ticket._mergeFailed;
      }

      if (run.state === 'completed') {
        logSchedulerEvent('run.finished', 'info', `Run completed: ${run.agentName} on ${run.ticketId} (exit=${run.exitCode})`, { ticketId: run.ticketId, runId: run.runId, agentName: run.agentName, details: { exitCode: run.exitCode, durationMs: run.durationMs } });
      } else {
        appendTicketNote(ticket, `Run crashed: ${run.error || 'unknown error'}`);
        logSchedulerEvent('run.failed', 'error', `Run failed: ${run.agentName} on ${run.ticketId}${run.error ? `: ${run.error}` : ''}`, { ticketId: run.ticketId, runId: run.runId, agentName: run.agentName, details: { exitCode: run.exitCode, error: run.error || null } });
      }

    });
    if (keepRunLogs) {
      runOutputFilesByRunId.delete(run.runId);
    } else {
      removeRunOutputFile(logPaths?.stdoutPath);
      removeRunOutputFile(logPaths?.stderrPath);
      runOutputFilesByRunId.delete(run.runId);
    }

    // Trigger title bar branding update for KIMI_PICKUP-009
    if (run.ticketId === 'KIMI_PICKUP-009' && run.state === 'completed' && run.exitCode === 0) {
      const newTitle = 'Ombuto Code 3';
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.setTitle(newTitle);
          win.webContents.send('app:titleBrandingChanged', { title: newTitle });
        }
      });
    }

    // ── Feature evaluation completion hook ─────────────────────────────
    const featureEvalInfo = activeFeatureEvals.get(run.runId);
    if (featureEvalInfo) {
      activeFeatureEvals.delete(run.runId);

      let verdict = 'UNKNOWN';
      let evalOutput = '';

      if (run.state === 'completed' && run.exitCode === 0) {
        const rawOutput = `${run.stdout || ''}\n${run.stderr || ''}`;
        const plainText = extractTextFromStreamJson(rawOutput);
        evalOutput = plainText;

        if (/FEATURE_EVALUATION_RESULT:\s*PASS/i.test(plainText)) {
          verdict = 'PASS';
        } else if (/FEATURE_EVALUATION_RESULT:\s*FAIL/i.test(plainText)) {
          verdict = 'FAIL';
        }
      } else {
        evalOutput = run.error || 'Agent process failed';
      }

      if (verdict === 'PASS') {
        // Update feature file status to complete
        try {
          const featurePath = path.join(EPICS_DIR, featureEvalInfo.fileName);
          const content = fs.readFileSync(featurePath, 'utf-8');
          const fLines = content.split(/\r?\n/);
          const today = new Date().toISOString().split('T')[0];

          let statusSet = false;
          let updatedSet = false;
          for (let i = 0; i < fLines.length; i++) {
            if (fLines[i].startsWith('Status:')) {
              fLines[i] = 'Status: complete';
              statusSet = true;
            }
            if (fLines[i].startsWith('Last Updated:')) {
              fLines[i] = `Last Updated: ${today}`;
              updatedSet = true;
            }
          }
          if (!statusSet) {
            const titleIdx = fLines.findIndex(l => l.startsWith('# '));
            fLines.splice(titleIdx >= 0 ? titleIdx + 1 : 0, 0, 'Status: complete');
          }
          if (!updatedSet) {
            const createdIdx = fLines.findIndex(l => l.startsWith('Created:'));
            fLines.splice(createdIdx >= 0 ? createdIdx + 1 : 1, 0, `Last Updated: ${today}`);
          }
          // Mark all acceptance criteria checkboxes as done
          for (let i = 0; i < fLines.length; i++) {
            if (/^- \[ \] /.test(fLines[i])) {
              fLines[i] = fLines[i].replace('- [ ] ', '- [x] ');
            }
          }
          fs.writeFileSync(featurePath, fLines.join('\n'), 'utf-8');
          console.log(`[FeatureEval] Feature ${featureEvalInfo.fileName} marked complete with criteria checked`);
        } catch (e) {
          console.error(`[FeatureEval] Failed to update feature status: ${e.message}`);
        }

        // Update PRD section 15
        const titleLine = (() => {
          try {
            const c = fs.readFileSync(path.join(EPICS_DIR, featureEvalInfo.fileName), 'utf-8');
            const tl = c.split(/\r?\n/).find(l => l.startsWith('# ')) || '';
            return tl.replace(/^#\s*/, '').trim() || featureEvalInfo.fileName;
          } catch { return featureEvalInfo.fileName; }
        })();
        updatePrdWithFeatureEvalResult(titleLine, featureEvalInfo.tickets, verdict, evalOutput);
      }

      // Send event to renderer
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('epics:evalComplete', {
            runId: run.runId,
            fileName: featureEvalInfo.fileName,
            verdict,
            stdout: evalOutput
          });
        }
      });

      console.log(`[FeatureEval] Evaluation complete: ${featureEvalInfo.fileName} → ${verdict}`);
    }

    // Notify scheduler of run completion for cooldown tracking
    scheduler.onRunFinished(run);
  }
});

// --- Scheduler: automatic ticket pickup ---
const logSchedulerEvent = createSchedulerLogger();
const scheduler = createScheduler({
  readBacklogData,
  writeBacklogData,
  readAgentsConfig,
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
  onEvalPreparationFailed: ({ ticketId, error }) => {
    const timestamp = new Date().toISOString();
    const isConflict = error?.details?.conflict === true;
    const rebaseAttempted = !!error?.rebaseAttempted;
    const detailLines = summarizeTrialMergeFailure(error);
    logSchedulerEvent('eval.preparation_failed', 'error', `Eval preparation failed for ${ticketId}: ${error?.message || error}`, { ticketId, details: { isConflict, rebaseAttempted } });

    updateTicket(ticketId, (ticket) => {
      const previousStatus = ticket.status;
      ticket.status = 'todo';

      if (isConflict) {
        ticket.agent = {
          ...(ticket.agent || {}),
          state: 'merge_failed'
        };
      }

      if (rebaseAttempted) {
        appendTicketNote(ticket, 'Trial merge failed. Auto-rebase also failed.');
      } else if (isConflict) {
        appendTicketNote(ticket, 'Trial merge failed (merge conflict).');
      } else {
        appendTicketNote(ticket, 'Trial merge preparation failed.');
      }
    });

    // Re-dispatch so the scheduler can transition the merge_failed ticket to
    // 'merging' status in the next processQueue pass.  Because we are already
    // inside a dispatch call, the reentrancy guard will set dispatchQueued and
    // the do-while loop will re-run processQueue automatically.
    scheduler.dispatch({ reason: 'eval-preparation-failed' });
  },
});

function persistSchedulerRunningState(isRunning) {
  const state = scheduler.windowTracker.loadState();
  state.scheduler_running = !!isRunning;
  scheduler.windowTracker.saveState(state);
}

function isDevServerAvailable(devServerUrl, timeoutMs = 800) {
  return new Promise((resolve) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(devServerUrl);
    } catch {
      resolve(false);
      return;
    }

    const transport = parsedUrl.protocol === 'https:' ? require('https') : require('http');
    const req = transport.request(
      {
        method: 'GET',
        host: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: '/',
        timeout: timeoutMs
      },
      (res) => {
        res.destroy();
        resolve(true);
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.on('error', () => resolve(false));
    req.end();
  });
}

function resolveWindowIconPath() {
  const preferredFiles = process.platform === 'win32'
    ? ['icon.ico', 'icon.png']
    : ['icon.png'];
  const baseDirs = [
    path.join(__dirname, 'src', 'assets'),
    process.resourcesPath ? path.join(process.resourcesPath, 'src', 'assets') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar', 'src', 'assets') : null
  ].filter(Boolean);

  for (const fileName of preferredFiles) {
    for (const baseDir of baseDirs) {
      const candidate = path.join(baseDir, fileName);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return path.join(__dirname, 'src', 'assets', 'icon.png');
}

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1791,
    height: 880,
    frame: false,
    transparent: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
      enableRemoteModule: true
    },
    title: 'Ombuto Code',
    icon: resolveWindowIconPath(),
    show: false
  });

  // Enable @electron/remote for this window
  require('@electron/remote/main').enable(mainWindow.webContents);

  // No native menu for frameless window
  Menu.setApplicationMenu(null);

  // Load the app. In unpackaged mode, prefer Vite dev server and fall back to dist build.
  const devServerUrl = process.env.ELECTRON_RENDERER_URL || process.env.VITE_DEV_SERVER_URL || 'http://localhost:5174';
  const indexFilePath = path.join(__dirname, 'dist', 'index.html');

  if (isDev) {
    isDevServerAvailable(devServerUrl).then((isAvailable) => {
      if (isAvailable) {
        mainWindow.loadURL(devServerUrl).catch((error) => {
          console.warn('Dev server unavailable, falling back to dist build:', error?.message || error);
          mainWindow.loadFile(indexFilePath);
        });
        return;
      }

      console.log(`Dev server not reachable at ${devServerUrl}, loading dist build`);
      mainWindow.loadFile(indexFilePath);
    });
  } else {
    mainWindow.loadFile(indexFilePath);
  }

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('Renderer failed to load:', { errorCode, errorDescription, validatedURL });
  });

  // Open DevTools only when explicitly requested in development
  if (isDev && process.env.OMBUTOCODE_OPEN_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle window close with warning when agents have active tickets
  mainWindow.on('close', (event) => {
    // Check if any agents are actively working on tickets
    const status = scheduler.getStatus();
    const activeRuns = status.activeRuns || [];
    
    if (activeRuns.length > 0) {
      // Prevent default close behavior
      event.preventDefault();
      
      // Show confirmation dialog
      const { dialog } = require('electron');
      const activeRunCount = activeRuns.length;
      const ticketList = activeRuns.map(run => `  • ${run.ticketId} (${run.agentName})`).join('\n');
      
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Active Agents Warning',
        message: `${activeRunCount} agent${activeRunCount > 1 ? 's are' : ' is'} currently working on tickets`,
        detail: `The following tickets are in progress:\n${ticketList}\n\nAre you sure you want to close the app?`,
        buttons: ['Cancel', 'Close App'],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      }).then((result) => {
        if (result.response === 1) {
          // User confirmed - close the window
          mainWindow.destroy();
        }
        // User cancelled - window stays open, work continues
      });
    }
    // If no active runs, allow normal close behavior
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle the URL when the app is opened with a URL
  if (process.argv.length >= 2) {
    const urlArg = process.argv.find(arg => arg && arg.startsWith('ombutocode://'));
    if (urlArg) {
      handleUrl(urlArg);
    }
  }
}

app.setAsDefaultProtocolClient('ombutocode');

if (process.platform === 'win32') {
  app.setAppUserModelId('com.ombutocode.app');
}

// Handle protocol for macOS
app.on('open-url', (event, url) => {
  event.preventDefault();
  console.log('Received open-url event with URL:', url);
  
  if (url && typeof url === 'string' && url.startsWith('ombutocode://')) {
    if (mainWindow) {
      handleUrl(url);
    } else {
      // If the main window isn't ready yet, store the URL to handle when it is
      app.whenReady().then(() => {
        handleUrl(url);
      });
    }
  }
});

// Create a simple HTTP server to handle OAuth callbacks
const http = require('http');
const url = require('url');

// Handle protocol for Windows
app.whenReady().then(async () => {
  // Create HTTP server for OAuth callbacks
  const server = http.createServer((req, res) => {
    const reqUrl = url.parse(req.url, true);
    
    if (reqUrl.pathname === '/auth/dropbox/callback') {
      const { code, state } = reqUrl.query;
      
      // Get the main window
      const targetWindow = mainWindow || BrowserWindow.getAllWindows()[0];
      
      if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send('dropbox-auth-callback', { code, state });
        
        if (targetWindow.isMinimized()) {
          targetWindow.restore();
        }
        targetWindow.focus();
      }
      
      // Send a response to close the window
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <body>
            <h2>Authentication successful!</h2>
            <p>You can close this window and return to the application.</p>
            <script>window.close();</script>
          </body>
        </html>
      `);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  
  // Start the server on the local OAuth callback port
  server.listen(31031, 'localhost', () => {
    console.log('OAuth callback server running on http://localhost:31031');
  });
  
  // Register the custom protocol handler for ombutocode://
  protocol.registerHttpProtocol('ombutocode', (req) => {
    try {
      const url = new URL(req.url);
      console.log('=== DROPBOX AUTH CALLBACK HANDLER ===');
      console.log('Handling protocol URL:', url.toString());
      
      // Check if this is a Dropbox OAuth callback (support both /auth/dropbox/callback and /dropbox/callback)
      if (url.pathname === '/auth/dropbox/callback' || url.pathname === '/dropbox/callback') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        
        console.log('Auth callback received with parameters:', {
          hasCode: !!code,
          hasState: !!state,
          stateValue: state || 'None'
        });
        
        // Get all browser windows
        const allWindows = BrowserWindow.getAllWindows();
        console.log(`Found ${allWindows.length} browser windows`);
        
        // Try to find a suitable window to send the callback to
        const targetWindow = mainWindow || allWindows[0];
        
        if (targetWindow && !targetWindow.isDestroyed()) {
          console.log('Sending auth callback to renderer process...');
          
          // Send the auth callback to the renderer process
          targetWindow.webContents.send('dropbox-auth-callback', { 
            code, 
            state,
            timestamp: new Date().toISOString()
          });
          
          // Focus the window
          console.log('Bringing window to front...');
          if (targetWindow.isMinimized()) {
            console.log('Restoring minimized window...');
            targetWindow.restore();
          }
          
          // Focus and show the window
          targetWindow.show();
          targetWindow.focus();
          
          console.log('Auth callback handling complete');
        } else {
          console.error('No suitable window found to handle Dropbox callback');
          // Store the auth data temporarily in case the window isn't ready yet
          if (code && state) {
            console.log('Storing auth data for later use');
            // You might want to implement a way to store this temporarily
            // and check it when the renderer is ready
          }
        }
      } else {
        console.log('Unhandled protocol path:', url.pathname);
      }
    } catch (error) {
      console.error('Error handling protocol URL:', error);
    } finally {
      console.log('=== END DROPBOX AUTH CALLBACK HANDLER ===');
    }
  });
  
  console.log('Custom protocol handler registered');

  // Handle the case when the app is launched with a URL
  if (process.platform === 'win32' && process.argv.length >= 2) {
    const url = process.argv.find(arg => arg.startsWith('ombutocode://'));
    if (url) {
      handleUrl(url);
    }
  }

  createWindow();
  trimAgentLog();

  // Clean up old run-output log files (non-blocking, best-effort)
  const activeRunFiles = new Set();
  for (const paths of runOutputFilesByRunId.values()) {
    if (paths.stdout) activeRunFiles.add(paths.stdout);
    if (paths.stderr) activeRunFiles.add(paths.stderr);
  }
  cleanupRunOutput(RUN_OUTPUT_DIR, activeRunFiles);

  checkGitVersionSupport({
    logger: console,
    onWarning: ({ message, detail }) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const { dialog } = require('electron');
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: message,
        message,
        detail,
        buttons: ['OK'],
        defaultId: 0,
        noLink: true
      }).catch((error) => {
        console.warn('[Git] Failed to show startup warning dialog:', error?.message || error);
      });
    }
  }).catch((error) => {
    console.warn('[Git] Startup git version check failed unexpectedly:', error?.message || error);
  });

  // Migrate from pre-restructure docs/ layout to .ombutocode/ (one-time)
  try {
    const migrationResult = migrateToOmbutocodeStructure(PROJECT_ROOT);
    if (migrationResult.migrated) {
      console.log('[Migration] Migrated project data to .ombutocode/:', migrationResult.moved.length, 'files moved');
      migrationResult.moved.forEach(m => console.log('  ', m));
    }
  } catch (migrationError) {
    console.error('[Migration] Failed to migrate project data:', migrationError.message);
  }

  // Ensure .ombutocode/ directory structure exists
  try {
    ensureOmbutocodeStructure(PROJECT_ROOT, APP_ROOT);
    console.log('[Init] .ombutocode/ structure verified at', PROJECT_ROOT);
  } catch (initError) {
    console.error('[Init] Failed to initialize .ombutocode/ structure:', initError.message);
  }

  // Initialize unified SQLite database (consolidates archive + requests)
  try {
    const archiveDb = require('./src/main/archiveDb');
    setArchiveDb(archiveDb);

    // Legacy: migrate archive.yml → archive.db if needed (before consolidation)
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

    // Open unified database (creates schemas for both archive + requests + backlog)
    await ombutocodeDb.open(OMBUTOCODE_DB_PATH);
    console.log('[Database] Unified database initialized at', OMBUTOCODE_DB_PATH);

    // Initialize artifact tables on the shared database
    const artifactDb = require('./src/main/artifactDb');
    try {
      artifactDb.open(ombutocodeDb.getDb());
      console.log('[Database] Artifact schema initialized');
    } catch (e) {
      console.error('[Database] Artifact schema init failed:', e);
    }

    // Initialize planCoreUtilities
    const planCoreUtilities = require('./src/main/planCoreUtilities');
    planCoreUtilities.init(PROJECT_ROOT);

    // One-time migration from standalone DBs into unified DB
    if (fs.existsSync(ARCHIVE_DB_PATH) || fs.existsSync(REQUESTS_DB_PATH)) {
      const result = await ombutocodeDb.migrateFromStandalone(ARCHIVE_DB_PATH, REQUESTS_DB_PATH);
      console.log('[Database] Standalone migration complete:', result);
    }

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

  // Periodically reload the database from disk to pick up external changes
  const refreshSeconds = settingsStore.get('app_refresh_interval') || 30;
  setInterval(() => {
    try {
      ombutocodeDb.reloadFromDisk();
    } catch (err) {
      console.error('[Database] Reload from disk failed:', err.message);
    }
  }, refreshSeconds * 1000);

  // ── Startup agent connectivity check ──
  const agentConnectivityResults = {};
  const AGENTS_TO_TEST = [
    { id: 'claude', name: 'Claude', command: 'claude' },
    { id: 'codex', name: 'Codex', command: 'codex' },
    { id: 'kimi', name: 'Kimi', command: 'kimi' },
  ];

  (async () => {
    const { exec } = require('child_process');
    let anyConnected = false;
    for (const agent of AGENTS_TO_TEST) {
      try {
        const output = await new Promise((resolve, reject) => {
          exec(`"${agent.command}" --version`, { timeout: 10000 }, (err, stdout, stderr) => {
            if (err) reject(err); else resolve((stdout || stderr || '').trim());
          });
        });
        agentConnectivityResults[agent.id] = { status: 'pass', detail: output, enabled: true };
        anyConnected = true;
        console.log(`[Agent Check] ${agent.name}: connected (${output})`);
      } catch (e) {
        agentConnectivityResults[agent.id] = {
          status: 'fail',
          detail: e.code === 'ENOENT' ? `"${agent.command}" not found on PATH` : (e.message || 'Not available'),
          enabled: false
        };
        console.log(`[Agent Check] ${agent.name}: not available`);
      }
    }

    if (!anyConnected && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:noAgentsConnected');
    }
  })();

  ipcMain.handle('agent:getStartupResults', () => {
    return agentConnectivityResults;
  });

  // Restore scheduler state from last session (default: running)
  const savedState = scheduler.windowTracker.loadState();
  const shouldAutoStart = savedState.scheduler_running !== false;
  if (shouldAutoStart) {
    scheduler.start();
  }
  console.log(`[Scheduler] Restored auto mode: ${shouldAutoStart ? 'ON' : 'OFF'}`);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  scheduler.stop();
  // Kill all active PTY shells to avoid node-pty assertion errors on exit
  for (const [id, proc] of activeShells) {
    try { proc.kill(); } catch (_) { /* already dead */ }
    activeShells.delete(id);
  }
  // Don't persist false here - preserve the user's last preference
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle the OAuth callback URL
function handleUrl(url) {
  console.log('=== HANDLING DROPBOX CALLBACK URL ===');
  console.log('URL:', url);
  
  if (!mainWindow) {
    console.error('No mainWindow available to handle URL');
    return;
  }

  try {
    const urlObj = new URL(url);
    console.log('Parsed URL:', {
      protocol: urlObj.protocol,
      pathname: urlObj.pathname,
      search: urlObj.search,
      hash: urlObj.hash
    });

    // Handle both /auth/dropbox/callback and /dropbox/callback paths
    if (urlObj.protocol === 'ombutocode:' && 
        (urlObj.pathname === '//auth/dropbox/callback' || urlObj.pathname === '//dropbox/callback')) {
      
      console.log('Processing Dropbox OAuth callback');
      
      // Get the code and state from the URL
      const params = new URLSearchParams(urlObj.search);
      const code = params.get('code');
      const state = params.get('state');
      const error = params.get('error');
      
      console.log('OAuth callback parameters:', { code: !!code, state, error });
      
      if (error) {
        console.error('OAuth error:', error, params.get('error_description'));
        mainWindow.webContents.send('dropbox-auth-error', {
          error: error,
          errorDescription: params.get('error_description')
        });
        return;
      }
      
      if (!code) {
        console.error('No authorization code in callback URL');
        mainWindow.webContents.send('dropbox-auth-error', {
          error: 'no_code',
          errorDescription: 'No authorization code received from Dropbox'
        });
        return;
      }
      
      // Forward the code and state to the renderer process
      console.log('Sending auth callback to renderer process');
      mainWindow.webContents.send('dropbox-auth-callback', {
        code,
        state,
        timestamp: new Date().toISOString()
      });
      
      // Focus the window
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  } catch (error) {
    console.error('Error handling URL:', error);
    console.error('URL that caused the error:', url);
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('dropbox-auth-error', {
        error: 'url_processing_error',
        errorDescription: error.message
      });
    }
  }
}

// Handle the app being opened with a URL (Windows)
app.on('second-instance', (event, commandLine) => {
  // Someone tried to run a second instance, we should focus our window
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  
  // Handle the URL if one was passed
  if (process.platform === 'win32' && commandLine.length > 1) {
    handleUrl(commandLine.pop());
  }
});

// IPC handlers
ipcMain.handle('app:getProjectRoot', () => {
  return PROJECT_ROOT;
});

ipcMain.handle('app:getBuildInfo', () => {
  try {
    const { execFileSync } = require('child_process');
    const ombutocodeSrc = path.join(PROJECT_ROOT, '.ombutocode', 'src');
    const hash = execFileSync('git', ['log', '-1', '--format=%h', '--', ombutocodeSrc], {
      cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 5000
    }).trim();
    const version = require('./package.json').version;
    return { version, hash: hash || '?' };
  } catch {
    return { version: '?', hash: '?' };
  }
});

ipcMain.handle('app:getPath', (_, pathName) => {
  return app.getPath(pathName);
});

// Window control IPC handlers
ipcMain.on('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

// Title bar branding IPC handlers
ipcMain.handle('app:setTitleBranding', async (_, { title }) => {
  if (typeof title === 'string' && title.trim()) {
    app.setAppUserModelId?.(title);
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.setTitle(title);
        win.webContents.send('app:titleBrandingChanged', { title });
      }
    });
    return { success: true, title };
  }
  return { success: false, error: 'Invalid title' };
});

ipcMain.handle('app:getTitleBranding', async () => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  return { title: win?.getTitle?.() || 'Ombuto Code' };
});

ipcMain.on('window:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.isMaximized() ? win.unmaximize() : win.maximize();
  }
});

ipcMain.on('window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

// Backlog YAML IPC handlers
ipcMain.handle('backlog:read', async () => {
  return readBacklogData();
});

ipcMain.handle('backlog:updateStatus', async (_, { ticketId, newStatus }) => {
  const ticket = backlogDb.getTicketById(ticketId);
  if (!ticket) throw new Error(`Ticket ${ticketId} not found`);
  const previousStatus = ticket.status;

  // AD_HOC-032: Check dependencies when transitioning to in_progress
  if (newStatus === 'in_progress') {
    const allData = backlogDb.readBacklogData();
    const ticketStatusById = new Map(
      (allData.tickets || []).map((t) => [t.id, t.status])
    );
    if (!hasResolvedDependencies(ticket, ticketStatusById)) {
      const unresolvedDeps = (ticket.dependencies || [])
        .map((dep) => normalizeDependencyId(dep))
        .filter((depId) => {
          if (!depId) return false;
          const status = ticketStatusById.get(depId);
          return status !== 'review' && status !== 'done';
        });
      throw new Error(
        `Cannot start ticket ${ticketId} because it has unmet dependencies: ${unresolvedDeps.join(', ')}. Dependencies must be in 'review' or 'done' status before starting work.`
      );
    }
  }

  const timestamp = new Date().toISOString();
  const updates = {
    status: newStatus,
    last_updated: timestamp
  };

  // AD_HOC-029: Clear assignee when promoting from backlog to todo
  if (previousStatus === 'backlog' && newStatus === 'todo') {
    updates.assignee = 'NONE';
  }

  // Track test failures: increment counter when test → todo transition
  if (previousStatus === 'test' && newStatus === 'todo') {
    const failCount = (typeof ticket.fail_count === 'number' ? ticket.fail_count : 0) + 1;
    updates.fail_count = failCount;
    const maxRetries = settingsStore.get('max_eval_retries', 2);
    if (failCount >= maxRetries) {
      updates.assignee = 'NONE';
      console.log(`[Backlog] Ticket ${ticketId} has failed test ${failCount} times (max: ${maxRetries}). Setting assignee to NONE to prevent automation pickup.`);
    } else {
      console.log(`[Backlog] Ticket ${ticketId} test failure count: ${failCount}/${maxRetries}`);
    }
  }

  // Reset test_summary when test passes (ticket moving to eval)
  if (previousStatus === 'test' && newStatus === 'eval') {
    updates.test_summary = null;
  }

  // Track eval failures: increment counter when eval → todo transition
  if (previousStatus === 'eval' && newStatus === 'todo') {
    const evalFailCount = (typeof ticket.eval_fail_count === 'number' ? ticket.eval_fail_count : 0) + 1;
    updates.eval_fail_count = evalFailCount;
    const maxRetries = settingsStore.get('max_eval_retries', 2);
    if (evalFailCount >= maxRetries) {
      updates.assignee = 'NONE';
      console.log(`[Backlog] Ticket ${ticketId} has failed eval ${evalFailCount} times (max: ${maxRetries}). Setting assignee to NONE to prevent automation pickup.`);
    } else {
      console.log(`[Backlog] Ticket ${ticketId} eval failure count: ${evalFailCount}/${maxRetries}`);
    }
  }

  // Reset eval_fail_count when evaluation succeeds
  if (previousStatus === 'eval' && (newStatus === 'review' || newStatus === 'done')) {
    if (typeof ticket.eval_fail_count === 'number' && ticket.eval_fail_count > 0) {
      console.log(`[Backlog] Ticket ${ticketId} passed evaluation. Resetting eval_fail_count from ${ticket.eval_fail_count} to 0.`);
      updates.eval_fail_count = 0;
    }
  }

  backlogDb.updateTicketFields(ticketId, updates);
  ombutocodeDb.saveDb();

  const result = { success: true, ticketId, status: newStatus };

  const enteredQueuedState = (newStatus === 'todo' || newStatus === 'test' || newStatus === 'eval') && previousStatus !== newStatus;
  if (enteredQueuedState && scheduler && typeof scheduler.dispatch === 'function') {
    scheduler.dispatch({ reason: 'ticket-status-transition', ticketId, from: previousStatus, to: newStatus });
  }

  await cleanupOnDoneTransition({
    ticketId,
    previousStatus,
    newStatus,
    projectRoot: PROJECT_ROOT
  });

  // Clean up run output log files when ticket moves to review or done
  if (newStatus === 'review' || newStatus === 'done') {
    try {
      const runOutputDir = path.join(PROJECT_ROOT, '.ombutocode', 'run-output');
      if (fs.existsSync(runOutputDir)) {
        const logFiles = fs.readdirSync(runOutputDir).filter(f => f.startsWith(`${ticketId}__`));
        for (const file of logFiles) {
          fs.unlinkSync(path.join(runOutputDir, file));
        }
        if (logFiles.length > 0) {
          console.log(`[Backlog] Cleaned up ${logFiles.length} log files for ticket ${ticketId} (moved to ${newStatus})`);
        }
      }
    } catch (cleanupErr) {
      console.error(`[Backlog] Failed to clean up log files for ${ticketId}:`, cleanupErr?.message);
    }
  }

  return result;
});

ipcMain.handle('backlog:createAdHocFromPrompt', async (_, payload = {}) => {
  return createAdHocFromPrompt(payload);
});

ipcMain.handle('backlog:rejectReviewTicket', async (_, { ticketId, comment }) => {
  const normalizedComment = String(comment || '').trim();
  if (!normalizedComment) {
    throw new Error('Rejection comment is required');
  }

  const ticket = backlogDb.getTicketById(ticketId);
  if (!ticket) throw new Error(`Ticket ${ticketId} not found`);
  if (ticket.status !== 'review') {
    throw new Error(`Ticket ${ticketId} must be in review to reject`);
  }

  const timestamp = new Date().toISOString();
  const notes = ticket.notes
    ? `${ticket.notes}\n[${timestamp}] Rejected in review: ${normalizedComment}`
    : `[${timestamp}] Rejected in review: ${normalizedComment}`;

  backlogDb.updateTicketFields(ticketId, {
    status: 'todo',
    last_updated: timestamp,
    notes
  });
  ombutocodeDb.saveDb();

  if (scheduler && typeof scheduler.dispatch === 'function') {
    scheduler.dispatch({ reason: 'ticket-status-transition', ticketId, from: 'review', to: 'todo' });
  }

  return { success: true, ticketId, status: 'todo' };
});

ipcMain.handle('backlog:updateAssignee', async (_, { ticketId, assignee }) => {
  let normalized;
  if (assignee === null || assignee === undefined) {
    normalized = null;
  } else if (assignee && typeof assignee === 'object') {
    const tool = String(assignee.tool || '').trim();
    const model = String(assignee.model || '').trim();
    if (!tool || !model) {
      throw new Error('Object assignee must have non-empty tool and model fields');
    }
    normalized = { tool, model };
  } else {
    normalized = String(assignee || '').trim().toLowerCase();
    if (!normalized || normalized === 'none') {
      normalized = null;
    }
  }

  const ticket = backlogDb.getTicketById(ticketId);
  if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

  const ticketStatus = ticket.status;
  backlogDb.updateTicketFields(ticketId, {
    assignee: normalized,
    last_updated: new Date().toISOString()
  });
  ombutocodeDb.saveDb();

  if ((ticketStatus === 'todo' || ticketStatus === 'eval') && scheduler && typeof scheduler.dispatch === 'function') {
    scheduler.dispatch({ reason: 'ticket-assignment-change', ticketId, status: ticketStatus });
  }

  return { success: true, ticketId, assignee: normalized };
});

ipcMain.handle('backlog:updateFields', async (_, { ticketId, fields }) => {
  const ticket = backlogDb.getTicketById(ticketId);
  if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

  const updates = { ...fields, last_updated: new Date().toISOString() };
  backlogDb.updateTicketFields(ticketId, updates);
  ombutocodeDb.saveDb();

  return { success: true, ticketId };
});

ipcMain.handle('backlog:pickupByAgent', async (_, { ticketId, agent }) => {
  const normalizedAgent = String(agent || '').trim();
  if (!normalizedAgent) {
    throw new Error('Agent name is required');
  }

  const ticket = backlogDb.getTicketById(ticketId);
  if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

  const timestamp = new Date().toISOString();
  const pickupNote = `Picked up by AI coding agent ${normalizedAgent}.`;
  const notes = ticket.notes ? `${ticket.notes}\n${pickupNote}` : pickupNote;

  backlogDb.updateTicketFields(ticketId, {
    status: 'in_progress',
    assignee: normalizedAgent,
    last_updated: timestamp,
    notes
  });
  ombutocodeDb.saveDb();
  return { success: true };
});

ipcMain.handle('agent:startKimiForTicket', async (_, payload) => {
  try {
    const ticketId = typeof payload?.ticketId === 'string' ? payload.ticketId : '';
    const data = readBacklogData();
    const ticket = Array.isArray(data.tickets)
      ? data.tickets.find((entry) => entry.id === ticketId)
      : null;

    // AD_HOC-032: Check dependencies before starting
    if (ticket) {
      const ticketStatusById = new Map(
        (data.tickets || []).map((t) => [t.id, t.status])
      );
      if (!hasResolvedDependencies(ticket, ticketStatusById)) {
        const unresolvedDeps = (ticket.dependencies || [])
          .map((dep) => normalizeDependencyId(dep))
          .filter((depId) => {
            if (!depId) return false;
            const status = ticketStatusById.get(depId);
            return status !== 'review' && status !== 'done';
          });
        throw new Error(
          `Cannot start ticket ${ticketId} because it has unmet dependencies: ${unresolvedDeps.join(', ')}. Dependencies must be in 'review' or 'done' status before starting work.`
        );
      }
    }

    // Create worktree for this ticket (per feature_GIT_WORKTREES.md)
    const preparedWorktree = createWorktreeSync(ticketId, { projectRoot: PROJECT_ROOT });
    const workingDirectory = String(preparedWorktree?.worktreePath || '').trim();

    if (!workingDirectory) {
      throw new Error(`Failed to create worktree for ${ticketId}`);
    }

    const enrichedPayload = {
      ticketId,
      title: payload?.title || ticket?.title || ticketId,
      epicRef: payload?.epicRef || ticket?.epic_ref || '.ombutocode/epics',
      repoRoot: PROJECT_ROOT,
      modelId: resolveModelId('kimi', payload?.modelId),
      acceptanceCriteria: formatAcceptanceCriteria(ticket),
      retryContext: buildRetryContext(ticket || {})
    };

    logSchedulerEvent('agent.manual_start', 'info', `Manual start: kimi on ${ticketId}`, { ticketId, agentName: 'kimi', details: { modelId: enrichedPayload.modelId } });
    return agentRuntime.startKimi(enrichedPayload, { workingDirectory });
  } catch (error) {
    if (error instanceof AgentInvocationError) {
      throw new Error(`${error.code}: ${error.message}`);
    }
    throw error;
  }
});

ipcMain.handle('agent:startCodexForTicket', async (_, payload) => {
  try {
    const ticketId = typeof payload?.ticketId === 'string' ? payload.ticketId : '';
    const data = readBacklogData();
    const ticket = Array.isArray(data.tickets)
      ? data.tickets.find((entry) => entry.id === ticketId)
      : null;

    // AD_HOC-032: Check dependencies before starting
    if (ticket) {
      const ticketStatusById = new Map(
        (data.tickets || []).map((t) => [t.id, t.status])
      );
      if (!hasResolvedDependencies(ticket, ticketStatusById)) {
        const unresolvedDeps = (ticket.dependencies || [])
          .map((dep) => normalizeDependencyId(dep))
          .filter((depId) => {
            if (!depId) return false;
            const status = ticketStatusById.get(depId);
            return status !== 'review' && status !== 'done';
          });
        throw new Error(
          `Cannot start ticket ${ticketId} because it has unmet dependencies: ${unresolvedDeps.join(', ')}. Dependencies must be in 'review' or 'done' status before starting work.`
        );
      }
    }

    // Create worktree for this ticket (per feature_GIT_WORKTREES.md)
    const preparedWorktree = createWorktreeSync(ticketId, { projectRoot: PROJECT_ROOT });
    const workingDirectory = String(preparedWorktree?.worktreePath || '').trim();

    if (!workingDirectory) {
      throw new Error(`Failed to create worktree for ${ticketId}`);
    }

    const enrichedPayload = {
      ticketId,
      title: payload?.title || ticket?.title || ticketId,
      epicRef: payload?.epicRef || ticket?.epic_ref || '.ombutocode/epics',
      repoRoot: PROJECT_ROOT,
      modelId: resolveModelId('codex', payload?.modelId),
      acceptanceCriteria: formatAcceptanceCriteria(ticket),
      retryContext: buildRetryContext(ticket || {})
    };

    logSchedulerEvent('agent.manual_start', 'info', `Manual start: codex on ${ticketId}`, { ticketId, agentName: 'codex', details: { modelId: enrichedPayload.modelId } });
    return agentRuntime.startCodex(enrichedPayload, { workingDirectory });
  } catch (error) {
    if (error instanceof AgentInvocationError) {
      throw new Error(`${error.code}: ${error.message}`);
    }
    throw error;
  }
});

ipcMain.handle('agent:startClaudeForTicket', async (_, payload) => {
  try {
    const ticketId = typeof payload?.ticketId === 'string' ? payload.ticketId : '';
    const data = readBacklogData();
    const ticket = Array.isArray(data.tickets)
      ? data.tickets.find((entry) => entry.id === ticketId)
      : null;

    // AD_HOC-032: Check dependencies before starting
    if (ticket) {
      const ticketStatusById = new Map(
        (data.tickets || []).map((t) => [t.id, t.status])
      );
      if (!hasResolvedDependencies(ticket, ticketStatusById)) {
        const unresolvedDeps = (ticket.dependencies || [])
          .map((dep) => normalizeDependencyId(dep))
          .filter((depId) => {
            if (!depId) return false;
            const status = ticketStatusById.get(depId);
            return status !== 'review' && status !== 'done';
          });
        throw new Error(
          `Cannot start ticket ${ticketId} because it has unmet dependencies: ${unresolvedDeps.join(', ')}. Dependencies must be in 'review' or 'done' status before starting work.`
        );
      }
    }

    // Create worktree for this ticket (per feature_GIT_WORKTREES.md)
    const preparedWorktree = createWorktreeSync(ticketId, { projectRoot: PROJECT_ROOT });
    const workingDirectory = String(preparedWorktree?.worktreePath || '').trim();

    if (!workingDirectory) {
      throw new Error(`Failed to create worktree for ${ticketId}`);
    }

    const enrichedPayload = {
      ticketId,
      title: payload?.title || ticket?.title || ticketId,
      epicRef: payload?.epicRef || ticket?.epic_ref || '.ombutocode/epics',
      repoRoot: PROJECT_ROOT,
      modelId: resolveModelId('claude', payload?.modelId),
      acceptanceCriteria: formatAcceptanceCriteria(ticket),
      retryContext: buildRetryContext(ticket || {})
    };

    logSchedulerEvent('agent.manual_start', 'info', `Manual start: claude on ${ticketId}`, { ticketId, agentName: 'claude', details: { modelId: enrichedPayload.modelId } });
    return agentRuntime.startClaude(enrichedPayload, { workingDirectory });
  } catch (error) {
    if (error instanceof AgentInvocationError) {
      throw new Error(`${error.code}: ${error.message}`);
    }
    throw error;
  }
});

ipcMain.handle('agent:getRunStatus', async (_, query) => {
  return agentRuntime.getRunStatus(query || {});
});

ipcMain.handle('agent:readRunLogs', async (_, query = {}) => {
  const ticketId = String(query?.ticketId || '').trim();
  const runId = String(query?.runId || '').trim();
  const maxChars = Number.isInteger(query?.maxChars) && query.maxChars > 0
    ? query.maxChars
    : DEFAULT_RUN_LOG_TAIL_CHARS;

  if (!ticketId) {
    throw new Error('ticketId is required');
  }

  const data = readBacklogData();
  const ticket = Array.isArray(data.tickets)
    ? data.tickets.find((entry) => entry.id === ticketId)
    : null;
  if (!ticket) {
    throw new Error(`Ticket ${ticketId} not found`);
  }

  let stdoutPath = null;
  let stderrPath = null;
  if (runId) {
    const activePaths = runOutputFilesByRunId.get(runId);
    if (activePaths) {
      stdoutPath = activePaths.stdoutPath;
      stderrPath = activePaths.stderrPath;
    }
  }

  if (!stdoutPath && !stderrPath) {
    const agent = ticket.agent && typeof ticket.agent === 'object' ? ticket.agent : {};
    stdoutPath = resolveProjectPath(agent.stdout_log_file || null);
    stderrPath = resolveProjectPath(agent.stderr_log_file || null);
  }

  const stdout = readFileTail(stdoutPath, maxChars);
  const stderr = readFileTail(stderrPath, maxChars);
  return {
    ticketId,
    runId: runId || null,
    stdout: stdout.text,
    stderr: stderr.text,
    stdoutTruncated: stdout.truncated,
    stderrTruncated: stderr.truncated
  };
});

// Check if a process is still running
ipcMain.handle('agent:checkProcessAlive', async (_, { pid }) => {
  if (!pid || typeof pid !== 'number') {
    return { alive: false };
  }

  try {
    // On Unix, sending signal 0 checks if process exists without killing it
    process.kill(pid, 0);
    return { alive: true };
  } catch (err) {
    // ESRCH means process not found
    return { alive: false };
  }
});

// Cancel a running agent process and reset ticket to todo
ipcMain.handle('agent:cancelRunningTicket', async (_, { ticketId }) => {
  if (!ticketId || typeof ticketId !== 'string') {
    throw new Error('ticketId is required');
  }

  const ticket = backlogDb.getTicketById(ticketId);
  if (!ticket) {
    throw new Error(`Ticket ${ticketId} not found`);
  }

  const pid = ticket?.agent?.pid;
  const runId = ticket?.agent?.run_id;

  // Kill the process if it's still running
  if (pid && typeof pid === 'number') {
    try {
      console.log(`[Agent] Killing process PID ${pid} for ticket ${ticketId}`);
      process.kill(pid, 'SIGTERM');
    } catch (err) {
      console.warn(`[Agent] Failed to kill PID ${pid}:`, err.message);
    }
  }

  // Update ticket: reset to todo, clear agent state, add cancellation note
  const timestamp = new Date().toISOString();
  const cancelNote = `[${timestamp}] User cancelled running agent (PID: ${pid || 'unknown'}, Run ID: ${runId || 'unknown'}).`;
  const notes = ticket.notes ? `${ticket.notes}\n${cancelNote}` : cancelNote;

  const agentUpdate = ticket.agent ? {
    ...ticket.agent,
    state: 'failed',
    finished_at: timestamp,
    error: 'Cancelled by user'
  } : null;

  backlogDb.updateTicketFields(ticketId, {
    status: 'todo',
    last_updated: timestamp,
    notes,
    agent: agentUpdate
  });
  ombutocodeDb.saveDb();

  console.log(`[Agent] Cancelled ticket ${ticketId}, reset to todo`);
  logSchedulerEvent('agent.cancelled', 'info', `Agent cancelled for ${ticketId}, reset to todo`, { ticketId, details: { pid, runId } });

  return { success: true };
});

function parseAutomationPayload(payload) {
  if (payload === undefined || payload === null) {
    return { ok: true, value: {} };
  }

  if (typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PAYLOAD',
        message: 'payload must be an object'
      },
      value: {}
    };
  }

  return { ok: true, value: payload };
}

function safeAutomationError(defaultData, validation) {
  return {
    ...defaultData,
    success: false,
    error: validation?.error || {
      code: 'AUTOMATION_STATE_ERROR',
      message: 'Unable to read automation state'
    }
  };
}

// Scheduler IPC handlers
ipcMain.handle('scheduler:start', async () => {
  scheduler.start();
  persistSchedulerRunningState(true);
  return scheduler.getStatus();
});

ipcMain.handle('scheduler:stop', async () => {
  scheduler.stop();
  persistSchedulerRunningState(false);
  return scheduler.getStatus();
});

ipcMain.handle('scheduler:status', async () => {
  return scheduler.getStatus();
});

ipcMain.handle('automation:active-runs', async (_, payload) => {
  const parsed = parseAutomationPayload(payload);
  const fallback = { runs: [], total: 0 };
  if (!parsed.ok) {
    return safeAutomationError(fallback, parsed);
  }

  const includeQueued = parsed.value.includeQueued;
  if (includeQueued !== undefined && typeof includeQueued !== 'boolean') {
    return safeAutomationError(fallback, {
      error: {
        code: 'INVALID_PAYLOAD',
        message: 'includeQueued must be a boolean when provided'
      }
    });
  }

  try {
    const runs = scheduler.getAutomationActiveRuns({ includeQueued });
    return {
      success: true,
      runs: Array.isArray(runs) ? runs : [],
      total: Array.isArray(runs) ? runs.length : 0
    };
  } catch (error) {
    return safeAutomationError(fallback);
  }
});

ipcMain.handle('automation:eval-queue', async (_, payload) => {
  const parsed = parseAutomationPayload(payload);
  const fallback = {
    totalTickets: 0,
    activeCount: 0,
    readyCount: 0,
    tickets: [],
    activeTicketIds: []
  };
  if (!parsed.ok) {
    return safeAutomationError(fallback, parsed);
  }

  const limit = parsed.value.limit;
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0 || limit > 200)) {
    return safeAutomationError(fallback, {
      error: {
        code: 'INVALID_PAYLOAD',
        message: 'limit must be an integer between 1 and 200 when provided'
      }
    });
  }

  try {
    const snapshot = scheduler.getAutomationEvalQueue({ limit });
    return {
      success: true,
      ...fallback,
      ...(snapshot && typeof snapshot === 'object' ? snapshot : {})
    };
  } catch (error) {
    return safeAutomationError(fallback);
  }
});

ipcMain.handle('automation:agent-status', async (_, payload) => {
  const parsed = parseAutomationPayload(payload);
  const fallback = { agents: [] };
  if (!parsed.ok) {
    return safeAutomationError(fallback, parsed);
  }

  const includeDisabled = parsed.value.includeDisabled;
  if (includeDisabled !== undefined && typeof includeDisabled !== 'boolean') {
    return safeAutomationError(fallback, {
      error: {
        code: 'INVALID_PAYLOAD',
        message: 'includeDisabled must be a boolean when provided'
      }
    });
  }

  try {
    const agents = scheduler.getAutomationAgentStatus({ includeDisabled });
    return {
      success: true,
      agents: Array.isArray(agents) ? agents : []
    };
  } catch (error) {
    return safeAutomationError(fallback);
  }
});

ipcMain.handle('automation:unpause-agent', async (_, payload) => {
  const parsed = parseAutomationPayload(payload);
  if (!parsed.ok) {
    return {
      success: false,
      error: parsed.error || {
        code: 'INVALID_PAYLOAD',
        message: 'Invalid payload'
      }
    };
  }

  const { toolId } = parsed.value;
  if (!toolId || typeof toolId !== 'string') {
    return {
      success: false,
      error: {
        code: 'INVALID_TOOL_ID',
        message: 'toolId is required and must be a string'
      }
    };
  }

  try {
    scheduler.windowTracker.resumeToolWindowPickup(toolId);
    console.log(`[Scheduler] Manually unpaused agent: ${toolId}`);
    return { success: true, toolId };
  } catch (error) {
    console.error(`[Scheduler] Failed to unpause agent ${toolId}:`, error?.message || error);
    return {
      success: false,
      toolId,
      error: {
        code: 'UNPAUSE_FAILED',
        message: error?.message || 'Failed to unpause agent'
      }
    };
  }
});

ipcMain.handle('scheduler:deleteQueueTicket', async (_, payload = {}) => {
  const ticketId = payload?.ticketId;
  if (!ticketId || typeof ticketId !== 'string') {
    return { success: false, error: { code: 'INVALID_TICKET_ID', message: 'Ticket ID is required' } };
  }

  const ticket = backlogDb.getTicketById(ticketId);
  if (!ticket) {
    return { success: false, error: { code: 'TICKET_NOT_FOUND', message: `Ticket ${ticketId} not found` } };
  }

  // Only allow deleting tickets that are in 'todo' status (scheduler queue)
  if (ticket.status !== 'todo') {
    return { success: false, error: { code: 'INVALID_STATUS', message: `Cannot delete ticket with status '${ticket.status}'. Only todo tickets can be deleted from queue.` } };
  }

  backlogDb.deleteTicket(ticketId);
  ombutocodeDb.saveDb();
  return { success: true, ticketId };
});

// Archive IPC handlers (unified DB — already open via ombutocodeDb)
ipcMain.handle('archive:read', async () => {
  try {
    return getArchiveData();
  } catch (e) {
    console.error('[Archive] archive:read error:', e.message);
    if (e.code === 'ENOENT' || e.message?.includes('not initialized')) {
      return { version: 1, updated_at: '', tickets: [] };
    }
    throw e;
  }
});

ipcMain.handle('archive:search', async (_, params = {}) => {
  try {
    const result = searchTickets(params);
    return { success: true, ...result };
  } catch (error) {
    console.error('[Archive] Search error:', error);
    throw error;
  }
});

ipcMain.handle('archive:getDistinctEpicRefs', async () => {
  try {
    const refs = getDistinctEpicRefs();
    return { success: true, refs };
  } catch (error) {
    console.error('[Archive] Get feature refs error:', error);
    return { success: false, error: error.message, refs: [] };
  }
});

ipcMain.handle('archive:moveTicket', async (_, { ticketId }) => {
  const ticket = backlogDb.getTicketById(ticketId);
  if (!ticket) throw new Error(`Ticket ${ticketId} not found in backlog`);

  const timestamp = new Date().toISOString();
  const archiveTicket = { ...ticket, status: 'archive', last_updated: timestamp };

  // Insert into archive, then delete from backlog
  const archiveDb = require('./src/main/archiveDb');
  archiveDb.insertTicket(archiveTicket);
  backlogDb.deleteTicket(ticketId);
  ombutocodeDb.saveDb();
  return { success: true, ticketId };
});

// --- Logs IPC handlers ---
ipcMain.handle('logs:read', async (_, params = {}) => {
  try {
    const result = logsDb.readLogs(params);
    return { success: true, ...result };
  } catch (error) {
    console.error('[Logs] Read error:', error);
    return { success: false, error: error.message, logs: [], total: 0 };
  }
});

ipcMain.handle('logs:search', async (_, params = {}) => {
  try {
    const result = logsDb.searchLogs(params);
    return { success: true, ...result };
  } catch (error) {
    console.error('[Logs] Search error:', error);
    return { success: false, error: error.message, logs: [], total: 0 };
  }
});

ipcMain.handle('logs:getDistinctEventTypes', async () => {
  try {
    const types = logsDb.getDistinctEventTypes();
    return { success: true, types };
  } catch (error) {
    console.error('[Logs] Get event types error:', error);
    return { success: false, error: error.message, types: [] };
  }
});

ipcMain.handle('logs:getDistinctTicketIds', async () => {
  try {
    const ids = logsDb.getDistinctTicketIds();
    return { success: true, ids };
  } catch (error) {
    console.error('[Logs] Get ticket IDs error:', error);
    return { success: false, error: error.message, ids: [] };
  }
});

ipcMain.handle('backlog:deleteTicket', async (_, { ticketId }) => {
  if (!ticketId || typeof ticketId !== 'string') {
    throw new Error('Ticket ID is required');
  }
  const deleted = backlogDb.deleteTicket(ticketId);
  if (!deleted) throw new Error(`Ticket ${ticketId} not found`);
  ombutocodeDb.saveDb();
  return { success: true, ticketId };
});

ipcMain.handle('epics:read', async () => {
  let entries = [];
  try {
    entries = fs.readdirSync(EPICS_DIR, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return { epics: [] };
    throw e;
  }

  const epicFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const epics = epicFiles.map((fileName) => {
    const fullPath = path.join(EPICS_DIR, fileName);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split(/\r?\n/);

    const titleLine = lines.find((line) => line.startsWith('# ')) || '';
    const statusLine = lines.find((line) => line.startsWith('Status:')) || '';
    const ownerLine = lines.find((line) => line.startsWith('Owner:')) || '';
    const createdLine = lines.find((line) => line.startsWith('Created:')) || '';
    const updatedLine = lines.find((line) => line.startsWith('Last Updated:')) || '';

    return {
      id: fileName.replace(/\.md$/i, ''),
      fileName,
      title: titleLine.replace(/^#\s*/, '').trim() || fileName,
      status: statusLine.replace(/^Status:\s*/, '').trim() || '',
      owner: ownerLine.replace(/^Owner:\s*/, '').trim() || '',
      created: createdLine.replace(/^Created:\s*/, '').trim() || '',
      lastUpdated: updatedLine.replace(/^Last Updated:\s*/, '').trim() || '',
      content
    };
  });

  return { epics };
});

ipcMain.handle('epics:updateStatus', async (_, { fileName, status }) => {
  if (!fileName || !status) {
    throw new Error('fileName and status are required');
  }

  const safeName = path.basename(String(fileName));
  if (!safeName.toLowerCase().endsWith('.md')) {
    throw new Error('Invalid feature file');
  }

  const fullPath = path.join(EPICS_DIR, safeName);
  const content = fs.readFileSync(fullPath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const today = new Date().toISOString().split('T')[0];

  let statusUpdated = false;
  let lastUpdatedSet = false;

  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startsWith('Status:')) {
      lines[i] = `Status: ${status}`;
      statusUpdated = true;
    }
    if (lines[i].startsWith('Last Updated:')) {
      lines[i] = `Last Updated: ${today}`;
      lastUpdatedSet = true;
    }
  }

  if (!statusUpdated) {
    const titleIndex = lines.findIndex((line) => line.startsWith('# '));
    const insertAt = titleIndex >= 0 ? titleIndex + 1 : 0;
    lines.splice(insertAt, 0, `Status: ${status}`);
  }

  if (!lastUpdatedSet) {
    const createdIndex = lines.findIndex((line) => line.startsWith('Created:'));
    const insertAt = createdIndex >= 0 ? createdIndex + 1 : 1;
    lines.splice(insertAt, 0, `Last Updated: ${today}`);
  }

  fs.writeFileSync(fullPath, lines.join('\n'), 'utf-8');
  return { success: true };
});

// ── Feature Start / Evaluation ───────────────────────────────────────────

ipcMain.handle('epics:start', async (_, { fileName }) => {
  if (!fileName) throw new Error('fileName is required');

  const safeName = path.basename(String(fileName));
  const epicRef = `.ombutocode/epics/${safeName}`;

  const tickets = backlogDb.getTicketsByEpicRef(epicRef);
  if (tickets.length === 0) {
    throw new Error('No tickets linked to this feature');
  }

  const promoted = [];
  for (const ticket of tickets) {
    if (ticket.status === 'backlog') {
      backlogDb.updateTicketFields(ticket.id, { status: 'todo' });
      promoted.push(ticket.id);
    }
  }
  if (promoted.length > 0) {
    ombutocodeDb.saveDb();
  }

  // Update feature status to in_progress if it isn't already
  const featurePath = path.join(EPICS_DIR, safeName);
  try {
    const content = fs.readFileSync(featurePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    const statusLine = lines.find(l => l.startsWith('Status:'));
    const currentStatus = statusLine ? statusLine.replace(/^Status:\s*/, '').trim() : '';
    if (!currentStatus || currentStatus === 'draft' || currentStatus === 'planned') {
      const today = new Date().toISOString().split('T')[0];
      let statusSet = false;
      let updatedSet = false;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('Status:')) { lines[i] = 'Status: in_progress'; statusSet = true; }
        if (lines[i].startsWith('Last Updated:')) { lines[i] = `Last Updated: ${today}`; updatedSet = true; }
      }
      if (!statusSet) {
        const titleIdx = lines.findIndex(l => l.startsWith('# '));
        lines.splice(titleIdx >= 0 ? titleIdx + 1 : 0, 0, 'Status: in_progress');
      }
      if (!updatedSet) {
        const createdIdx = lines.findIndex(l => l.startsWith('Created:'));
        lines.splice(createdIdx >= 0 ? createdIdx + 1 : 1, 0, `Last Updated: ${today}`);
      }
      fs.writeFileSync(featurePath, lines.join('\n'), 'utf-8');
    }
  } catch (e) {
    console.warn(`[FeatureStart] Could not update feature status: ${e.message}`);
  }

  return { promoted, total: tickets.length };
});

ipcMain.handle('epics:checkReadiness', async (_, { fileName }) => {
  if (!fileName) throw new Error('fileName is required');

  const safeName = path.basename(String(fileName));
  const epicRef = `.ombutocode/epics/${safeName}`;

  // Query backlog + archive for linked tickets
  const backlogTickets = backlogDb.getTicketsByEpicRef(epicRef);
  let archiveTickets = [];
  try {
    const archiveResult = searchTickets({ epicRef, limit: 500 });
    archiveTickets = archiveResult?.tickets || [];
  } catch { /* archive may not exist */ }

  const allTickets = [...backlogTickets, ...archiveTickets];
  if (allTickets.length === 0) {
    throw new Error('No tickets linked to this feature');
  }

  const READY_STATUSES = new Set(['review', 'done', 'archived']);
  const unready = allTickets.filter(t => !READY_STATUSES.has(t.status));

  if (unready.length > 0) {
    const unreadyList = unready.map(t => `${t.id} (${t.status})`).join(', ');
    throw new Error(`Tickets not ready: ${unreadyList}`);
  }

  return {
    ready: true,
    tickets: allTickets.map(t => ({ id: t.id, title: t.title, status: t.status }))
  };
});

ipcMain.handle('epics:evaluate', async (_, { fileName }) => {
  if (!fileName) throw new Error('fileName is required');

  // Validate eval agent is configured
  const evalAgent = settingsStore.get('eval_default_agent', null);
  if (!evalAgent) {
    throw new Error('No eval agent configured. Set eval_default_agent in Settings.');
  }

  const safeName = path.basename(String(fileName));
  const epicRef = `.ombutocode/epics/${safeName}`;
  const fullPath = path.join(EPICS_DIR, safeName);

  // Read feature spec
  let featureContent;
  try {
    featureContent = fs.readFileSync(fullPath, 'utf-8');
  } catch (e) {
    throw new Error(`Cannot read feature file: ${e.message}`);
  }

  // Parse feature title
  const titleLine = featureContent.split(/\r?\n/).find(l => l.startsWith('# ')) || '';
  const featureTitle = titleLine.replace(/^#\s*/, '').trim() || safeName;

  // Check readiness — get all linked tickets
  const backlogTickets = backlogDb.getTicketsByEpicRef(epicRef);
  let archiveTickets = [];
  try {
    const archiveResult = searchTickets({ epicRef, limit: 500 });
    archiveTickets = archiveResult?.tickets || [];
  } catch { /* archive may not exist */ }

  const allTickets = [...backlogTickets, ...archiveTickets];
  if (allTickets.length === 0) {
    throw new Error('No tickets linked to this feature');
  }

  const READY_STATUSES = new Set(['review', 'done', 'archived']);
  const unready = allTickets.filter(t => !READY_STATUSES.has(t.status));
  if (unready.length > 0) {
    const unreadyList = unready.map(t => `${t.id} (${t.status})`).join(', ');
    throw new Error(`Tickets not ready: ${unreadyList}`);
  }

  // Build combined acceptance criteria from all tickets
  // Preserve [x]/[ ] prefixes so the agent can verify completion status
  const allCriteria = allTickets.map(t => {
    const criteria = Array.isArray(t.acceptance_criteria)
      ? t.acceptance_criteria.map((c, i) => `  ${i + 1}. ${c}`).join('\n')
      : '  (no criteria)';
    return `Ticket ${t.id}: ${t.title || 'Untitled'}\n${criteria}`;
  }).join('\n\n');

  // Resolve model
  const evalModel = settingsStore.get('eval_default_model', null);
  const modelId = resolveModelId(evalAgent, evalModel);

  // Build payload with synthetic ticketId
  const syntheticTicketId = `FEAT_EVAL_${Date.now()}`;
  const payload = {
    ticketId: syntheticTicketId,
    epicRef,
    title: featureTitle,
    repoRoot: PROJECT_ROOT,
    acceptanceCriteria: allCriteria,
    modelId
  };

  // Start the agent with feature_eval template variant
  const run = agentRuntime.startAgent(evalAgent, payload, { templateVariant: 'feature_eval' });

  // Track this run for onRunFinished hook
  activeFeatureEvals.set(run.runId, {
    fileName: safeName,
    epicRef,
    tickets: allTickets.map(t => ({ id: t.id, title: t.title }))
  });

  return { runId: run.runId };
});

ipcMain.handle('epics:evalStatus', async (_, { runId }) => {
  if (!runId) throw new Error('runId is required');
  return agentRuntime.getRunStatus({ runId });
});

function updatePrdWithFeatureEvalResult(featureTitle, tickets, verdict, evalSummary) {
  const PRD_PATH = path.join(PROJECT_ROOT, 'docs', 'prd.md');
  let prdContent;
  try {
    prdContent = fs.readFileSync(PRD_PATH, 'utf-8');
  } catch (e) {
    console.warn(`[FeatureEval] Cannot read PRD file: ${e.message}`);
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const subsectionHeader = `### ${featureTitle}`;

  // Build ticket table
  const ticketRows = tickets.map(t => `| ${t.id} | ${t.title || ''} | PASS |`).join('\n');
  const ticketTable = `| Ticket | Title | Verdict |\n|--------|-------|---------|\n${ticketRows}`;

  const subsectionContent = `${subsectionHeader}\n\n**Evaluated:** ${today}\n**Verdict:** ${verdict}\n\n${ticketTable}\n\n${evalSummary || ''}\n`;

  // Find section 15
  const lines = prdContent.split(/\r?\n/);
  let section15Start = -1;
  let nextSectionStart = -1;

  for (let i = 0; i < lines.length; i++) {
    if (/^## 15[\.\s]/.test(lines[i]) || /^## 15$/.test(lines[i])) {
      section15Start = i;
    } else if (section15Start >= 0 && nextSectionStart < 0 && /^## \d/.test(lines[i])) {
      nextSectionStart = i;
    }
  }

  if (section15Start < 0) {
    // No section 15 — append at end
    prdContent = prdContent.trimEnd() + '\n\n## 15. Feature Evaluation Results\n\n' + subsectionContent;
  } else {
    // Check for existing subsection for this feature
    const insertAt = nextSectionStart > 0 ? nextSectionStart : lines.length;
    let existingSubStart = -1;
    let existingSubEnd = -1;

    for (let i = section15Start + 1; i < insertAt; i++) {
      if (lines[i].trim() === subsectionHeader.trim()) {
        existingSubStart = i;
      } else if (existingSubStart >= 0 && existingSubEnd < 0 && /^### /.test(lines[i])) {
        existingSubEnd = i;
      }
    }

    if (existingSubStart >= 0) {
      // Replace existing subsection
      const end = existingSubEnd > 0 ? existingSubEnd : insertAt;
      lines.splice(existingSubStart, end - existingSubStart, subsectionContent);
    } else {
      // Append before next section
      lines.splice(insertAt, 0, subsectionContent);
    }
    prdContent = lines.join('\n');
  }

  // Update Last Updated line
  const updatedLines = prdContent.split(/\r?\n/);
  for (let i = 0; i < updatedLines.length; i++) {
    if (updatedLines[i].startsWith('Last Updated:')) {
      updatedLines[i] = `Last Updated: ${today}`;
      break;
    }
  }

  try {
    fs.writeFileSync(PRD_PATH, updatedLines.join('\n'), 'utf-8');
    console.log(`[FeatureEval] Updated PRD section 15 for ${featureTitle}`);
  } catch (e) {
    console.warn(`[FeatureEval] Failed to write PRD: ${e.message}`);
  }
}

// ── Agents YAML persistence ──────────────────────────────────────────────

ipcMain.handle('agents:read', async () => {
  try {
    const content = fs.readFileSync(AGENTS_PATH, 'utf-8');
    return yaml.load(content);
  } catch (e) {
    if (e.code === 'ENOENT') {
      return { version: 1, tools: [] };
    }
    throw e;
  }
});

ipcMain.handle('agents:write', async (_, data) => {
  if (!data || !Array.isArray(data.tools)) {
    throw new Error('Invalid agents data: must have a tools array');
  }

  const agentsDir = path.dirname(AGENTS_PATH);
  if (!fs.existsSync(agentsDir)) {
    fs.mkdirSync(agentsDir, { recursive: true });
  }

  const output = { version: data.version || 1, tools: data.tools };
  fs.writeFileSync(AGENTS_PATH, yaml.dump(output, { lineWidth: -1, noRefs: true }), 'utf-8');
  return { success: true };
});

ipcMain.handle('agents:state', async () => {
  const persistedState = scheduler.windowTracker.loadState();
  const schedulerStatus = scheduler.getStatus();

  return {
    ...persistedState,
    scheduler_running: scheduler.isRunning(),
    scheduler: schedulerStatus
  };
});

// Settings IPC handlers
ipcMain.handle('settings:read', async () => {
  try {
    const settings = {
      project_name: settingsStore.get('project_name', ''),
      eval_default_agent: settingsStore.get('eval_default_agent', null),
      eval_default_model: settingsStore.get('eval_default_model', null),
      ad_hoc_ticket_agent: settingsStore.get('ad_hoc_ticket_agent', null),
      ad_hoc_ticket_model: settingsStore.get('ad_hoc_ticket_model', null),
      app_refresh_interval: settingsStore.get('app_refresh_interval', 30),
      enable_review_notification_sound: settingsStore.get('enable_review_notification_sound', true),
      max_eval_retries: settingsStore.get('max_eval_retries', 2),
      theme: settingsStore.get('theme', 'light')
    };
    return { success: true, data: settings };
  } catch (error) {
    console.error('[Settings] Error reading settings:', error?.message || error);
    return {
      success: false,
      error: {
        code: 'SETTINGS_READ_ERROR',
        message: error?.message || 'Failed to read settings'
      }
    };
  }
});

ipcMain.handle('settings:write', async (_, payload) => {
  try {
    if (!payload || typeof payload !== 'object') {
      return {
        success: false,
        error: {
          code: 'INVALID_PAYLOAD',
          message: 'Settings payload must be an object'
        }
      };
    }

    const updates = {};
    const errors = [];

    // Validate project_name
    if ('project_name' in payload) {
      const value = payload.project_name;
      if (typeof value !== 'string') {
        errors.push('project_name must be a string');
      } else {
        updates.project_name = value.trim();
      }
    }

    // Validate eval_default_agent
    if ('eval_default_agent' in payload) {
      const value = payload.eval_default_agent;
      if (value !== null && typeof value !== 'string') {
        errors.push('eval_default_agent must be a string or null');
      } else if (value !== null && value.trim() === '') {
        errors.push('eval_default_agent cannot be an empty string');
      } else {
        updates.eval_default_agent = value;
      }
    }

    // Validate eval_default_model
    if ('eval_default_model' in payload) {
      const value = payload.eval_default_model;
      if (value !== null && typeof value !== 'string') {
        errors.push('eval_default_model must be a string or null');
      } else if (value !== null && value.trim() === '') {
        errors.push('eval_default_model cannot be an empty string');
      } else {
        updates.eval_default_model = value;
      }
    }

    // Validate ad_hoc_ticket_agent
    if ('ad_hoc_ticket_agent' in payload) {
      const value = payload.ad_hoc_ticket_agent;
      if (value !== null && typeof value !== 'string') {
        errors.push('ad_hoc_ticket_agent must be a string or null');
      } else if (value !== null && value.trim() === '') {
        errors.push('ad_hoc_ticket_agent cannot be an empty string');
      } else {
        updates.ad_hoc_ticket_agent = value;
      }
    }

    // Validate ad_hoc_ticket_model
    if ('ad_hoc_ticket_model' in payload) {
      const value = payload.ad_hoc_ticket_model;
      if (value !== null && typeof value !== 'string') {
        errors.push('ad_hoc_ticket_model must be a string or null');
      } else if (value !== null && value.trim() === '') {
        errors.push('ad_hoc_ticket_model cannot be an empty string');
      } else {
        updates.ad_hoc_ticket_model = value;
      }
    }

    // Validate app_refresh_interval
    if ('app_refresh_interval' in payload) {
      const value = payload.app_refresh_interval;
      if (!Number.isFinite(value) || value < 1) {
        errors.push('app_refresh_interval must be a positive integer greater than 0');
      } else {
        updates.app_refresh_interval = Math.floor(value);
      }
    }

    // Validate enable_review_notification_sound
    if ('enable_review_notification_sound' in payload) {
      const value = payload.enable_review_notification_sound;
      if (typeof value !== 'boolean') {
        errors.push('enable_review_notification_sound must be a boolean');
      } else {
        updates.enable_review_notification_sound = value;
      }
    }

    // Validate max_eval_retries
    if ('max_eval_retries' in payload) {
      const value = payload.max_eval_retries;
      if (!Number.isFinite(value) || value < 0) {
        errors.push('max_eval_retries must be a non-negative integer');
      } else {
        updates.max_eval_retries = Math.floor(value);
      }
    }

    // Validate theme
    if ('theme' in payload) {
      const value = payload.theme;
      if (value !== 'light' && value !== 'dark') {
        errors.push('theme must be "light" or "dark"');
      } else {
        updates.theme = value;
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: errors.join('; ')
        }
      };
    }

    // Apply updates
    for (const [key, value] of Object.entries(updates)) {
      settingsStore.set(key, value);
    }

    // Update scheduler poll interval if refresh interval changed
    if ('app_refresh_interval' in updates && scheduler && typeof scheduler.setPollInterval === 'function') {
      scheduler.setPollInterval(updates.app_refresh_interval);
      console.log(`[Settings] Updated scheduler poll interval to ${updates.app_refresh_interval} seconds`);
    }

    // Return updated settings
    const updatedSettings = {
      project_name: settingsStore.get('project_name'),
      eval_default_agent: settingsStore.get('eval_default_agent'),
      eval_default_model: settingsStore.get('eval_default_model'),
      ad_hoc_ticket_agent: settingsStore.get('ad_hoc_ticket_agent'),
      ad_hoc_ticket_model: settingsStore.get('ad_hoc_ticket_model'),
      app_refresh_interval: settingsStore.get('app_refresh_interval'),
      enable_review_notification_sound: settingsStore.get('enable_review_notification_sound'),
      max_eval_retries: settingsStore.get('max_eval_retries'),
      theme: settingsStore.get('theme', 'light')
    };

    return { success: true, data: updatedSettings };
  } catch (error) {
    console.error('[Settings] Error writing settings:', error?.message || error);
    return {
      success: false,
      error: {
        code: 'SETTINGS_WRITE_ERROR',
        message: error?.message || 'Failed to write settings'
      }
    };
  }
});

// Archive DB backup/restore IPC handlers (ARCH_SQL-009, CDB-007)
ipcMain.handle('archive:backupDb', async () => {
  try {
    if (!fs.existsSync(OMBUTOCODE_DB_PATH)) {
      return { success: true, exists: false, data: null };
    }
    const data = fs.readFileSync(OMBUTOCODE_DB_PATH);
    return {
      success: true,
      exists: true,
      data: Buffer.from(data).toString('base64'),
      size: data.length
    };
  } catch (error) {
    console.error('[Archive] Backup DB error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('archive:restoreDb', async (_, { data }) => {
  try {
    if (!data || typeof data !== 'string') {
      return { success: false, error: 'Invalid data provided' };
    }

    // Ensure directory exists
    const dir = path.dirname(OMBUTOCODE_DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write the binary data
    const buffer = Buffer.from(data, 'base64');
    fs.writeFileSync(OMBUTOCODE_DB_PATH, buffer);

    // Re-open the unified database to refresh the connection
    await ombutocodeDb.open(OMBUTOCODE_DB_PATH);

    return { success: true, size: buffer.length };
  } catch (error) {
    console.error('[Archive] Restore DB error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('archive:dbExists', async () => {
  try {
    const exists = fs.existsSync(OMBUTOCODE_DB_PATH);
    const stats = exists ? fs.statSync(OMBUTOCODE_DB_PATH) : null;
    return {
      success: true,
      exists,
      size: stats ? stats.size : 0
    };
  } catch (error) {
    console.error('[Archive] DB exists check error:', error);
    return { success: false, error: error.message };
  }
});

// Database Export/Import IPC handlers
ipcMain.handle('db:export', async () => {
  try {
    const { dialog } = require('electron');
    ombutocodeDb.saveDb(); // flush pending writes
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `ombutocode-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    });
    if (canceled || !filePath) return { success: false, canceled: true };
    fs.copyFileSync(OMBUTOCODE_DB_PATH, filePath);
    return { success: true, filePath };
  } catch (error) {
    console.error('[Database] Export error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:import', async () => {
  try {
    const { dialog } = require('electron');
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths.length) return { success: false, canceled: true };
    // Validate it's a real SQLite file before overwriting
    const buf = fs.readFileSync(filePaths[0]);
    if (buf.length < 16 || buf.toString('ascii', 0, 15) !== 'SQLite format 3') {
      return { success: false, error: 'Not a valid SQLite database file' };
    }
    fs.writeFileSync(OMBUTOCODE_DB_PATH, buf);
    await ombutocodeDb.open(OMBUTOCODE_DB_PATH);
    return { success: true, filePath: filePaths[0] };
  } catch (error) {
    console.error('[Database] Import error:', error);
    return { success: false, error: error.message };
  }
});

// Requests IPC handlers (unified DB — already open via ombutocodeDb)
ipcMain.handle('requests:read', async (_, params = {}) => {
  try {
    const result = requestsDb.getAllRequests(params);
    return { success: true, data: result };
  } catch (error) {
    console.error('[Requests] Read error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('requests:create', async (_, payload = {}) => {
  try {
    const request = requestsDb.createRequest(payload);
    ombutocodeDb.saveDb();
    return { success: true, data: request };
  } catch (error) {
    console.error('[Requests] Create error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('requests:update', async (_, { id, updates } = {}) => {
  try {
    const request = requestsDb.updateRequest(id, updates);
    if (!request) {
      return { success: false, error: `Request ${id} not found` };
    }
    ombutocodeDb.saveDb();
    return { success: true, data: request };
  } catch (error) {
    console.error('[Requests] Update error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('requests:delete', async (_, { id } = {}) => {
  try {
    const deleted = requestsDb.deleteRequest(id);
    if (!deleted) {
      return { success: false, error: `Request ${id} not found` };
    }
    ombutocodeDb.saveDb();
    return { success: true };
  } catch (error) {
    console.error('[Requests] Delete error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('requests:linkToFeature', async (_, { id, featurePath } = {}) => {
  try {
    const request = requestsDb.linkToFeature(id, featurePath);
    if (!request) {
      return { success: false, error: `Request ${id} not found` };
    }
    ombutocodeDb.saveDb();
    return { success: true, data: request };
  } catch (error) {
    console.error('[Requests] LinkToFeature error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('requests:markDone', async (_, { id } = {}) => {
  try {
    const request = requestsDb.markRequestDone(id);
    if (!request) {
      return { success: false, error: `Request ${id} not found` };
    }
    ombutocodeDb.saveDb();
    return { success: true, data: request };
  } catch (error) {
    console.error('[Requests] MarkDone error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('prd:read', async () => {
  const filePath = path.join(PROJECT_ROOT, 'docs', 'prd.md');
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { content };
  } catch (e) {
    if (e.code === 'ENOENT') return { content: '# PRD not found\n\nNo file at docs/prd.md' };
    throw e;
  }
});

ipcMain.handle('requests:search', async (_, params = {}) => {
  try {
    const result = requestsDb.searchRequests(params);
    return { success: true, data: result };
  } catch (error) {
    console.error('[Requests] Search error:', error);
    return { success: false, error: error.message };
  }
});

// ── Workspace: Terminal shells ──

const activeShells = new Map();

ipcMain.handle('workspace:spawnShell', async (event, shellId) => {
  const pty = require('node-pty');
  const isWin = process.platform === 'win32';
  const shell = isWin ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');

  const proc = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: PROJECT_ROOT,
    env: process.env,
  });

  activeShells.set(shellId, proc);

  const win = BrowserWindow.fromWebContents(event.sender);

  proc.onData((data) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('workspace:shellData', { shellId, data });
    }
  });

  proc.onExit(({ exitCode }) => {
    activeShells.delete(shellId);
    if (win && !win.isDestroyed()) {
      win.webContents.send('workspace:shellExit', { shellId, code: exitCode });
    }
  });

  return { success: true };
});

ipcMain.handle('workspace:writeShell', async (_, shellId, data) => {
  const proc = activeShells.get(shellId);
  if (proc) {
    proc.write(data);
    return true;
  }
  return false;
});

ipcMain.handle('workspace:resizeShell', async (_, shellId, cols, rows) => {
  const proc = activeShells.get(shellId);
  if (proc) {
    proc.resize(cols, rows);
  }
  return true;
});

ipcMain.handle('workspace:killShell', async (_, shellId) => {
  const proc = activeShells.get(shellId);
  if (proc) {
    proc.kill();
    activeShells.delete(shellId);
  }
  return true;
});

// ── Agent connectivity test ──

ipcMain.handle('agent:testConnectivity', async (_, command, versionArg) => {
  const { exec } = require('child_process');
  const escaped = command.replace(/"/g, '\\"');
  const cmd = `"${escaped}" ${versionArg || '--version'}`;
  return new Promise((resolve) => {
    exec(cmd, { timeout: 10000 }, (err, stdout, stderr) => {
      if (err) {
        resolve({ success: false, error: err.code === 'ENOENT' ? `"${command}" not found on PATH` : (stderr || err.message) });
      } else {
        resolve({ success: true, output: stdout || stderr || 'OK' });
      }
    });
  });
});

// ── Agent interactive terminal ──

ipcMain.handle('agent:spawnInteractive', async (event, shellId, command, args) => {
  const pty = require('node-pty');
  const isWin = process.platform === 'win32';

  // On Windows, node-pty needs the full path or .cmd extension
  let resolvedCmd = command;
  if (isWin) {
    const { execSync } = require('child_process');
    try {
      resolvedCmd = execSync(`where ${command}`, { encoding: 'utf8' }).split('\n')[0].trim();
    } catch (_) {
      resolvedCmd = command + '.cmd'; // fallback
    }
  }

  const proc = pty.spawn(resolvedCmd, args || [], {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: PROJECT_ROOT,
    env: process.env,
  });

  activeShells.set(shellId, proc);
  const win = BrowserWindow.fromWebContents(event.sender);

  proc.onData((data) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('workspace:shellData', { shellId, data });
    }
  });

  proc.onExit(({ exitCode }) => {
    activeShells.delete(shellId);
    if (win && !win.isDestroyed()) {
      win.webContents.send('workspace:shellExit', { shellId, code: exitCode });
    }
  });

  return { success: true };
});

// ── Plan: File tree operations ──

ipcMain.handle('filetree:scan', async () => {
  try { return fileTreeService.scan(); }
  catch (e) { console.error('[FileTree] scan error:', e); return { name: 'docs', path: '', type: 'folder', children: [] }; }
});

ipcMain.handle('filetree:createFolder', async (_, relativePath) => {
  return fileTreeService.createFolder(relativePath);
});

ipcMain.handle('filetree:deleteFolder', async (_, relativePath) => {
  return fileTreeService.deleteFolder(relativePath);
});

ipcMain.handle('filetree:renameFile', async (_, oldPath, newPath) => {
  return fileTreeService.renameFile(oldPath, newPath);
});

ipcMain.handle('filetree:readFile', async (_, relativePath) => {
  return fileTreeService.readFile(relativePath);
});

ipcMain.handle('filetree:writeFile', async (_, relativePath, content) => {
  return fileTreeService.writeFile(relativePath, content);
});

ipcMain.handle('filetree:deleteFile', async (_, relativePath) => {
  return fileTreeService.deleteFile(relativePath);
});

ipcMain.handle('filetree:scanMockups', async () => {
  return fileTreeService.scanMockups();
});

ipcMain.handle('filetree:readImage', async (_, relativePath) => {
  return fileTreeService.readImageAsDataUrl(relativePath);
});

ipcMain.handle('filetree:scanUseCaseDiagrams', async () => {
  return fileTreeService.scanUseCaseDiagrams();
});

ipcMain.handle('filetree:scanUseCases', async () => {
  return fileTreeService.scanUseCases();
});

ipcMain.handle('filetree:scanAllFiles', async () => {
  return fileTreeService.scanAllFiles();
});

ipcMain.handle('filetree:scanClassDiagrams', async () => {
  return fileTreeService.scanClassDiagrams();
});

// ── Plan: Artifact operations ──

const artifactService = require('./src/main/artifactService');
const treeService = require('./src/main/treeService');
const versionService = require('./src/main/versionService');

ipcMain.handle('artifact:list', async (_, filters) => {
  return artifactService.list(filters || {});
});

ipcMain.handle('artifact:get', async (_, id) => {
  return artifactService.get(id);
});

ipcMain.handle('artifact:create', async (_, args) => {
  const { type, parentId, title, body, tags, priority } = args;
  return artifactService.create(type, parentId, { title, body, tags, priority });
});

ipcMain.handle('artifact:update', async (_, args) => {
  const { id, title, status, parentId, body, tags, priority } = args;
  return artifactService.update(id, { title, status, parentId, body, tags, priority });
});

ipcMain.handle('artifact:archive', async (_, id) => {
  return artifactService.archive(id);
});

ipcMain.handle('artifact:nextId', async (_, type) => {
  return artifactService.nextId(type);
});

ipcMain.handle('artifact:rebuildIndex', async () => {
  return artifactService.rebuildIndex();
});

// ── Plan: Tree operations ──

ipcMain.handle('tree:build', async () => {
  return treeService.buildTree();
});

ipcMain.handle('tree:ancestors', async (_, id) => {
  return treeService.ancestors(id);
});

ipcMain.handle('tree:descendants', async (_, id) => {
  return treeService.descendants(id);
});

ipcMain.handle('tree:children', async (_, id) => {
  return treeService.children(id);
});

ipcMain.handle('tree:breadcrumb', async (_, id) => {
  return treeService.breadcrumb(id);
});

ipcMain.handle('tree:coverage', async () => {
  return treeService.coverageReport();
});

ipcMain.handle('tree:componentSummary', async (_, compId) => {
  return treeService.componentSummary(compId);
});

// ── Plan: Version history ──

ipcMain.handle('version:log', async (_, relativePath, count) => {
  return versionService.getFileLog(relativePath, count);
});

ipcMain.handle('version:fileAtCommit', async (_, hash, relativePath) => {
  return versionService.getFileAtCommit(hash, relativePath);
});

// ── Plan: Excel export/import ──

ipcMain.handle('excel:exportRequirements', async (event, payload) => {
  try {
    const { rows, title } = payload || {};
    const XLSX = require('xlsx-js-style');
    const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow();
    const dialogOpts = {
      title: 'Export ' + (title || 'Requirements'),
      defaultPath: (title || 'Requirements').replace(/\s+/g, '_') + '.xlsx',
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    };
    const result = win
      ? await dialog.showSaveDialog(win, dialogOpts)
      : await dialog.showSaveDialog(dialogOpts);
    if (result.canceled || !result.filePath) return { success: false };
    const sheetName = (title || 'Requirements').substring(0, 31);
    const headerStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
      fill: { fgColor: { rgb: '4472C4' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { top: { style: 'thin', color: { rgb: '2F5496' } }, bottom: { style: 'thin', color: { rgb: '2F5496' } }, left: { style: 'thin', color: { rgb: '2F5496' } }, right: { style: 'thin', color: { rgb: '2F5496' } } },
    };
    const borderThin = { top: { style: 'thin', color: { rgb: 'D6DCE4' } }, bottom: { style: 'thin', color: { rgb: 'D6DCE4' } }, left: { style: 'thin', color: { rgb: 'D6DCE4' } }, right: { style: 'thin', color: { rgb: 'D6DCE4' } } };
    const headers = ['ID', 'Sub-System', 'Description', 'Status'];
    const wsData = [headers];
    for (const r of (rows || [])) {
      wsData.push([r.id || '', r.subsystem || '', r.description || '', r.status || '']);
    }
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    for (let c = 0; c < headers.length; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
      if (cell) cell.s = headerStyle;
    }
    for (let r = 1; r <= (rows || []).length; r++) {
      const isEven = r % 2 === 0;
      for (let c = 0; c < headers.length; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell) cell.s = { ...(isEven ? { fill: { fgColor: { rgb: 'D9E2F3' } } } : { fill: { fgColor: { rgb: 'FFFFFF' } } }), border: borderThin, alignment: c === 2 ? { wrapText: true, vertical: 'top' } : { vertical: 'top' }, font: { sz: 10 } };
      }
    }
    ws['!cols'] = [{ wch: 10 }, { wch: 22 }, { wch: 65 }, { wch: 15 }];
    ws['!rows'] = [{ hpt: 20 }];
    for (let r = 1; r <= (rows || []).length; r++) {
      const desc = (rows[r - 1] && rows[r - 1].description) || '';
      ws['!rows'].push({ hpt: Math.max(18, Math.ceil(desc.length / 60) * 15) });
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, result.filePath);
    return { success: true, path: result.filePath };
  } catch (err) {
    console.error('[Excel Export] Error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('excel:importRequirements', async (event) => {
  try {
    const XLSX = require('xlsx-js-style');
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      title: 'Import Requirements',
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xls', 'csv'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return { success: false };
    const wb = XLSX.readFile(result.filePaths[0]);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const rows = [];
    let headerFound = false;
    for (const row of data) {
      if (!headerFound) { if (row[0] && String(row[0]).toUpperCase() === 'ID') { headerFound = true; } continue; }
      if (row[0]) { rows.push({ id: String(row[0] || '').trim(), subsystem: String(row[1] || '').trim(), description: String(row[2] || '').trim(), status: String(row[3] || 'Draft').trim() }); }
    }
    return { success: true, rows };
  } catch (err) {
    console.error('[Excel Import] Error:', err);
    return { success: false, error: err.message };
  }
});

// ── Workspace: Git operations ──

ipcMain.handle('workspace:gitStatus', async () => {
  const { execFile } = require('child_process');
  return new Promise((resolve) => {
    execFile('git', ['status', '--porcelain'], { cwd: PROJECT_ROOT, timeout: 10000 }, (err, stdout) => {
      if (err) return resolve([]);
      resolve(stdout.trim().split('\n').filter(Boolean).map(line => ({
        status: line.substring(0, 2).trim(),
        file: line.substring(3),
      })));
    });
  });
});

ipcMain.handle('workspace:gitLog', async (_, count = 30) => {
  const { execFile } = require('child_process');
  return new Promise((resolve) => {
    execFile('git', ['log', `--max-count=${count}`, '--pretty=format:%h|%s|%an|%ar|%D'], { cwd: PROJECT_ROOT, timeout: 10000 }, (err, stdout) => {
      if (err) return resolve([]);
      resolve(stdout.trim().split('\n').filter(Boolean).map(line => {
        const [hash, message, author, date, refs] = line.split('|');
        return { hash, message, author, date, refs: refs || '' };
      }));
    });
  });
});

ipcMain.handle('workspace:gitDiff', async () => {
  const { execFile } = require('child_process');
  return new Promise((resolve) => {
    execFile('git', ['diff', '--stat'], { cwd: PROJECT_ROOT, timeout: 10000 }, (err, stdout) => {
      resolve(stdout || '');
    });
  });
});

ipcMain.handle('workspace:gitCommit', async (_, message) => {
  const { execFile } = require('child_process');
  return new Promise((resolve) => {
    execFile('git', ['add', '-A'], { cwd: PROJECT_ROOT, timeout: 10000 }, (addErr) => {
      if (addErr) return resolve({ success: false, error: addErr.message });
      execFile('git', ['commit', '-m', message], { cwd: PROJECT_ROOT, timeout: 30000 }, (err, stdout) => {
        if (err) return resolve({ success: false, error: err.message });
        resolve({ success: true, output: stdout });
      });
    });
  });
});

ipcMain.handle('workspace:gitPush', async () => {
  const { execFile } = require('child_process');
  return new Promise((resolve) => {
    execFile('git', ['push'], { cwd: PROJECT_ROOT, timeout: 60000 }, (err, stdout, stderr) => {
      if (err) return resolve({ success: false, error: stderr || err.message });
      resolve({ success: true, output: stdout || stderr });
    });
  });
});
