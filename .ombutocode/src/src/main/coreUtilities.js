'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
let backlogDb = null;
let ombutocodeDb = null;
let ticketFileManager = null;

// --- Constants ---
const NOTE_OUTPUT_LIMIT = 200;
const DEFAULT_RUN_LOG_TAIL_CHARS = 12000;

// --- Standalone utilities (no path dependency) ---

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

function sanitizePathSegment(value) {
  return String(value || 'unknown')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 120);
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

// --- Factory: path-dependent utilities ---

/**
 * Set the backlogDb and ombutocodeDb module references so the utilities can use SQLite.
 */
function setDbModules(backlogDbModule, ombutocodeDbModule) {
  backlogDb = backlogDbModule || null;
  ombutocodeDb = ombutocodeDbModule || null;
}

/**
 * Set the ticketFileManager module reference for active ticket file support.
 */
function setTicketFileManager(tfm) {
  ticketFileManager = tfm || null;
}

/**
 * Create path-dependent utility functions.
 *
 * @param {Object} projectPaths
 * @param {string} projectPaths.projectRoot
 * @param {string} projectPaths.backlogPath
 * @param {string} projectPaths.agentsPath
 * @param {string} projectPaths.agentLogDir
 * @param {string} projectPaths.agentLogPath
 * @param {string} projectPaths.runOutputDir
 * @returns {Object} Utility functions bound to the given paths
 */
function createUtilities(projectPaths) {
  const {
    projectRoot,
    backlogPath,
    agentsPath,
    agentLogDir,
    agentLogPath,
    runOutputDir
  } = projectPaths;

  function readBacklogData() {
    if (backlogDb) {
      try {
        return backlogDb.readBacklogData();
      } catch {
        return { version: 1, updated_at: '', tickets: [] };
      }
    }
    // Fallback to YAML (pre-migration)
    try {
      const content = fs.readFileSync(backlogPath, 'utf-8');
      return yaml.load(content) || { version: 1, updated_at: '', tickets: [] };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { version: 1, updated_at: '', tickets: [] };
      }
      throw error;
    }
  }

  function writeBacklogData(data) {
    data.updated_at = new Date().toISOString().split('T')[0];
    if (backlogDb) {
      backlogDb.writeBacklogData(data);
      if (ombutocodeDb) ombutocodeDb.saveDb();
      return;
    }
    // Fallback to YAML (pre-migration)
    fs.writeFileSync(backlogPath, yaml.dump(data, { lineWidth: -1, noRefs: true }), 'utf-8');
  }

  function readAgentsConfig() {
    try {
      const content = fs.readFileSync(agentsPath, 'utf-8');
      return yaml.load(content) || { version: 1, tools: [] };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { version: 1, tools: [] };
      }
      throw error;
    }
  }

  function updateTicket(ticketId, updater) {
    if (backlogDb) {
      const ticket = backlogDb.getTicketById(ticketId);
      if (!ticket) return false;
      updater(ticket);
      ticket.last_updated = new Date().toISOString();
      backlogDb.updateTicketFields(ticketId, ticket);
      // Only save DB when data was written to DB (not just to ticket file)
      const ACTIVE_STATUSES = backlogDb.ACTIVE_STATUSES;
      if (!ACTIVE_STATUSES || !ACTIVE_STATUSES.has(ticket.status)) {
        if (ombutocodeDb) ombutocodeDb.saveDb();
      }
      return true;
    }
    // Fallback to full-file RMW (pre-migration)
    const data = readBacklogData();
    const ticket = Array.isArray(data.tickets)
      ? data.tickets.find((entry) => entry.id === ticketId)
      : null;

    if (!ticket) return false;

    updater(ticket);
    ticket.last_updated = new Date().toISOString();
    writeBacklogData(data);
    return true;
  }

  function appendAgentLog(entry) {
    try {
      fs.mkdirSync(agentLogDir, { recursive: true });
      fs.appendFileSync(agentLogPath, `${JSON.stringify(entry)}\n`, 'utf-8');
    } catch (error) {
      console.warn('Unable to write agent run log:', error?.message || error);
    }
  }

  function trimAgentLog() {
    try {
      if (!fs.existsSync(agentLogPath)) return;
      const todayPrefix = new Date().toISOString().slice(0, 10);
      const lines = fs.readFileSync(agentLogPath, 'utf-8').split('\n').filter(Boolean);
      const kept = lines.filter((line) => {
        try {
          const { ts } = JSON.parse(line);
          return typeof ts === 'string' && ts.slice(0, 10) >= todayPrefix;
        } catch {
          return false;
        }
      });
      fs.writeFileSync(agentLogPath, kept.length ? kept.join('\n') + '\n' : '', 'utf-8');
      const removed = lines.length - kept.length;
      if (removed > 0) {
        console.log(`[AgentLog] Trimmed ${removed} entries older than ${todayPrefix}`);
      }
    } catch (error) {
      console.warn('Unable to trim agent run log:', error?.message || error);
    }
  }

  function buildRunOutputFilePaths(run) {
    const safeTicketId = sanitizePathSegment(run.ticketId);
    const safeRunId = sanitizePathSegment(run.runId);
    const baseName = `${safeTicketId}__${safeRunId}`;
    const stdoutPath = path.join(runOutputDir, `${baseName}.stdout.log`);
    const stderrPath = path.join(runOutputDir, `${baseName}.stderr.log`);
    return {
      stdoutPath,
      stderrPath,
      stdoutRelative: path.relative(projectRoot, stdoutPath),
      stderrRelative: path.relative(projectRoot, stderrPath)
    };
  }

  function ensureRunOutputDirectory() {
    fs.mkdirSync(runOutputDir, { recursive: true });
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

  return {
    readBacklogData,
    writeBacklogData,
    readAgentsConfig,
    updateTicket,
    appendAgentLog,
    trimAgentLog,
    buildRunOutputFilePaths,
    ensureRunOutputDirectory,
    writeRunOutputFiles,
    removeRunOutputFile
  };
}

module.exports = {
  // Constants
  NOTE_OUTPUT_LIMIT,
  DEFAULT_RUN_LOG_TAIL_CHARS,
  // Standalone utilities
  collapseWhitespace,
  shorten,
  formatCommandLine,
  sanitizePathSegment,
  appendTicketNote,
  summarizeTrialMergeFailure,
  summarizeSquashMergeFailure,
  // Factory
  createUtilities,
  // DB injection
  setDbModules,
  // Ticket file manager injection
  setTicketFileManager
};
