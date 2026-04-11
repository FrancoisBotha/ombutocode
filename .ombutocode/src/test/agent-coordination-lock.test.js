const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { createScheduler: createSchedulerBase } = require('../src/main/scheduler');
const { AgentInvocationError, AgentRuntime } = require('../src/main/codingAgentRuntime');

function createTempProjectRoot() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ombutocode-coordination-test-'));
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
  fs.writeFileSync(path.join(projectRoot, 'README.md'), '# coordination test\n', 'utf-8');
  runGit(['add', 'README.md']);
  runGit(['commit', '-m', 'initial commit']);

  return projectRoot;
}

function buildAgentRuntimeStub({ trackActiveRuns = false } = {}) {
  let runCounter = 0;
  const runtime = {
    activeRunByTicket: new Map(),
    runsById: new Map(),
    started: [],
    getRunStatus(query = {}) {
      if (!trackActiveRuns) return null;
      const ticketId = query?.ticketId;
      const runId = this.activeRunByTicket.get(ticketId);
      if (!runId) return null;
      const run = this.runsById.get(runId);
      return run ? { ...run } : null;
    },
    startAgent(agentName, payload, options = {}) {
      this.started.push({ agentName, payload, options });
      runCounter += 1;
      const runId = `run-${runCounter}`;

      if (trackActiveRuns) {
        this.activeRunByTicket.set(payload.ticketId, runId);
        this.runsById.set(runId, {
          runId,
          ticketId: payload.ticketId,
          agentName,
          state: 'running'
        });
      }

      return { runId };
    },
    finishRun(runId, state = 'completed') {
      const run = this.runsById.get(runId);
      if (!run) return;
      run.state = state;
      this.activeRunByTicket.delete(run.ticketId);
    }
  };

  if (!trackActiveRuns) {
    runtime.finishRun = () => {};
  }

  return runtime;
}

function createScheduler(deps) {
  const projectRoot = deps.projectRoot;
  return createSchedulerBase({
    createEvalTrialMerge: (ticketId) => ({
      branch: `eval/${ticketId}`,
      worktreePath: path.join(projectRoot, '..', 'ombutocode-eval-worktrees-test', `${ticketId}-eval`)
    }),
    cleanupEvalTrial: () => ({
      removedWorktree: true,
      removedBranch: true
    }),
    ...deps
  });
}

test('scheduler skips ticket with in_progress status (coordination lock)', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      {
        id: 'EVAL-005-IN-PROGRESS',
        status: 'in_progress',
        title: 'Already in progress',
        assignee: 'codex'
      }
    ]
  };

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    readAgentsConfig: () => ({
      tools: [
        {
          id: 'codex',
          name: 'Codex',
          enabled: true,
          models: [{ id: 'gpt-5', enabled: true, rate_per_hour: 5 }]
        }
      ]
    })
  });

  scheduler.start();
  scheduler.stop();

  // Ticket should not be started because status is 'in_progress'
  assert.equal(agentRuntime.started.length, 0);
});

test('scheduler skips ticket with agent.state running (coordination lock)', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      {
        id: 'EVAL-005-AGENT-RUNNING',
        status: 'todo',
        title: 'Agent already running',
        assignee: 'codex',
        agent: {
          name: 'codex',
          run_id: 'existing-run-123',
          state: 'running',
          started_at: '2026-02-19T10:00:00.000Z'
        }
      }
    ]
  };

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    readAgentsConfig: () => ({
      tools: [
        {
          id: 'codex',
          name: 'Codex',
          enabled: true,
          models: [{ id: 'gpt-5', enabled: true, rate_per_hour: 5 }]
        }
      ]
    })
  });

  scheduler.start();
  scheduler.stop();

  // Ticket should not be started because agent.state is 'running'
  assert.equal(agentRuntime.started.length, 0);
});

test('scheduler skips ticket with agent.state queued (coordination lock)', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      {
        id: 'EVAL-005-AGENT-QUEUED',
        status: 'todo',
        title: 'Agent already queued',
        assignee: 'codex',
        agent: {
          name: 'codex',
          run_id: 'existing-run-456',
          state: 'queued',
          started_at: '2026-02-19T10:00:00.000Z'
        }
      }
    ]
  };

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    readAgentsConfig: () => ({
      tools: [
        {
          id: 'codex',
          name: 'Codex',
          enabled: true,
          models: [{ id: 'gpt-5', enabled: true, rate_per_hour: 5 }]
        }
      ]
    })
  });

  scheduler.start();
  scheduler.stop();

  // Ticket should not be started because agent.state is 'queued'
  assert.equal(agentRuntime.started.length, 0);
});

test('scheduler starts ticket when not locked (normal todo status)', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      {
        id: 'EVAL-005-NOT-LOCKED',
        status: 'todo',
        title: 'Normal ticket ready to start',
        assignee: 'codex'
      }
    ]
  };

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    readAgentsConfig: () => ({
      tools: [
        {
          id: 'codex',
          name: 'Codex',
          enabled: true,
          models: [{ id: 'gpt-5', enabled: true, rate_per_hour: 5 }]
        }
      ]
    })
  });

  scheduler.start();
  scheduler.stop();

  // Ticket should be started normally
  assert.equal(agentRuntime.started.length, 1);
  assert.equal(agentRuntime.started[0].payload.ticketId, 'EVAL-005-NOT-LOCKED');
});

test('scheduler starts eval ticket when not locked', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      {
        id: 'EVAL-005-EVAL-NOT-LOCKED',
        status: 'eval',
        title: 'Eval ticket ready',
        assignee: 'kimi'
      }
    ]
  };

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    readEvalDefaultAgent: () => 'kimi',
    readAgentsConfig: () => ({
      tools: [
        {
          id: 'kimi',
          name: 'Kimi',
          enabled: true,
          models: [{ id: 'k2', enabled: true, rate_per_hour: 5 }]
        }
      ]
    })
  });

  scheduler.start();
  scheduler.stop();

  // Eval ticket should be started normally
  assert.equal(agentRuntime.started.length, 1);
  assert.equal(agentRuntime.started[0].payload.ticketId, 'EVAL-005-EVAL-NOT-LOCKED');
});

test('AgentRuntime blocks duplicate active runs for same ticket', async () => {
  const runtime = new AgentRuntime({
    resolveTemplate: () => ({
      command: process.execPath,
      args: ['-e', 'setTimeout(() => process.exit(0), 400)']
    })
  });

  const payload = {
    ticketId: 'EVAL-005-DUPLICATE-TEST',
    epicRef: 'docs/Epics/feature_EVAL_WORKFLOW.md',
    title: 'Duplicate test ticket',
    repoRoot: process.cwd()
  };

  // Start first agent
  const firstRun = runtime.startAgent('kimi', payload);
  assert.equal(firstRun.state, 'running');

  // Try to start second agent for same ticket - should throw
  assert.throws(
    () => runtime.startAgent('kimi', payload),
    (error) => error instanceof AgentInvocationError && error.code === 'RUN_ALREADY_ACTIVE'
  );
});

test('scheduler processes other tickets when one is locked', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      {
        id: 'EVAL-005-LOCKED-001',
        status: 'in_progress',
        title: 'Locked ticket 1',
        assignee: 'codex'
      },
      {
        id: 'EVAL-005-LOCKED-002',
        status: 'todo',
        title: 'Locked ticket 2',
        assignee: 'codex',
        agent: {
          name: 'codex',
          state: 'running',
          run_id: 'existing-run'
        }
      },
      {
        id: 'EVAL-005-UNLOCKED',
        status: 'todo',
        title: 'Unlocked ticket',
        assignee: 'codex'
      }
    ]
  };

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    readAgentsConfig: () => ({
      tools: [
        {
          id: 'codex',
          name: 'Codex',
          enabled: true,
          models: [{ id: 'gpt-5', enabled: true, rate_per_hour: 5 }]
        }
      ]
    })
  });

  scheduler.start();
  scheduler.stop();

  // Only the unlocked ticket should be started
  assert.equal(agentRuntime.started.length, 1);
  assert.equal(agentRuntime.started[0].payload.ticketId, 'EVAL-005-UNLOCKED');
});

test('scheduler allows ticket with completed agent state', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      {
        id: 'EVAL-005-COMPLETED-AGENT',
        status: 'todo',
        title: 'Ticket with completed agent',
        assignee: 'codex',
        agent: {
          name: 'codex',
          run_id: 'completed-run-123',
          state: 'completed',
          started_at: '2026-02-19T10:00:00.000Z',
          finished_at: '2026-02-19T10:05:00.000Z'
        }
      }
    ]
  };

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    readAgentsConfig: () => ({
      tools: [
        {
          id: 'codex',
          name: 'Codex',
          enabled: true,
          models: [{ id: 'gpt-5', enabled: true, rate_per_hour: 5 }]
        }
      ]
    })
  });

  scheduler.start();
  scheduler.stop();

  // Ticket should be started because agent state is 'completed', not 'running' or 'queued'
  assert.equal(agentRuntime.started.length, 1);
  assert.equal(agentRuntime.started[0].payload.ticketId, 'EVAL-005-COMPLETED-AGENT');
});

test('scheduler allows ticket with failed agent state', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      {
        id: 'EVAL-005-FAILED-AGENT',
        status: 'todo',
        title: 'Ticket with failed agent',
        assignee: 'codex',
        agent: {
          name: 'codex',
          run_id: 'failed-run-123',
          state: 'failed',
          started_at: '2026-02-19T10:00:00.000Z',
          finished_at: '2026-02-19T10:01:00.000Z',
          error: 'Previous run failed'
        }
      }
    ]
  };

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    readAgentsConfig: () => ({
      tools: [
        {
          id: 'codex',
          name: 'Codex',
          enabled: true,
          models: [{ id: 'gpt-5', enabled: true, rate_per_hour: 5 }]
        }
      ]
    })
  });

  scheduler.start();
  scheduler.stop();

  // Ticket should be started because agent state is 'failed', not 'running' or 'queued'
  assert.equal(agentRuntime.started.length, 1);
  assert.equal(agentRuntime.started[0].payload.ticketId, 'EVAL-005-FAILED-AGENT');
});
