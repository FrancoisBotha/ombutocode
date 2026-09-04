'use strict';

/**
 * `headless.js status` — ticket counts by status, active runs, scheduler
 * state and the last manifest stage. Read-only.
 */

const fs = require('fs');
const path = require('path');

const { lastManifestStage } = require('./manifest');
const { EXIT_OK } = require('./args');

function countByStatus(tickets) {
  const counts = {};
  for (const ticket of tickets) {
    const status = String(ticket?.status || 'unknown').toLowerCase();
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

/** Ticket files under .ombutocode/data/tickets/ mark tickets an agent is working on. */
function listActiveTicketFiles(ticketsDir) {
  try {
    return fs.readdirSync(ticketsDir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
  } catch {
    return [];
  }
}

function collectStatus(ctx, { now = () => new Date() } = {}) {
  const { paths, utils, scheduler } = ctx;
  const tickets = ctx.dbReady ? utils.readBacklogData().tickets : [];
  const schedulerStatus = scheduler.getStatus();
  const state = scheduler.windowTracker.loadState();
  const lastStage = lastManifestStage(paths.MANIFEST_PATH);

  return {
    ok: true,
    projectRoot: paths.PROJECT_ROOT,
    timestamp: now().toISOString(),
    counts: countByStatus(tickets),
    total: tickets.length,
    tickets: tickets.map((t) => ({
      id: t.id,
      title: t.title || '',
      status: t.status || null,
      assignee: t.assignee ?? null,
      dependencies: Array.isArray(t.dependencies) ? t.dependencies : [],
      failCount: Number(t.fail_count) || 0,
      mergeCommitSha: t.merge_commit_sha || null
    })),
    activeRuns: schedulerStatus.activeRuns || [],
    activeTicketFiles: listActiveTicketFiles(paths.TICKETS_DIR),
    scheduler: {
      status: schedulerStatus.status,
      pauseReason: schedulerStatus.pauseReason || null,
      agentPauses: schedulerStatus.agentPauses || [],
      persistedRunning: state.scheduler_running === true
    },
    lastManifestStage: lastStage
      ? { stage: lastStage.stage, ok: lastStage.ok, exitCode: lastStage.exitCode, finishedAt: lastStage.finishedAt }
      : null,
    manifestPath: path.relative(paths.PROJECT_ROOT, paths.MANIFEST_PATH).split(path.sep).join('/')
  };
}

function formatStatus(status) {
  const lines = [];
  lines.push(`Project: ${status.projectRoot}`);
  lines.push(`Tickets: ${status.total}`);
  for (const [name, count] of Object.entries(status.counts).sort()) {
    lines.push(`  ${name.padEnd(12)} ${count}`);
  }
  lines.push(`Scheduler: ${status.scheduler.status} (persisted running=${status.scheduler.persistedRunning})`);
  if (status.activeTicketFiles.length) lines.push(`Active ticket files: ${status.activeTicketFiles.join(', ')}`);
  if (status.activeRuns.length) {
    lines.push('Active runs:');
    for (const run of status.activeRuns) lines.push(`  ${run.ticketId} ${run.agentName} ${run.state} pid=${run.pid || 'n/a'}`);
  }
  lines.push(`Last manifest stage: ${status.lastManifestStage ? `${status.lastManifestStage.stage} (ok=${status.lastManifestStage.ok}, exit=${status.lastManifestStage.exitCode}, ${status.lastManifestStage.finishedAt})` : '(none)'}`);
  return lines.join('\n');
}

async function runStatus(ctx, options, deps = {}) {
  const startedAt = new Date().toISOString();
  const result = collectStatus(ctx, deps);
  return {
    ok: true,
    exitCode: EXIT_OK,
    agent: null,
    model: null,
    tokens: null,
    startedAt,
    finishedAt: new Date().toISOString(),
    result,
    text: formatStatus(result)
  };
}

module.exports = { countByStatus, collectStatus, formatStatus, runStatus };
