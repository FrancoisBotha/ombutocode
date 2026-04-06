const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { createScheduler: createSchedulerBase } = require('../src/main/scheduler');

function createTempProjectRoot() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ombutocode-conflict-test-'));
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
  fs.writeFileSync(path.join(projectRoot, 'README.md'), '# conflict test\n', 'utf-8');
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
    createEvalTrialMerge: deps.createEvalTrialMerge || ((ticketId) => ({
      branch: `eval/${ticketId}`,
      worktreePath: path.join(projectRoot, '..', 'eval-worktrees', `${ticketId}-eval`)
    })),
    cleanupEvalTrial: deps.cleanupEvalTrial || (() => ({
      removedWorktree: true,
      removedBranch: true
    })),
    rebaseOnConflict: deps.rebaseOnConflict || (() => ({
      ticketId: 'mock',
      branch: 'ticket/mock',
      baseBranch: 'main',
      rebased: true
    })),
    ...deps
  });
}

const defaultAgentsConfig = {
  tools: [
    {
      id: 'codex',
      name: 'Codex',
      enabled: true,
      models: [{ id: 'gpt-5', enabled: true, rate_per_hour: 5 }]
    }
  ]
};

test('ticket with overlapping files_touched is held when another ticket is active', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub({ trackActiveRuns: true });

  // Ticket A is active (in_progress), touches main_window.py
  // Ticket B is todo and also touches main_window.py — should be held
  const backlog = {
    tickets: [
      {
        id: 'ACTIVE-001',
        status: 'in_progress',
        title: 'Active ticket',
        assignee: 'codex',
        files_touched: ['src/main_window.py', 'src/utils.py']
      },
      {
        id: 'CANDIDATE-001',
        status: 'todo',
        title: 'Candidate ticket',
        assignee: 'codex',
        files_touched: ['src/main_window.py']
      }
    ]
  };

  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));

  try {
    const scheduler = createScheduler({
      projectRoot,
      agentRuntime,
      readBacklogData: () => backlog,
      readAgentsConfig: () => defaultAgentsConfig
    });

    scheduler.start();
    scheduler.stop();
  } finally {
    console.log = originalLog;
  }

  // CANDIDATE-001 should NOT have been started
  assert.equal(agentRuntime.started.length, 0);

  // Should log the hold message
  const holdLog = logs.find(l => l.includes('Holding CANDIDATE-001'));
  assert.ok(holdLog, 'Should log file overlap hold message');
  assert.ok(holdLog.includes('main_window.py'), 'Should mention the conflicting file');
});

test('ticket without file info proceeds normally', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();

  const backlog = {
    tickets: [
      {
        id: 'NO-FILES-001',
        status: 'todo',
        title: 'No files ticket',
        assignee: 'codex'
        // No files_touched, no notes with file paths
      }
    ]
  };

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    readAgentsConfig: () => defaultAgentsConfig
  });

  scheduler.start();
  scheduler.stop();

  assert.equal(agentRuntime.started.length, 1);
  assert.equal(agentRuntime.started[0].payload.ticketId, 'NO-FILES-001');
});

test('no overlap — both tickets dispatched', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub({ trackActiveRuns: true });

  const backlog = {
    tickets: [
      {
        id: 'DISJOINT-A',
        status: 'todo',
        title: 'Ticket A',
        assignee: 'codex',
        files_touched: ['src/pkg_a/module_a.py']
      },
      {
        id: 'DISJOINT-B',
        status: 'todo',
        title: 'Ticket B',
        assignee: 'codex',
        files_touched: ['src/pkg_b/module_b.py']
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
          max_concurrent: 2,
          models: [{ id: 'gpt-5', enabled: true, rate_per_hour: 5 }]
        }
      ]
    })
  });

  scheduler.start();
  scheduler.stop();

  assert.equal(agentRuntime.started.length, 2);
  const startedIds = agentRuntime.started.map(s => s.payload.ticketId).sort();
  assert.deepEqual(startedIds, ['DISJOINT-A', 'DISJOINT-B']);
});

test('scheduler retries trial merge after successful rebase', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();

  const backlog = {
    tickets: [
      { id: 'EVAL-REBASE-001', status: 'eval', title: 'Eval rebase', assignee: 'codex' }
    ]
  };

  let trialMergeCallCount = 0;
  const conflictError = new Error('Trial merge failed');
  conflictError.details = { conflict: true };

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    readAgentsConfig: () => defaultAgentsConfig,
    readEvalDefaultAgent: () => 'codex',
    createEvalTrialMerge: (ticketId) => {
      trialMergeCallCount += 1;
      if (trialMergeCallCount === 1) {
        throw conflictError;
      }
      // Second call succeeds (after rebase)
      return {
        branch: `eval/${ticketId}`,
        worktreePath: path.join(projectRoot, '..', 'eval-worktrees', `${ticketId}-eval`)
      };
    },
    rebaseOnConflict: (ticketId) => ({
      ticketId,
      branch: `ticket/${ticketId}`,
      baseBranch: 'main',
      rebased: true
    })
  });

  scheduler.start();
  scheduler.stop();

  assert.equal(trialMergeCallCount, 2, 'Trial merge should be called twice (initial + retry)');
  assert.equal(agentRuntime.started.length, 1, 'Agent should be started after successful rebase+retry');
  assert.equal(agentRuntime.started[0].payload.ticketId, 'EVAL-REBASE-001');
});

test('scheduler calls onEvalPreparationFailed when rebase fails', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const failedCalls = [];

  const backlog = {
    tickets: [
      { id: 'EVAL-REBASE-FAIL', status: 'eval', title: 'Eval rebase fail', assignee: 'codex' }
    ]
  };

  const conflictError = new Error('Trial merge failed');
  conflictError.details = { conflict: true };

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    readAgentsConfig: () => defaultAgentsConfig,
    readEvalDefaultAgent: () => 'codex',
    createEvalTrialMerge: () => {
      throw conflictError;
    },
    rebaseOnConflict: () => {
      throw new Error('Rebase also failed');
    },
    onEvalPreparationFailed: (info) => {
      failedCalls.push(info);
    }
  });

  scheduler.start();
  scheduler.stop();

  assert.equal(agentRuntime.started.length, 0, 'No agent should be started');
  assert.equal(failedCalls.length, 1, 'onEvalPreparationFailed should be called once');
  assert.equal(failedCalls[0].ticketId, 'EVAL-REBASE-FAIL');
  assert.equal(failedCalls[0].error.rebaseAttempted, true);
});

test('__init__.py inference detects conflict for sibling .py files in same package', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub({ trackActiveRuns: true });

  // Two tickets each create a .py file in the same package directory.
  // Neither explicitly lists __init__.py, but the inference should add it
  // and detect the overlap.
  const backlog = {
    tickets: [
      {
        id: 'PKG-A',
        status: 'in_progress',
        title: 'Module A',
        assignee: 'codex',
        files_touched: ['src/db/dao/account_dao.py']
      },
      {
        id: 'PKG-B',
        status: 'todo',
        title: 'Module B',
        assignee: 'codex',
        files_touched: ['src/db/dao/category_dao.py']
      }
    ]
  };

  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));

  try {
    const scheduler = createScheduler({
      projectRoot,
      agentRuntime,
      readBacklogData: () => backlog,
      readAgentsConfig: () => defaultAgentsConfig
    });

    scheduler.start();
    scheduler.stop();
  } finally {
    console.log = originalLog;
  }

  // PKG-B should be held because inferred __init__.py overlaps
  assert.equal(agentRuntime.started.length, 0, 'PKG-B should not be started');
  const holdLog = logs.find(l => l.includes('Holding PKG-B'));
  assert.ok(holdLog, 'Should log file overlap hold for PKG-B');
  assert.ok(holdLog.includes('__init__.py'), 'Should mention __init__.py as the conflicting file');
});

test('__init__.py inference does not trigger for files in different packages', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub({ trackActiveRuns: true });

  const backlog = {
    tickets: [
      {
        id: 'DIFF-PKG-A',
        status: 'in_progress',
        title: 'Module A',
        assignee: 'codex',
        files_touched: ['src/db/dao/account_dao.py']
      },
      {
        id: 'DIFF-PKG-B',
        status: 'todo',
        title: 'Module B',
        assignee: 'codex',
        files_touched: ['src/browser/profile.py']
      }
    ]
  };

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    readAgentsConfig: () => defaultAgentsConfig
  });

  scheduler.start();
  scheduler.stop();

  // Different packages — should not conflict
  assert.equal(agentRuntime.started.length, 1);
  assert.equal(agentRuntime.started[0].payload.ticketId, 'DIFF-PKG-B');
});

test('non-conflict errors skip rebase entirely', () => {
  const projectRoot = createTempProjectRoot();
  const agentRuntime = buildAgentRuntimeStub();
  const failedCalls = [];
  let rebaseCalled = false;

  const backlog = {
    tickets: [
      { id: 'EVAL-NOCONFLICT', status: 'eval', title: 'Non-conflict error', assignee: 'codex' }
    ]
  };

  const nonConflictError = new Error('Branch does not exist');
  nonConflictError.details = { conflict: false };

  const scheduler = createScheduler({
    projectRoot,
    agentRuntime,
    readBacklogData: () => backlog,
    readAgentsConfig: () => defaultAgentsConfig,
    readEvalDefaultAgent: () => 'codex',
    createEvalTrialMerge: () => {
      throw nonConflictError;
    },
    rebaseOnConflict: () => {
      rebaseCalled = true;
      return { rebased: true };
    },
    onEvalPreparationFailed: (info) => {
      failedCalls.push(info);
    }
  });

  scheduler.start();
  scheduler.stop();

  assert.equal(rebaseCalled, false, 'Rebase should NOT be called for non-conflict errors');
  assert.equal(failedCalls.length, 1, 'onEvalPreparationFailed should be called');
  assert.equal(failedCalls[0].ticketId, 'EVAL-NOCONFLICT');
  assert.equal(failedCalls[0].error.rebaseAttempted, undefined);
});
