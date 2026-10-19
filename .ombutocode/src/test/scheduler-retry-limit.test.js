const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { createScheduler: createSchedulerBase } = require('../src/main/scheduler');

function createTempProjectRoot() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ombutocode-retry-limit-test-'));
  const runGit = (args) => {
    const result = spawnSync('git', args, { cwd: projectRoot, encoding: 'utf-8' });
    if (result.status !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.error || 'unknown error'}`);
    }
  };
  runGit(['init']);
  runGit(['config', 'user.email', 'test@example.com']);
  runGit(['config', 'user.name', 'Test User']);
  fs.writeFileSync(path.join(projectRoot, 'README.md'), '# retry limit test\n', 'utf-8');
  runGit(['add', 'README.md']);
  runGit(['commit', '-m', 'initial commit']);
  return projectRoot;
}

function buildAgentRuntimeStub() {
  let runCounter = 0;
  return {
    activeRunByTicket: new Map(),
    started: [],
    getRunStatus() { return null; },
    startAgent(agentName, payload, options = {}) {
      this.started.push({ agentName, payload, options });
      runCounter += 1;
      return { runId: `run-${runCounter}` };
    }
  };
}

const TOOLS = {
  tools: [{ id: 'claude', name: 'Claude', enabled: true, max_concurrent: 5, models: [{ id: 'sonnet', enabled: true }] }]
};

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
    readAgentsConfig: () => TOOLS,
    // Stage defaults are what let halted tickets slip through before the fix:
    // they never consulted the ticket's own assignee or failure counts.
    readStageAssignee: () => 'claude',
    readEvalDefaultAgent: () => 'claude',
    readMaxEvalRetries: () => 3,
    ...deps
  });
}

function runOnce(backlog, overrides = {}) {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const events = [];
  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    writeBacklogData: () => {},
    logEvent: (type, level, message, meta) => events.push({ type, level, message, meta }),
    ...overrides
  });
  scheduler.start();
  scheduler.stop();
  return { agentRuntime, events };
}

for (const status of ['test', 'eval', 'todo', 'building']) {
  test(`${status} ticket at max_eval_retries is not dispatched`, () => {
    const backlog = {
      tickets: [{ id: `RL-${status}`, status, title: 'Halted', assignee: 'NONE', fail_count: 3 }]
    };
    const { agentRuntime, events } = runOnce(backlog);
    assert.equal(agentRuntime.started.length, 0, `${status} ticket with fail_count at the limit must not start a run`);
    assert.ok(events.some(e => e.type === 'ticket.retry_limit_skipped'), 'skip should be logged');
  });
}

test('eval ticket whose eval_fail_count reached the limit is not dispatched', () => {
  const backlog = {
    tickets: [{ id: 'RL-EVALCOUNT', status: 'eval', title: 'Halted', assignee: 'claude', fail_count: 0, eval_fail_count: 3 }]
  };
  const { agentRuntime } = runOnce(backlog);
  assert.equal(agentRuntime.started.length, 0);
});

test('test ticket below the limit is still dispatched', () => {
  const backlog = {
    tickets: [{ id: 'RL-OK', status: 'test', title: 'Still has budget', assignee: 'claude', fail_count: 2 }]
  };
  const { agentRuntime } = runOnce(backlog);
  assert.equal(agentRuntime.started.length, 1);
  assert.equal(agentRuntime.started[0].payload.ticketId, 'RL-OK');
});

test('a ticket that never failed is dispatched even when the limit is 0', () => {
  const backlog = {
    tickets: [{ id: 'RL-ZERO', status: 'eval', title: 'Fresh', assignee: 'claude', fail_count: 0 }]
  };
  const { agentRuntime } = runOnce(backlog, { readMaxEvalRetries: () => 0 });
  assert.equal(agentRuntime.started.length, 1);
});

test('hard cap still applies when no max_eval_retries reader is provided', () => {
  const backlog = {
    tickets: [{ id: 'RL-HARD', status: 'test', title: 'Runaway', assignee: 'claude', fail_count: 10 }]
  };
  const { agentRuntime } = runOnce(backlog, { readMaxEvalRetries: null });
  assert.equal(agentRuntime.started.length, 0);
});

test('todo ticket with assignee NONE is not dispatched when no implementation default agent is set', () => {
  const backlog = {
    tickets: [{ id: 'RL-NONE', status: 'todo', title: 'Unassigned', assignee: 'NONE', fail_count: 0 }]
  };
  const { agentRuntime } = runOnce(backlog, { readStageAssignee: () => null });
  assert.equal(agentRuntime.started.length, 0);
  assert.equal(backlog.tickets[0].status, 'todo');
});

test('the retry-limit skip is logged once per ticket, not once per poll', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const events = [];
  const backlog = {
    tickets: [{ id: 'RL-LOGONCE', status: 'eval', title: 'Halted', assignee: 'NONE', fail_count: 3 }]
  };
  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    writeBacklogData: () => {},
    logEvent: (type) => events.push(type)
  });
  scheduler.start();
  scheduler.dispatch({ reason: 'test' });
  scheduler.dispatch({ reason: 'test' });
  scheduler.stop();
  assert.equal(agentRuntime.started.length, 0);
  assert.equal(events.filter(t => t === 'ticket.retry_limit_skipped').length, 1);
});
