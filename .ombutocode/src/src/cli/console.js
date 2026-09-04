'use strict';

/**
 * The legacy headless scheduler console — the board that `node headless.js`
 * has always drawn. Lifted out of headless.js unchanged so the `run`
 * subcommand can reuse it when no drain condition is requested.
 */

const ACTIVE_COLUMNS = ['todo', 'building', 'in_progress', 'eval', 'merging', 'review'];

function formatDuration(ms) {
  if (!ms || ms < 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function renderBoard({ scheduler, utils, settingsStore, now = new Date() }) {
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
  const SEP = '═'.repeat(55);
  const THIN_SEP = '─'.repeat(55);

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
        parts.push(`[${typeof assignee === 'object' ? assignee.tool : assignee}]`);
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

/**
 * Start the scheduler, draw the board on the refresh interval and stop
 * cleanly on SIGINT/SIGTERM. Resolves only when the process is shutting down.
 *
 * @param {Object} ctx  boot context from bootProject()
 * @param {{ output?: Function, isTTY?: boolean, exit?: Function }} [io]
 */
function runSchedulerConsole(ctx, io = {}) {
  const { scheduler, utils, settingsStore } = ctx;
  const { persistSchedulerRunning } = require('./bootstrap');
  const output = io.output || ((text) => console.log(text));
  const isTTY = io.isTTY !== undefined ? io.isTTY : process.stdout.isTTY;
  const exit = io.exit || ((code) => process.exit(code));

  scheduler.start();
  console.log('[Scheduler] Started in headless mode');
  persistSchedulerRunning(scheduler, true);

  function displayBoard() {
    const board = renderBoard({ scheduler, utils, settingsStore });
    if (isTTY) {
      console.clear();
    } else {
      output('');  // separator for piped output
    }
    output(board);
  }

  // Initial display
  displayBoard();

  // Periodic refresh
  const refreshMs = settingsStore.get('app_refresh_interval', 30) * 1000;
  const displayInterval = setInterval(displayBoard, refreshMs);

  let shuttingDown = false;
  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[Headless] Received ${signal}, shutting down...`);

    clearInterval(displayInterval);
    scheduler.stop();
    persistSchedulerRunning(scheduler, false);

    console.log('[Headless] Scheduler stopped. Exiting.');
    exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return { shutdown, displayBoard };
}

module.exports = { ACTIVE_COLUMNS, formatDuration, renderBoard, runSchedulerConsole };
