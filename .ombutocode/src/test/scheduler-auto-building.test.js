const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { createScheduler: createSchedulerBase } = require('../src/main/scheduler');

function createTempProjectRoot() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ombutocode-auto-building-test-'));
  const runGit = (args) => {
    const result = spawnSync('git', args, {
      cwd: projectRoot,
      encoding: 'utf-8'
    });
    if (result.status !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.error || 'unknown error'}`);
    }
  };

  runGit(['init']);
  runGit(['config', 'user.email', 'test@example.com']);
  runGit(['config', 'user.name', 'Test User']);
  fs.writeFileSync(path.join(projectRoot, 'README.md'), '# test\n', 'utf-8');
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
      const run = this.runsById.get(runId);
      return run || null;
    },
    startAgent(agentName, payload, options = {}) {
      this.started.push({ agentName, payload, options });
      runCounter += 1;
      const runId = `run-${runCounter}`;
      // Track the active run so capacity checks work
      this.activeRunByTicket.set(payload.ticketId, runId);
      this.runsById.set(runId, {
        agentName,
        state: 'running',
        ticketId: payload.ticketId
      });
      return { runId };
    }
  };
}

function createScheduler(deps) {
  const projectRoot = deps.projectRoot;
  return createSchedulerBase({
    createTicketWorktree: (ticketId) => ({
      branch: `ticket/${ticketId}`,
      worktreePath: path.join(projectRoot, '..', 'ombutocode-worktrees-test', ticketId)
    }),
    createEvalTrialMerge: (ticketId) => ({
      branch: `eval/${ticketId}`,
      worktreePath: path.join(projectRoot, '..', 'ombutocode-eval-test', `${ticketId}-eval`)
    }),
    cleanupEvalTrial: () => ({ removedWorktree: true, removedBranch: true }),
    ...deps
  });
}

test('start() transitions dependency-free todo tickets to building (respects max_concurrent)', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      { id: 'T-001', status: 'todo', title: 'No deps', assignee: 'codex' },
      { id: 'T-002', status: 'todo', title: 'Also no deps', assignee: 'codex' }
    ]
  };
  let writtenData = null;

  // max_concurrent defaults to 1, so only one ticket should transition
  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    writeBacklogData: (data) => { writtenData = data; },
    readAgentsConfig: () => ({
      tools: [{ id: 'codex', name: 'Codex', enabled: true, models: [{ id: 'gpt-5', enabled: true }] }]
    })
  });

  scheduler.start();

  assert.equal(backlog.tickets[0].status, 'building', 'first dependency-free ticket should be building');
  assert.equal(backlog.tickets[1].status, 'todo', 'second ticket stays todo when assignee is at max_concurrent');
  assert.ok(writtenData, 'backlog should have been written');

  scheduler.stop();
});

test('start() transitions multiple tickets when max_concurrent allows', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      { id: 'T-001', status: 'todo', title: 'No deps', assignee: 'codex' },
      { id: 'T-002', status: 'todo', title: 'Also no deps', assignee: 'codex' }
    ]
  };
  let writtenData = null;

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    writeBacklogData: (data) => { writtenData = data; },
    readAgentsConfig: () => ({
      tools: [{ id: 'codex', name: 'Codex', enabled: true, max_concurrent: 2, models: [{ id: 'gpt-5', enabled: true }] }]
    })
  });

  scheduler.start();

  assert.equal(backlog.tickets[0].status, 'building', 'first ticket should be building');
  assert.equal(backlog.tickets[1].status, 'building', 'second ticket should be building with max_concurrent=2');
  assert.ok(writtenData, 'backlog should have been written');

  scheduler.stop();
});

test('start() does NOT transition tickets with unresolved dependencies to building', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      { id: 'T-001', status: 'todo', title: 'Has deps', dependencies: ['T-002'], assignee: 'codex' },
      { id: 'T-002', status: 'todo', title: 'Dep ticket', assignee: 'codex' }
    ]
  };
  let writtenData = null;

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    writeBacklogData: (data) => { writtenData = data; },
    readAgentsConfig: () => ({
      tools: [{ id: 'codex', name: 'Codex', enabled: true, models: [{ id: 'gpt-5', enabled: true }] }]
    })
  });

  scheduler.start();

  // T-002 has no deps so it transitions to building
  assert.equal(backlog.tickets[1].status, 'building', 'dependency-free ticket should be building');
  // T-001 depends on T-002 which is now 'building' (not review/done), so stays todo
  assert.equal(backlog.tickets[0].status, 'todo', 'ticket with unresolved deps should remain todo');

  scheduler.stop();
});

test('stop() reverts building tickets back to todo', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      { id: 'T-001', status: 'todo', title: 'Will build', assignee: 'codex' },
      { id: 'T-002', status: 'in_progress', title: 'Already running' }
    ]
  };
  let writeCount = 0;

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    writeBacklogData: () => { writeCount++; },
    readAgentsConfig: () => ({
      tools: [{ id: 'codex', name: 'Codex', enabled: true, models: [{ id: 'gpt-5', enabled: true }] }]
    })
  });

  scheduler.start();
  assert.equal(backlog.tickets[0].status, 'building');

  scheduler.stop();
  assert.equal(backlog.tickets[0].status, 'todo', 'building ticket should revert to todo on stop');
  assert.equal(backlog.tickets[1].status, 'in_progress', 'in_progress ticket should not be affected');
});

test('tickets with dependencies resolved (review/done) transition to building', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      { id: 'T-001', status: 'todo', title: 'Has resolved deps', dependencies: ['T-002', 'T-003'], assignee: 'codex' },
      { id: 'T-002', status: 'review', title: 'In review' },
      { id: 'T-003', status: 'done', title: 'Done' }
    ]
  };
  let writtenData = null;

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    writeBacklogData: (data) => { writtenData = data; },
    readAgentsConfig: () => ({
      tools: [{ id: 'codex', name: 'Codex', enabled: true, models: [{ id: 'gpt-5', enabled: true }] }]
    })
  });

  scheduler.start();

  assert.equal(backlog.tickets[0].status, 'building', 'ticket with resolved deps should be building');
  assert.ok(writtenData, 'backlog should have been written');

  scheduler.stop();
});

test('processQueue dispatches building tickets to agents', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      { id: 'T-001', status: 'todo', title: 'Auto ticket', assignee: 'codex' }
    ]
  };

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    writeBacklogData: () => {},
    readAgentsConfig: () => ({
      tools: [{ id: 'codex', name: 'Codex', enabled: true, models: [{ id: 'gpt-5', enabled: true }] }]
    })
  });

  scheduler.start();

  // The ticket should have been transitioned to building and then dispatched
  assert.equal(backlog.tickets[0].status, 'building');
  assert.equal(agentRuntime.started.length, 1, 'agent should have been started for building ticket');
  assert.equal(agentRuntime.started[0].payload.ticketId, 'T-001');

  scheduler.stop();
});

test('non-todo tickets are not affected by building transition', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      { id: 'T-001', status: 'backlog', title: 'Backlog ticket' },
      { id: 'T-002', status: 'in_progress', title: 'IP ticket' },
      { id: 'T-003', status: 'eval', title: 'Eval ticket', assignee: 'codex' },
      { id: 'T-004', status: 'review', title: 'Review ticket' },
      { id: 'T-005', status: 'done', title: 'Done ticket' }
    ]
  };

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    writeBacklogData: () => {},
    readAgentsConfig: () => ({
      tools: [{ id: 'codex', name: 'Codex', enabled: true, models: [{ id: 'gpt-5', enabled: true }] }]
    })
  });

  scheduler.start();

  assert.equal(backlog.tickets[0].status, 'backlog');
  assert.equal(backlog.tickets[1].status, 'in_progress');
  assert.equal(backlog.tickets[2].status, 'eval');
  assert.equal(backlog.tickets[3].status, 'review');
  assert.equal(backlog.tickets[4].status, 'done');

  scheduler.stop();
});

test('todo ticket stays in todo when assignee agent is busy with an active run', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();

  // Simulate an active run for codex on T-001
  agentRuntime.activeRunByTicket.set('T-001', 'run-existing');
  agentRuntime.runsById.set('run-existing', {
    agentName: 'codex',
    state: 'running',
    ticketId: 'T-001'
  });

  const backlog = {
    tickets: [
      { id: 'T-001', status: 'building', title: 'Already building' },
      { id: 'T-002', status: 'todo', title: 'Waiting for agent', assignee: 'codex' }
    ]
  };
  let writtenData = null;

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    writeBacklogData: (data) => { writtenData = data; },
    readAgentsConfig: () => ({
      tools: [{ id: 'codex', name: 'Codex', enabled: true, models: [{ id: 'gpt-5', enabled: true }] }]
    })
  });

  scheduler.start();

  // T-002 should stay todo because codex is busy (1 active run, max_concurrent=1)
  assert.equal(backlog.tickets[1].status, 'todo', 'ticket should stay todo when assignee is busy');

  scheduler.stop();
});

test('scheduler works without writeBacklogData (backward compatible)', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      { id: 'T-001', status: 'todo', title: 'Todo ticket', assignee: 'codex' }
    ]
  };

  // No writeBacklogData provided — should not crash
  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    readAgentsConfig: () => ({
      tools: [{ id: 'codex', name: 'Codex', enabled: true, models: [{ id: 'gpt-5', enabled: true }] }]
    })
  });

  scheduler.start();
  // Ticket status won't change since writeBacklogData is not provided
  assert.equal(backlog.tickets[0].status, 'todo');

  scheduler.stop();
});
