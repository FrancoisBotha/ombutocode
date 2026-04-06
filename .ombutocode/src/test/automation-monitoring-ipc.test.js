const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createScheduler } = require('../src/main/scheduler');

function createTempProjectRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ombutocode-automation-ipc-test-'));
}

function createRuntimeWithRuns(runs) {
  const runtime = {
    activeRunByTicket: new Map(),
    runsById: new Map(),
    getRunStatus() {
      return null;
    },
    startAgent() {
      throw new Error('startAgent should not be called in automation snapshot tests');
    }
  };

  for (const run of runs) {
    runtime.runsById.set(run.runId, { ...run });
    runtime.activeRunByTicket.set(run.ticketId, run.runId);
  }

  return runtime;
}

test('automation active-runs snapshot returns running and queued runs with optional filtering', () => {
  const projectRoot = createTempProjectRoot();
  const runtime = createRuntimeWithRuns([
    {
      runId: 'run-1',
      ticketId: 'AD_HOC-IPC-001',
      agentName: 'codex',
      state: 'running',
      startedAt: new Date(Date.now() - 60000).toISOString(),
      pid: 111
    },
    {
      runId: 'run-2',
      ticketId: 'AD_HOC-IPC-002',
      agentName: 'kimi',
      state: 'queued',
      startedAt: new Date(Date.now() - 30000).toISOString(),
      pid: 222
    },
    {
      runId: 'run-3',
      ticketId: 'AD_HOC-IPC-003',
      agentName: 'codex',
      state: 'completed',
      startedAt: new Date(Date.now() - 120000).toISOString(),
      pid: 333
    }
  ]);
  const backlog = {
    tickets: [
      { id: 'AD_HOC-IPC-001', status: 'todo', assignee: 'codex' },
      { id: 'AD_HOC-IPC-002', status: 'eval' }
    ]
  };

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime: runtime,
    readBacklogData: () => backlog,
    readAgentsConfig: () => ({ tools: [] }),
    readEvalDefaultAgent: () => 'codex'
  });

  const allRuns = scheduler.getAutomationActiveRuns();
  assert.equal(allRuns.length, 2);
  assert.deepEqual(
    allRuns.map((run) => [run.ticketId, run.queueStatus, run.state]),
    [
      ['AD_HOC-IPC-001', 'todo', 'running'],
      ['AD_HOC-IPC-002', 'eval', 'queued']
    ]
  );
  assert.deepEqual(
    allRuns.map((run) => run.branch),
    [null, null],
    'branch should be null when no scheduler worktree metadata is attached'
  );

  const runningOnly = scheduler.getAutomationActiveRuns({ includeQueued: false });
  assert.equal(runningOnly.length, 1);
  assert.equal(runningOnly[0].ticketId, 'AD_HOC-IPC-001');
  assert.equal(runningOnly[0].branch, null);
});

test('automation eval-queue snapshot excludes active eval and reports readiness', () => {
  const projectRoot = createTempProjectRoot();
  const runtime = createRuntimeWithRuns([
    {
      runId: 'run-eval-active',
      ticketId: 'EVAL_IPC-001',
      agentName: 'codex',
      state: 'running',
      startedAt: new Date(Date.now() - 45000).toISOString()
    }
  ]);
  const backlog = {
    tickets: [
      { id: 'EVAL_DEP-001', status: 'todo', assignee: 'codex' },
      { id: 'EVAL_IPC-001', status: 'eval', title: 'Active eval' },
      { id: 'EVAL_IPC-002', status: 'eval', title: 'Blocked eval', dependencies: ['EVAL_DEP-001'] },
      { id: 'EVAL_IPC-003', status: 'eval', title: 'Ready eval' }
    ]
  };

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime: runtime,
    readBacklogData: () => backlog,
    readAgentsConfig: () => ({ tools: [] }),
    readEvalDefaultAgent: () => 'codex'
  });

  const snapshot = scheduler.getAutomationEvalQueue({ limit: 10 });
  assert.equal(snapshot.totalTickets, 3);
  assert.equal(snapshot.activeCount, 1);
  assert.equal(snapshot.tickets.length, 2);
  assert.equal(snapshot.readyCount, 1);
  assert.equal(snapshot.activeTicketIds.includes('EVAL_IPC-001'), true);

  const blockedTicket = snapshot.tickets.find((ticket) => ticket.id === 'EVAL_IPC-002');
  assert.equal(blockedTicket.ready, false);
  assert.equal(blockedTicket.blockedByDependencies, true);
  assert.equal(blockedTicket.estimatedPickupAt, null);

  const readyTicket = snapshot.tickets.find((ticket) => ticket.id === 'EVAL_IPC-003');
  assert.equal(readyTicket.ready, true);
  assert.ok(typeof readyTicket.estimatedPickupAt === 'string');
});

test('automation agent-status snapshot includes capacity and pause countdown', () => {
  const projectRoot = createTempProjectRoot();
  const runtime = createRuntimeWithRuns([
    {
      runId: 'run-impl',
      ticketId: 'AD_HOC-IPC-010',
      agentName: 'codex',
      state: 'running',
      startedAt: new Date(Date.now() - 40000).toISOString()
    },
    {
      runId: 'run-eval',
      ticketId: 'AD_HOC-IPC-011',
      agentName: 'codex',
      state: 'queued',
      startedAt: new Date(Date.now() - 20000).toISOString()
    }
  ]);
  const backlog = {
    tickets: [
      { id: 'AD_HOC-IPC-010', status: 'todo', assignee: 'codex' },
      { id: 'AD_HOC-IPC-011', status: 'eval' }
    ]
  };
  const scheduler = createScheduler({
    projectRoot,
    agentRuntime: runtime,
    readBacklogData: () => backlog,
    readAgentsConfig: () => ({
      tools: [
        { id: 'codex', name: 'Codex', enabled: true, max_concurrent: 2, models: [{ id: 'gpt-5', enabled: true }] },
        { id: 'kimi', name: 'Kimi', enabled: true, max_concurrent: 1, models: [{ id: 'k2', enabled: true }] },
        { id: 'claude', name: 'Claude', enabled: false, max_concurrent: 1, models: [{ id: 'sonnet', enabled: true }] }
      ]
    }),
    readEvalDefaultAgent: () => 'codex'
  });

  const pauseUntil = new Date(Date.now() + 5 * 60000).toISOString();
  scheduler.windowTracker.pauseToolWindowPickup('codex', 'Provider rate/session limit', { pauseUntil });

  const status = scheduler.getAutomationAgentStatus();
  assert.equal(status.length, 2);

  const codex = status.find((entry) => entry.toolId === 'codex');
  assert.equal(codex.isEvalDefaultAgent, true);
  assert.equal(codex.maxConcurrent, 2);
  assert.equal(codex.testCapacity, 1);
  assert.equal(codex.evalCapacity, 1);
  assert.equal(codex.totalCapacity, 5);
  assert.equal(codex.activeImplementationRuns, 1);
  assert.equal(codex.activeEvaluationRuns, 1);
  assert.equal(codex.isPaused, true);
  assert.equal(codex.pauseUntil, pauseUntil);
  assert.ok(codex.pauseRemainingMs > 0);

  const kimi = status.find((entry) => entry.toolId === 'kimi');
  assert.equal(kimi.isPaused, false);
  assert.equal(kimi.activeTotalRuns, 0);
});

test('manual unpause clears provider pause state', () => {
  const projectRoot = createTempProjectRoot();
  const runtime = createRuntimeWithRuns([]);
  const scheduler = createScheduler({
    projectRoot,
    agentRuntime: runtime,
    readBacklogData: () => ({ tickets: [] }),
    readAgentsConfig: () => ({
      tools: [
        { id: 'codex', name: 'Codex', enabled: true, max_concurrent: 2, models: [{ id: 'gpt-5', enabled: true }] }
      ]
    }),
    readEvalDefaultAgent: () => 'codex'
  });

  scheduler.windowTracker.pauseToolWindowPickup('codex', 'Provider rate/session limit');
  let status = scheduler.getAutomationAgentStatus();
  assert.equal(status[0].isPaused, true);

  scheduler.windowTracker.resumeToolWindowPickup('codex');
  status = scheduler.getAutomationAgentStatus();
  assert.equal(status[0].isPaused, false);
  assert.equal(status[0].pauseReason, null);
  assert.equal(status[0].pauseUntil, null);
});

test('automation channel wiring exists in main handlers and preload allowlist', () => {
  const mainContent = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf-8');
  const preloadContent = fs.readFileSync(path.join(__dirname, '../preload.js'), 'utf-8');

  assert.ok(mainContent.includes("ipcMain.handle('automation:active-runs'"));
  assert.ok(mainContent.includes("ipcMain.handle('automation:eval-queue'"));
  assert.ok(mainContent.includes("ipcMain.handle('automation:agent-status'"));
  assert.ok(mainContent.includes("ipcMain.handle('automation:unpause-agent'"));

  assert.ok(preloadContent.includes("'automation:active-runs'"));
  assert.ok(preloadContent.includes("'automation:eval-queue'"));
  assert.ok(preloadContent.includes("'automation:agent-status'"));
  assert.ok(preloadContent.includes("'automation:unpause-agent'"));

  // Backward compatibility guard: scheduler channels must remain.
  assert.ok(mainContent.includes("ipcMain.handle('scheduler:status'"));
  assert.ok(preloadContent.includes("'scheduler:status'"));
});
