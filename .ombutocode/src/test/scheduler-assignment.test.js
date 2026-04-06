const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { createScheduler: createSchedulerBase, parseProviderPauseFromRun } = require('../src/main/scheduler');

function createTempProjectRoot() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ombutocode-scheduler-test-'));
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
  fs.writeFileSync(path.join(projectRoot, 'README.md'), '# scheduler test\n', 'utf-8');
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

function withMockedNow(nowMs, fn) {
  const originalNow = Date.now;
  Date.now = () => nowMs;
  try {
    return fn();
  } finally {
    Date.now = originalNow;
  }
}

function getZonedParts(timestampMs, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(new Date(timestampMs));
  const result = {};
  for (const part of parts) {
    if (part.type === 'year') result.year = Number(part.value);
    if (part.type === 'month') result.month = Number(part.value);
    if (part.type === 'day') result.day = Number(part.value);
    if (part.type === 'hour') result.hour = Number(part.value);
    if (part.type === 'minute') result.minute = Number(part.value);
  }
  return result;
}

function addDaysToYmd(year, month, day, daysToAdd) {
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + daysToAdd);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function findUtcForZonedDateTime(target, timeZone) {
  const naiveUtcMs = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, 0, 0);
  const start = naiveUtcMs - (14 * 60 * 60 * 1000);
  const end = naiveUtcMs + (14 * 60 * 60 * 1000);

  for (let cursor = start; cursor <= end; cursor += 60000) {
    const zoned = getZonedParts(cursor, timeZone);
    if (
      zoned.year === target.year &&
      zoned.month === target.month &&
      zoned.day === target.day &&
      zoned.hour === target.hour &&
      zoned.minute === target.minute
    ) {
      return new Date(cursor);
    }
  }

  throw new Error(`Could not resolve zoned time ${JSON.stringify(target)} for ${timeZone}`);
}

test('scheduler skips unassigned todo tickets', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      { id: 'AGENT_MGMT-UNASSIGNED', status: 'todo', title: 'Unassigned' }
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

  assert.equal(agentRuntime.started.length, 0);
});

test('scheduler prepares ticket worktree before spawning agent', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      { id: 'GIT_WT-002-WORKTREE', status: 'todo', title: 'Worktree prep', assignee: 'codex' }
    ]
  };
  const preparedCalls = [];
  const worktreePath = path.join(projectRoot, '..', 'ombutocode-scheduler-worktrees', 'GIT_WT-002-WORKTREE');

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    createTicketWorktree(ticketId, options = {}) {
      preparedCalls.push({ ticketId, options });
      return {
        worktreePath
      };
    },
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

  assert.equal(preparedCalls.length, 1);
  assert.deepEqual(preparedCalls[0], {
    ticketId: 'GIT_WT-002-WORKTREE',
    options: { projectRoot }
  });
  assert.equal(agentRuntime.started.length, 1);
  assert.equal(
    agentRuntime.started[0].options.workingDirectory,
    path.resolve(worktreePath)
  );
});

test('scheduler skips agent spawn when worktree preparation fails', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      { id: 'GIT_WT-002-WORKTREE-FAIL', status: 'todo', title: 'Worktree failure', assignee: 'codex' }
    ]
  };
  let prepareCount = 0;

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    createTicketWorktree() {
      prepareCount += 1;
      throw new Error('simulated worktree error');
    },
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

  assert.equal(prepareCount, 1);
  assert.equal(agentRuntime.started.length, 0);
});

test('scheduler picks eval tickets via default eval agent', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      {
        id: 'EVAL_WORKFLOW-EVAL-DEFAULT',
        status: 'eval',
        title: 'Needs evaluator',
        assignee: 'codex'
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
          id: 'codex',
          name: 'Codex',
          enabled: true,
          models: [{ id: 'gpt-5', enabled: true, rate_per_hour: 5 }]
        },
        {
          id: 'kimi',
          name: 'Kimi',
          enabled: true,
          models: [{ id: 'k2', enabled: true, rate_per_hour: 5 }]
        }
      ]
    })
  });

  const beforeStart = scheduler.getStatus();
  assert.equal(beforeStart.queue.readyCount, 1);
  assert.equal(beforeStart.queue.nextTickets[0].id, 'EVAL_WORKFLOW-EVAL-DEFAULT');
  assert.equal(beforeStart.queue.nextTickets[0].status, 'eval');
  assert.equal(beforeStart.queue.nextTickets[0].assignee, 'kimi');

  scheduler.start();
  scheduler.stop();

  assert.equal(agentRuntime.started.length, 1);
  assert.equal(agentRuntime.started[0].payload.ticketId, 'EVAL_WORKFLOW-EVAL-DEFAULT');
  assert.equal(agentRuntime.started[0].agentName, 'kimi');
});

test('scheduler prepares and cleans up eval trial merge for eval runs', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub({ trackActiveRuns: true });
  const backlog = {
    tickets: [
      {
        id: 'GIT_WT-004-EVAL-CLEANUP',
        status: 'eval',
        title: 'Eval cleanup',
        assignee: 'codex'
      }
    ]
  };

  const trialMergeCalls = [];
  const cleanupCalls = [];
  const evalWorktreePath = path.join(projectRoot, '..', 'eval-worktree', 'GIT_WT-004-EVAL-CLEANUP');

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    createEvalTrialMerge(ticketId, options = {}) {
      trialMergeCalls.push({ ticketId, options });
      return {
        branch: `eval/${ticketId}`,
        worktreePath: evalWorktreePath
      };
    },
    cleanupEvalTrial(ticketId, options = {}) {
      cleanupCalls.push({ ticketId, options });
      return { removedWorktree: true, removedBranch: true };
    },
    readBacklogData: () => backlog,
    readEvalDefaultAgent: () => 'codex',
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

  assert.equal(trialMergeCalls.length, 1);
  assert.deepEqual(trialMergeCalls[0], {
    ticketId: 'GIT_WT-004-EVAL-CLEANUP',
    options: { projectRoot }
  });
  assert.equal(agentRuntime.started.length, 1);
  assert.equal(
    agentRuntime.started[0].options.workingDirectory,
    path.resolve(evalWorktreePath)
  );

  scheduler.onRunFinished({
    runId: 'run-1',
    ticketId: 'GIT_WT-004-EVAL-CLEANUP',
    agentName: 'codex',
    state: 'completed',
    exitCode: 0
  });
  assert.equal(cleanupCalls.length, 1);
  assert.deepEqual(cleanupCalls[0], {
    ticketId: 'GIT_WT-004-EVAL-CLEANUP',
    options: { projectRoot }
  });
});

test('scheduler skips eval run and reports failure when trial merge preparation fails', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      {
        id: 'GIT_WT-004-EVAL-CONFLICT',
        status: 'eval',
        title: 'Eval conflict',
        assignee: 'codex'
      }
    ]
  };
  const failures = [];

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    createEvalTrialMerge() {
      const error = new Error('simulated merge conflict');
      error.details = { conflict: true, stderr: 'CONFLICT (content): merge conflict in README.md' };
      throw error;
    },
    rebaseOnConflict: null,
    onEvalPreparationFailed(payload) {
      failures.push(payload);
    },
    readBacklogData: () => backlog,
    readEvalDefaultAgent: () => 'codex',
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

  assert.equal(agentRuntime.started.length, 0);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].ticketId, 'GIT_WT-004-EVAL-CONFLICT');
  assert.equal(failures[0].error?.details?.conflict, true);
});

test('scheduler blocks pickup when dependencies are not in review/done', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      { id: 'AD_HOC-DEP-BASE', status: 'todo', title: 'Dependency', assignee: 'codex' },
      {
        id: 'AD_HOC-DEP-BLOCKED',
        status: 'todo',
        title: 'Blocked by dependency',
        assignee: 'codex',
        dependencies: ['AD_HOC-DEP-BASE']
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

  assert.equal(agentRuntime.started.length, 1);
  assert.equal(agentRuntime.started[0].payload.ticketId, 'AD_HOC-DEP-BASE');

  const status = scheduler.getStatus();
  assert.equal(status.queue.readyCount, 1);
  assert.equal(status.queue.nextTickets[0].id, 'AD_HOC-DEP-BASE');
});

test('scheduler dispatches dependency-blocked ticket once dependency reaches review', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub({ trackActiveRuns: true });
  const backlog = {
    tickets: [
      { id: 'AD_HOC-DEP-READY', status: 'todo', title: 'Dependency ticket', assignee: 'codex' },
      {
        id: 'AD_HOC-DEP-WAITING',
        status: 'todo',
        title: 'Waiting ticket',
        assignee: 'codex',
        dependencies: ['AD_HOC-DEP-READY']
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
          max_concurrent: 1,
          models: [{ id: 'gpt-5', enabled: true, rate_per_hour: 5 }]
        }
      ]
    })
  });

  scheduler.start();

  assert.equal(agentRuntime.started.length, 1);
  assert.equal(agentRuntime.started[0].payload.ticketId, 'AD_HOC-DEP-READY');

  agentRuntime.finishRun('run-1', 'completed');
  backlog.tickets[0].status = 'review';
  scheduler.onRunFinished({
    runId: 'run-1',
    agentName: 'codex',
    state: 'completed',
    exitCode: 0
  });

  assert.equal(agentRuntime.started.length, 2);
  assert.equal(agentRuntime.started[1].payload.ticketId, 'AD_HOC-DEP-WAITING');

  scheduler.stop();
});

test('scheduler allows a single active eval assignment at a time', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub({ trackActiveRuns: true });
  const backlog = {
    tickets: [
      { id: 'EVAL_WORKFLOW-QUEUE-001', status: 'eval', title: 'Eval 1' },
      { id: 'EVAL_WORKFLOW-QUEUE-002', status: 'eval', title: 'Eval 2' }
    ]
  };

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    readEvalDefaultAgent: () => 'codex',
    readAgentsConfig: () => ({
      tools: [
        {
          id: 'codex',
          name: 'Codex',
          enabled: true,
          max_concurrent: 2,
          models: [{ id: 'gpt-5', enabled: true, rate_per_hour: 5 }]
        }
      ]
    })
  });

  scheduler.start();

  assert.equal(agentRuntime.started.length, 1);
  assert.equal(agentRuntime.started[0].payload.ticketId, 'EVAL_WORKFLOW-QUEUE-001');

  const afterFirstTick = scheduler.getStatus();
  assert.equal(afterFirstTick.queue.readyCount, 1);

  agentRuntime.finishRun('run-1', 'completed');
  backlog.tickets[0].status = 'review';
  scheduler.onRunFinished({
    runId: 'run-1',
    agentName: 'codex',
    state: 'completed',
    exitCode: 0
  });

  assert.equal(agentRuntime.started.length, 2);
  assert.equal(agentRuntime.started[1].payload.ticketId, 'EVAL_WORKFLOW-QUEUE-002');

  scheduler.stop();
});

test('scheduler ignores tool cooldown for eval queue handoff', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub({ trackActiveRuns: true });
  const backlog = {
    tickets: [
      { id: 'EVAL_WORKFLOW-COOLDOWN-001', status: 'eval', title: 'Eval 1' },
      { id: 'EVAL_WORKFLOW-COOLDOWN-002', status: 'eval', title: 'Eval 2' }
    ]
  };

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    readEvalDefaultAgent: () => 'codex',
    readAgentsConfig: () => ({
      tools: [
        {
          id: 'codex',
          name: 'Codex',
          enabled: true,
          max_concurrent: 1,
          cooldown_minutes: 60,
          models: [{ id: 'gpt-5', enabled: true, rate_per_hour: 5 }]
        }
      ]
    })
  });

  scheduler.start();

  assert.equal(agentRuntime.started.length, 1);
  assert.equal(agentRuntime.started[0].payload.ticketId, 'EVAL_WORKFLOW-COOLDOWN-001');

  agentRuntime.finishRun('run-1', 'completed');
  backlog.tickets[0].status = 'review';
  scheduler.onRunFinished({
    runId: 'run-1',
    agentName: 'codex',
    state: 'completed',
    exitCode: 0
  });

  assert.equal(agentRuntime.started.length, 2);
  assert.equal(agentRuntime.started[1].payload.ticketId, 'EVAL_WORKFLOW-COOLDOWN-002');

  scheduler.stop();
});

test('scheduler ignores model rate_per_hour limits for queue handoff', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub({ trackActiveRuns: true });
  const backlog = {
    tickets: [
      { id: 'RATE_LIMIT-IGNORE-001', status: 'todo', title: 'First', assignee: 'codex' },
      { id: 'RATE_LIMIT-IGNORE-002', status: 'todo', title: 'Second', assignee: 'codex' }
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
          max_concurrent: 1,
          models: [{ id: 'gpt-5', enabled: true, rate_per_hour: 1 }]
        }
      ]
    })
  });

  scheduler.start();

  assert.equal(agentRuntime.started.length, 1);
  assert.equal(agentRuntime.started[0].payload.ticketId, 'RATE_LIMIT-IGNORE-001');

  agentRuntime.finishRun('run-1', 'completed');
  backlog.tickets[0].status = 'review';
  scheduler.onRunFinished({
    runId: 'run-1',
    agentName: 'codex',
    state: 'completed',
    exitCode: 0
  });

  assert.equal(agentRuntime.started.length, 2);
  assert.equal(agentRuntime.started[1].payload.ticketId, 'RATE_LIMIT-IGNORE-002');

  scheduler.stop();
});

test('scheduler does not start additional eval assignment while eval slot is occupied', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub({ trackActiveRuns: true });
  const backlog = {
    tickets: [
      { id: 'EVAL_WORKFLOW-QUEUED-001', status: 'eval', title: 'Eval 1' },
      { id: 'EVAL_WORKFLOW-QUEUED-002', status: 'eval', title: 'Eval 2' }
    ]
  };

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    readEvalDefaultAgent: () => 'codex',
    readAgentsConfig: () => ({
      tools: [
        {
          id: 'codex',
          name: 'Codex',
          enabled: true,
          max_concurrent: 3,
          models: [{ id: 'gpt-5', enabled: true, rate_per_hour: 5 }]
        }
      ]
    })
  });

  scheduler.start();
  scheduler.stop();

  assert.equal(agentRuntime.started.length, 1);
  assert.equal(agentRuntime.started[0].payload.ticketId, 'EVAL_WORKFLOW-QUEUED-001');

  scheduler.start();
  scheduler.stop();

  assert.equal(agentRuntime.started.length, 1);
});

test('scheduler allows one eval in addition to max_concurrent implementation slots', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub({ trackActiveRuns: true });
  const backlog = {
    tickets: [
      { id: 'EVAL_WORKFLOW-SPLIT-IMPL', status: 'todo', title: 'Implementation', assignee: 'codex' },
      { id: 'EVAL_WORKFLOW-SPLIT-EVAL', status: 'eval', title: 'Evaluation' }
    ]
  };

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    readEvalDefaultAgent: () => 'codex',
    readAgentsConfig: () => ({
      tools: [
        {
          id: 'codex',
          name: 'Codex',
          enabled: true,
          max_concurrent: 1,
          models: [{ id: 'gpt-5', enabled: true, rate_per_hour: 5 }]
        }
      ]
    })
  });

  scheduler.start();
  scheduler.stop();

  assert.equal(agentRuntime.started.length, 2);
  assert.deepEqual(
    agentRuntime.started.map((entry) => entry.payload.ticketId),
    ['EVAL_WORKFLOW-SPLIT-IMPL', 'EVAL_WORKFLOW-SPLIT-EVAL']
  );
});

test('scheduler only allows configured default eval agent to pick eval tickets', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      {
        id: 'EVAL_WORKFLOW-EVAL-STRICT-001',
        status: 'eval',
        title: 'Eval should route to default',
        evaluator_assignee: 'claude'
      }
    ]
  };

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    readEvalDefaultAgent: () => 'codex',
    readAgentsConfig: () => ({
      tools: [
        {
          id: 'codex',
          name: 'Codex',
          enabled: true,
          max_concurrent: 2,
          models: [{ id: 'gpt-5', enabled: true, rate_per_hour: 5 }]
        },
        {
          id: 'claude',
          name: 'Claude',
          enabled: true,
          max_concurrent: 2,
          models: [{ id: 'sonnet', enabled: true, rate_per_hour: 5 }]
        }
      ]
    })
  });

  const statusBeforeStart = scheduler.getStatus();
  assert.equal(statusBeforeStart.queue.readyCount, 1);
  assert.equal(statusBeforeStart.queue.nextTickets[0].assignee, 'codex');

  scheduler.start();
  scheduler.stop();

  assert.equal(agentRuntime.started.length, 1);
  assert.equal(agentRuntime.started[0].agentName, 'codex');
  assert.equal(agentRuntime.started[0].payload.ticketId, 'EVAL_WORKFLOW-EVAL-STRICT-001');
});

test('scheduler status distinguishes implementation and evaluation queues for active runs', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub({ trackActiveRuns: true });
  const backlog = {
    tickets: [
      { id: 'EVAL_WORKFLOW-STATUS-IMPL-ACTIVE', status: 'todo', title: 'Implementation active', assignee: 'codex' },
      { id: 'EVAL_WORKFLOW-STATUS-EVAL-ACTIVE', status: 'eval', title: 'Evaluation active' },
      { id: 'EVAL_WORKFLOW-STATUS-IMPL-READY', status: 'todo', title: 'Implementation ready', assignee: 'claude' },
      { id: 'EVAL_WORKFLOW-STATUS-EVAL-READY', status: 'eval', title: 'Evaluation ready', evaluator_assignee: 'claude' }
    ]
  };

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    readEvalDefaultAgent: () => 'codex',
    readAgentsConfig: () => ({
      tools: [
        {
          id: 'codex',
          name: 'Codex',
          enabled: true,
          max_concurrent: 1,
          models: [{ id: 'gpt-5', enabled: true, rate_per_hour: 5 }]
        },
        {
          id: 'claude',
          name: 'Claude',
          enabled: false,
          max_concurrent: 1,
          models: [{ id: 'sonnet', enabled: true, rate_per_hour: 5 }]
        }
      ]
    })
  });

  scheduler.start();
  scheduler.stop();

  assert.equal(agentRuntime.started.length, 2);
  assert.deepEqual(
    agentRuntime.started.map((entry) => entry.payload.ticketId),
    ['EVAL_WORKFLOW-STATUS-IMPL-ACTIVE', 'EVAL_WORKFLOW-STATUS-EVAL-ACTIVE']
  );

  const status = scheduler.getStatus();
  assert.deepEqual(status.activeRunCounts, {
    implementation: 1,
    evaluation: 1,
    merging: 0,
    unknown: 0
  });
  assert.equal(status.queue.totalTodo, 2);
  assert.equal(status.queue.totalQueued, 4);
  assert.equal(status.queue.totalImplementation, 2);
  assert.equal(status.queue.totalEvaluation, 2);
  assert.equal(status.queue.readyCount, 2);
  assert.equal(status.queue.readyImplementationCount, 1);
  assert.equal(status.queue.readyEvaluationCount, 1);

  const queueStatusByTicketId = new Map(
    status.activeRuns.map((run) => [run.ticketId, run.queueStatus])
  );
  assert.equal(queueStatusByTicketId.get('EVAL_WORKFLOW-STATUS-IMPL-ACTIVE'), 'todo');
  assert.equal(queueStatusByTicketId.get('EVAL_WORKFLOW-STATUS-EVAL-ACTIVE'), 'eval');

  const branchByTicketId = new Map(
    status.activeRuns.map((run) => [run.ticketId, run.branch])
  );
  assert.equal(branchByTicketId.get('EVAL_WORKFLOW-STATUS-IMPL-ACTIVE'), 'ticket/EVAL_WORKFLOW-STATUS-IMPL-ACTIVE');
  assert.equal(branchByTicketId.get('EVAL_WORKFLOW-STATUS-EVAL-ACTIVE'), 'eval/EVAL_WORKFLOW-STATUS-EVAL-ACTIVE');
});

test('scheduler picks explicitly assigned tickets and queue readiness excludes unassigned todo', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      { id: 'AGENT_MGMT-UNASSIGNED', status: 'todo', title: 'Unassigned' },
      { id: 'AGENT_MGMT-ASSIGNED-STRING', status: 'todo', title: 'Assigned String', assignee: 'codex' },
      {
        id: 'AGENT_MGMT-ASSIGNED-OBJECT',
        status: 'todo',
        title: 'Assigned Object',
        assignee: { tool: 'claude', model: 'sonnet' }
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
        },
        {
          id: 'claude',
          name: 'Claude',
          enabled: true,
          models: [{ id: 'sonnet', enabled: true, rate_per_hour: 5 }]
        }
      ]
    })
  });

  scheduler.start();
  scheduler.stop();

  assert.equal(agentRuntime.started.length, 2);
  assert.deepEqual(
    agentRuntime.started.map((entry) => entry.payload.ticketId),
    ['AGENT_MGMT-ASSIGNED-STRING', 'AGENT_MGMT-ASSIGNED-OBJECT']
  );
  assert.deepEqual(
    agentRuntime.started.map((entry) => entry.agentName),
    ['codex', 'claude']
  );

  const status = scheduler.getStatus();
  assert.equal(status.queue.totalTodo, 3);
  assert.equal(status.queue.readyCount, 2);
  assert.deepEqual(
    status.queue.nextTickets.map((ticket) => ticket.id),
    ['AGENT_MGMT-ASSIGNED-STRING', 'AGENT_MGMT-ASSIGNED-OBJECT']
  );
  assert.ok(typeof status.queue.nextTickets[0].estimatedPickupAt === 'string');
});

test('scheduler records model cost on completed run without budget pause gating', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub({ trackActiveRuns: true });
  const backlog = {
    tickets: [
      { id: 'AGENT_MGMT-COST-001', status: 'todo', title: 'Cost Test', assignee: 'claude' }
    ]
  };

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    readAgentsConfig: () => ({
      tools: [
        {
          id: 'claude',
          name: 'Claude',
          enabled: true,
          budget_limit: 0.5,
          models: [{ id: 'opus', enabled: true, rate_per_hour: 5, cost_per_run: 0.5 }]
        }
      ]
    })
  });

  scheduler.start();
  scheduler.stop();
  assert.equal(agentRuntime.started.length, 1);

  agentRuntime.finishRun('run-1', 'completed');
  scheduler.onRunFinished({
    runId: 'run-1',
    agentName: 'claude',
    state: 'completed',
    exitCode: 0
  });

  const afterCost = scheduler.windowTracker.loadState();
  assert.equal(afterCost.windows.claude.total_cost, 0.5);

  scheduler.start();
  scheduler.stop();
  assert.equal(agentRuntime.started.length, 2);
});

test('scheduler dispatch picks ticket immediately after status enters todo', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      { id: 'EVAL_WORKFLOW-EVENT-STATUS', status: 'backlog', title: 'Wait for queue', assignee: 'codex' }
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
  assert.equal(agentRuntime.started.length, 0);

  backlog.tickets[0].status = 'todo';
  const result = scheduler.dispatch({ reason: 'ticket-status-transition' });
  assert.equal(result.accepted, true);
  assert.equal(agentRuntime.started.length, 1);
  assert.equal(agentRuntime.started[0].payload.ticketId, 'EVAL_WORKFLOW-EVENT-STATUS');

  scheduler.stop();
});

test('scheduler dispatch picks ticket after assignment change while running', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      { id: 'EVAL_WORKFLOW-EVENT-ASSIGN', status: 'todo', title: 'Assign me later' }
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
  assert.equal(agentRuntime.started.length, 0);

  backlog.tickets[0].assignee = 'codex';
  const result = scheduler.dispatch({ reason: 'ticket-assignment-change' });
  assert.equal(result.accepted, true);
  assert.equal(agentRuntime.started.length, 1);
  assert.equal(agentRuntime.started[0].payload.ticketId, 'EVAL_WORKFLOW-EVENT-ASSIGN');

  scheduler.stop();
});

test('scheduler ignores dispatch events while stopped', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const backlog = {
    tickets: [
      { id: 'EVAL_WORKFLOW-EVENT-STOPPED', status: 'todo', title: 'Should not run', assignee: 'codex' }
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

  const result = scheduler.dispatch({ reason: 'ticket-status-transition' });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'stopped');
  assert.equal(agentRuntime.started.length, 0);
});

test('scheduler parses provider rate-limit failure and pauses tool until expiry', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub({ trackActiveRuns: true });
  const backlog = {
    tickets: [
      { id: 'AD_HOC-021-PAUSE-001', status: 'todo', title: 'First', assignee: 'codex' },
      { id: 'AD_HOC-021-PAUSE-002', status: 'todo', title: 'Second', assignee: 'codex' }
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
          max_concurrent: 1,
          models: [{ id: 'gpt-5', enabled: true, rate_per_hour: 5 }]
        }
      ]
    })
  });

  scheduler.start();
  assert.equal(agentRuntime.started.length, 1);
  assert.equal(agentRuntime.started[0].payload.ticketId, 'AD_HOC-021-PAUSE-001');

  // Mirror runtime status transition while run-1 is in flight.
  backlog.tickets[0].status = 'in_progress';
  agentRuntime.finishRun('run-1', 'failed');

  const pauseUntil = new Date(Date.now() + 5 * 60000).toISOString();
  scheduler.onRunFinished({
    runId: 'run-1',
    agentName: 'codex',
    ticketId: 'AD_HOC-021-PAUSE-001',
    state: 'failed',
    exitCode: 1,
    error: `HTTP 429 rate limit exceeded reset_at=${pauseUntil}`,
    stderr: `Provider response: {"error":{"type":"rate_limit","reset_at":"${pauseUntil}"}}`
  });

  // Still paused, so second ticket should not start.
  assert.equal(agentRuntime.started.length, 1);

  const windowState = scheduler.windowTracker.loadState();
  assert.equal(windowState.windows.codex.paused, true);
  assert.equal(windowState.windows.codex.pause_until, pauseUntil);
  assert.match(windowState.windows.codex.pause_reason || '', /Provider rate limit/i);

  const status = scheduler.getStatus();
  assert.equal(status.status, 'paused');
  assert.ok(Array.isArray(status.agentPauses));
  assert.equal(status.agentPauses.length, 1);
  assert.equal(status.agentPauses[0].toolId, 'codex');
  assert.equal(status.agentPauses[0].pauseUntil, pauseUntil);
  assert.ok(Number(status.agentPauses[0].pauseRemainingMs) > 0);

  scheduler.stop();
});

test('scheduler auto-resumes paused tool after provider expiry and picks next ticket', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub({ trackActiveRuns: true });
  const backlog = {
    tickets: [
      { id: 'AD_HOC-021-RESUME-001', status: 'todo', title: 'First', assignee: 'codex' },
      { id: 'AD_HOC-021-RESUME-002', status: 'todo', title: 'Second', assignee: 'codex' }
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
          max_concurrent: 1,
          models: [{ id: 'gpt-5', enabled: true, rate_per_hour: 5 }]
        }
      ]
    })
  });

  scheduler.start();
  assert.equal(agentRuntime.started.length, 1);

  backlog.tickets[0].status = 'in_progress';
  agentRuntime.finishRun('run-1', 'failed');

  const futurePauseUntil = new Date(Date.now() + 10 * 60000).toISOString();
  scheduler.onRunFinished({
    runId: 'run-1',
    agentName: 'codex',
    ticketId: 'AD_HOC-021-RESUME-001',
    state: 'failed',
    exitCode: 1,
    stderr: `rate limit hit; retry_after=600; reset_at=${futurePauseUntil}`
  });

  assert.equal(agentRuntime.started.length, 1);

  // Force expiry in persisted state and dispatch again.
  const state = scheduler.windowTracker.loadState();
  state.windows.codex.pause_until = '2000-01-01T00:00:00.000Z';
  scheduler.windowTracker.saveState(state);

  const dispatchResult = scheduler.dispatch({ reason: 'manual-after-expiry' });
  assert.equal(dispatchResult.accepted, true);
  assert.equal(agentRuntime.started.length, 2);
  assert.equal(agentRuntime.started[1].payload.ticketId, 'AD_HOC-021-RESUME-002');

  const refreshedState = scheduler.windowTracker.loadState();
  assert.equal(refreshedState.windows.codex.paused, false);
  assert.equal(refreshedState.windows.codex.pause_until, null);
  assert.equal(refreshedState.windows.codex.pause_reason, null);

  scheduler.stop();
});

test('parseProviderPauseFromRun reads limit expiry from stderr/stdout/error structures', () => {
  const pauseA = parseProviderPauseFromRun({
    error: 'HTTP 429 Too many requests. reset_at=2099-01-01T00:00:00Z'
  });
  assert.ok(pauseA);
  assert.equal(pauseA.pauseUntil, '2099-01-01T00:00:00.000Z');

  const pauseB = parseProviderPauseFromRun({
    stderr: JSON.stringify({
      error: {
        type: 'session_limit',
        expires_at: '2099-01-01T01:00:00Z'
      }
    })
  });
  assert.ok(pauseB);
  assert.equal(pauseB.pauseUntil, '2099-01-01T01:00:00.000Z');

  const pauseC = parseProviderPauseFromRun({
    stdout: 'rate limit reached, retry after 120 seconds'
  });
  assert.ok(pauseC);
  assert.match(pauseC.reason, /Provider rate limit until/);

  const noPause = parseProviderPauseFromRun({
    stderr: 'Provider failed for unrelated validation error'
  });
  assert.equal(noPause, null);
});

test('parseProviderPauseFromRun matches human-readable rate-limit phrases', () => {
  const pauseCodex = parseProviderPauseFromRun({
    error: "You're out of Codex messages. Your rate limit resets on 10:11 PM."
  });
  assert.ok(pauseCodex);
  assert.match(pauseCodex.reason, /rate limit until/i);

  const pauseClaude = parseProviderPauseFromRun({
    stderr: "You've hit your limit · resets 10pm"
  });
  assert.ok(pauseClaude);
  assert.match(pauseClaude.reason, /rate limit until/i);

  const pauseUsage = parseProviderPauseFromRun({
    stdout: 'usage limit exceeded'
  });
  assert.ok(pauseUsage);
  assert.match(pauseUsage.reason, /rate limit detected/i);

  const pauseMessageLimit = parseProviderPauseFromRun({
    error: 'message limit reached'
  });
  assert.ok(pauseMessageLimit);
  assert.match(pauseMessageLimit.reason, /rate limit detected/i);
});

test('parseProviderPauseFromRun applies fallback cooldown when no reset time found', () => {
  const pauseNoTime = parseProviderPauseFromRun({
    error: "You've hit your limit"
  }, {
    rate_limit_cooldown_minutes: 90
  });
  assert.ok(pauseNoTime);
  assert.match(pauseNoTime.reason, /no reset time found, cooling down for 90 minutes/);

  const pauseDefault = parseProviderPauseFromRun({
    error: "Usage limit exceeded"
  }, {});
  assert.ok(pauseDefault);
  assert.match(pauseDefault.reason, /cooling down for 60 minutes/);

  const pauseZeroCooldown = parseProviderPauseFromRun({
    error: "hit limit"
  }, {
    rate_limit_cooldown_minutes: 0
  });
  assert.equal(pauseZeroCooldown, null);
});

test('parseProviderPauseFromRun parses "resets on 10:11 PM" in local timezone', () => {
  const nowMs = new Date(2026, 1, 17, 20, 0, 0, 0).getTime();
  const pause = withMockedNow(nowMs, () => parseProviderPauseFromRun(
    { error: "You're out of Codex messages. Your rate limit resets on 10:11 PM." },
    { rate_limit_cooldown_minutes: 0 }
  ));

  assert.ok(pause);
  const now = new Date(nowMs);
  const expected = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    22,
    11,
    0,
    0
  );
  assert.equal(pause.pauseUntil, expected.toISOString());
});

test('parseProviderPauseFromRun parses "resets 10pm (Australia/Sydney)" using provided timezone', () => {
  const nowMs = Date.UTC(2026, 1, 17, 8, 0, 0, 0);
  const timeZone = 'Australia/Sydney';
  const pause = withMockedNow(nowMs, () => parseProviderPauseFromRun(
    { stderr: "You've hit your limit · resets 10pm (Australia/Sydney)" },
    { rate_limit_cooldown_minutes: 0 }
  ));

  assert.ok(pause);
  const nowParts = getZonedParts(nowMs, timeZone);
  let targetYmd = { year: nowParts.year, month: nowParts.month, day: nowParts.day };
  const todayAtTenPm = findUtcForZonedDateTime({ ...targetYmd, hour: 22, minute: 0 }, timeZone);
  if (todayAtTenPm.getTime() <= nowMs) {
    targetYmd = addDaysToYmd(targetYmd.year, targetYmd.month, targetYmd.day, 1);
  }
  const expected = findUtcForZonedDateTime({ ...targetYmd, hour: 22, minute: 0 }, timeZone);
  assert.equal(pause.pauseUntil, expected.toISOString());
});

test('parseProviderPauseFromRun rolls "resets 10pm" to tomorrow when local time is already past 10pm', () => {
  const nowMs = new Date(2026, 1, 17, 23, 0, 0, 0).getTime();
  const pause = withMockedNow(nowMs, () => parseProviderPauseFromRun(
    { stderr: "You've hit your limit · resets 10pm" },
    { rate_limit_cooldown_minutes: 0 }
  ));

  assert.ok(pause);
  const now = new Date(nowMs);
  const expected = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    22,
    0,
    0,
    0
  );
  assert.equal(pause.pauseUntil, expected.toISOString());
});

test('parseProviderPauseFromRun parses 24h reset times like "resets 22:11"', () => {
  const nowMs = new Date(2026, 1, 17, 20, 0, 0, 0).getTime();
  const pause = withMockedNow(nowMs, () => parseProviderPauseFromRun(
    { stderr: 'rate limit hit; resets 22:11' },
    { rate_limit_cooldown_minutes: 0 }
  ));

  assert.ok(pause);
  const now = new Date(nowMs);
  const expected = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    22,
    11,
    0,
    0
  );
  assert.equal(pause.pauseUntil, expected.toISOString());
});

test('parseProviderPauseFromRun falls back to local timezone when reset timezone is invalid', () => {
  const nowMs = new Date(2026, 1, 17, 20, 0, 0, 0).getTime();
  const pause = withMockedNow(nowMs, () => parseProviderPauseFromRun(
    { stderr: "You've hit your limit · resets 10pm (Not/A_Real_Zone)" },
    { rate_limit_cooldown_minutes: 0 }
  ));

  assert.ok(pause);
  const now = new Date(nowMs);
  const expected = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    22,
    0,
    0,
    0
  );
  assert.equal(pause.pauseUntil, expected.toISOString());
});
