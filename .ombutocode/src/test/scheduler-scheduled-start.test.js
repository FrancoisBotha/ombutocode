const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const initSqlJs = require('sql.js');

const { createScheduler: createSchedulerBase, getScheduledStartDelayMs } = require('../src/main/scheduler');
const backlogDb = require('../src/main/backlogDb');

function createTempProjectRoot() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ombutocode-scheduled-start-test-'));
  const runGit = (args) => {
    const result = spawnSync('git', args, { cwd: projectRoot, encoding: 'utf-8' });
    if (result.status !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.error || 'unknown error'}`);
    }
  };

  runGit(['init']);
  runGit(['config', 'user.email', 'test@example.com']);
  runGit(['config', 'user.name', 'Test User']);
  fs.writeFileSync(path.join(projectRoot, 'README.md'), '# scheduled start test\n', 'utf-8');
  runGit(['add', 'README.md']);
  runGit(['commit', '-m', 'initial commit']);

  return projectRoot;
}

function buildAgentRuntimeStub() {
  let runCounter = 0;
  return {
    activeRunByTicket: new Map(),
    runsById: new Map(),
    started: [],
    getRunStatus({ ticketId } = {}) {
      const runId = this.activeRunByTicket.get(ticketId);
      if (!runId) return null;
      return this.runsById.get(runId) || null;
    },
    startAgent(agentName, payload, options = {}) {
      this.started.push({ agentName, payload, options });
      runCounter += 1;
      const runId = `run-${runCounter}`;
      this.activeRunByTicket.set(payload.ticketId, runId);
      this.runsById.set(runId, { agentName, state: 'running', ticketId: payload.ticketId });
      return { runId };
    }
  };
}

function createScheduler(deps) {
  const projectRoot = deps.projectRoot;
  return createSchedulerBase({
    createTicketWorktree: (ticketId) => ({
      branch: `ticket/${ticketId}`,
      worktreePath: path.join(projectRoot, '..', 'ombutocode-scheduled-start-worktrees', ticketId)
    }),
    createEvalTrialMerge: (ticketId) => ({
      branch: `eval/${ticketId}`,
      worktreePath: path.join(projectRoot, '..', 'ombutocode-scheduled-start-eval', `${ticketId}-eval`)
    }),
    cleanupEvalTrial: () => ({ removedWorktree: true, removedBranch: true }),
    epicsDir: null,
    readAgentsConfig: () => ({
      tools: [{ id: 'codex', name: 'Codex', enabled: true, models: [{ id: 'gpt-5', enabled: true }] }]
    }),
    ...deps
  });
}

function isoFromNow(offsetMs) {
  return new Date(Date.now() + offsetMs).toISOString();
}

test('a todo ticket with a future scheduled_start is held back and stays todo', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      { id: 'SCHED-001', status: 'todo', title: 'Tonight', assignee: 'codex', scheduled_start: isoFromNow(60 * 60 * 1000) }
    ]
  };
  const events = [];

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    writeBacklogData: () => {},
    logEvent: (type) => events.push(type)
  });

  scheduler.start();
  const status = scheduler.getStatus();
  scheduler.stop();

  assert.equal(agentRuntime.started.length, 0, 'scheduled ticket must not be dispatched');
  assert.equal(backlog.tickets[0].status, 'todo', 'scheduled ticket must not be promoted to building');
  assert.deepEqual(status.queue.nextTickets.map((t) => t.id), [], 'scheduled ticket is not ready');
  assert.equal(status.queue.readyCount, 0);
  assert.equal(status.queue.scheduledCount, 1);
  assert.equal(status.queue.scheduledTickets[0].id, 'SCHED-001');
  assert.ok(status.queue.scheduledTickets[0].scheduledStartsInMs > 59 * 60 * 1000, 'reports time remaining');
  assert.match(status.queue.scheduledTickets[0].waitReason, /Waiting until scheduled start/);
  assert.ok(!events.includes('ticket.scheduled_start_reached'), 'no release event while still waiting');
});

test('a todo ticket whose scheduled_start has passed is dispatched and logged as released', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      { id: 'SCHED-002', status: 'todo', title: 'Past due', assignee: 'codex', scheduled_start: isoFromNow(-60 * 1000) }
    ]
  };
  const events = [];

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    logEvent: (type, level, message, meta) => events.push({ type, ticketId: meta?.ticketId })
  });

  scheduler.start();
  scheduler.stop();

  assert.equal(agentRuntime.started.length, 1, 'past scheduled_start no longer blocks pickup');
  assert.equal(agentRuntime.started[0].payload.ticketId, 'SCHED-002');
  const reached = events.filter((e) => e.type === 'ticket.scheduled_start_reached');
  assert.equal(reached.length, 1, 'release is logged exactly once');
  assert.equal(reached[0].ticketId, 'SCHED-002');
});

test('an unparsable scheduled_start is treated as unscheduled', async () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      { id: 'SCHED-003', status: 'todo', title: 'Garbage date', assignee: 'codex', scheduled_start: 'next tuesday-ish' }
    ]
  };

  const scheduler = createScheduler({ projectRoot, agentRuntime, readBacklogData: () => backlog });
  scheduler.start();
  scheduler.stop();

  assert.equal(agentRuntime.started.length, 1, 'garbage scheduled_start must not block the ticket');
  assert.equal(getScheduledStartDelayMs(backlog.tickets[0]), 0);

  // The DB normaliser nulls the field on read and on update.
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT)');
  await backlogDb.open(db);
  try {
    backlogDb.initializeSchema();
    backlogDb.insertTicket({ id: 'SCHED-003', title: 'Garbage date', status: 'todo', scheduled_start: 'next tuesday-ish' });
    assert.equal(backlogDb.getTicketById('SCHED-003').scheduled_start, null, 'unparsable value reads back as null');

    backlogDb.updateTicketFields('SCHED-003', { scheduled_start: '2026-09-09T01:01:00+02:00' });
    assert.equal(backlogDb.getTicketById('SCHED-003').scheduled_start, '2026-09-09T01:01:00+02:00', 'valid ISO value is kept verbatim');

    backlogDb.updateTicketFields('SCHED-003', { scheduled_start: 'not a date' });
    assert.equal(backlogDb.getTicketById('SCHED-003').scheduled_start, null, 'unparsable update clears the field');

    backlogDb.insertTicket({ id: 'SCHED-004', title: 'No field', status: 'todo' });
    assert.equal(backlogDb.getTicketById('SCHED-004').scheduled_start, null, 'missing field normalises to null');
  } finally {
    backlogDb.close();
    db.close();
  }
});

test('the wake-up timer arms for the earliest future scheduled_start and fires a dispatch', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const soonMs = 5 * 60 * 1000;
  const backlog = {
    tickets: [
      { id: 'SCHED-LATE', status: 'todo', title: 'Later', assignee: 'codex', scheduled_start: isoFromNow(3 * 60 * 60 * 1000) },
      { id: 'SCHED-SOON', status: 'todo', title: 'Sooner', assignee: 'codex', scheduled_start: isoFromNow(soonMs) },
      { id: 'SCHED-UNASSIGNED', status: 'todo', title: 'Nobody', scheduled_start: isoFromNow(1000) }
    ]
  };
  const timers = [];
  const cancelled = [];

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    scheduleTimer: (fn, delayMs) => {
      const handle = { fn, delayMs };
      timers.push(handle);
      return handle;
    },
    cancelTimer: (handle) => cancelled.push(handle)
  });

  scheduler.start();

  assert.equal(timers.length, 1, 'one timer armed on start');
  // Armed for the soonest assigned ticket (plus a one-second margin), not the
  // later one and not the unassigned one.
  assert.ok(timers[0].delayMs > soonMs - 5000 && timers[0].delayMs <= soonMs + 1000, `unexpected delay ${timers[0].delayMs}`);
  assert.equal(agentRuntime.started.length, 0);

  // Move the soon ticket's time into the past and fire the timer: the ticket
  // is dispatched and the timer re-arms for the remaining later ticket.
  backlog.tickets[1].scheduled_start = isoFromNow(-1000);
  timers[0].fn();

  assert.equal(agentRuntime.started.length, 1, 'timer dispatch picks up the released ticket');
  assert.equal(agentRuntime.started[0].payload.ticketId, 'SCHED-SOON');
  assert.equal(timers.length, 2, 're-armed for the next scheduled ticket');
  assert.ok(timers[1].delayMs > 2 * 60 * 60 * 1000, 'second timer targets the later ticket');

  scheduler.stop();
  assert.ok(cancelled.includes(timers[1]), 'stop() cancels the pending timer');
});
