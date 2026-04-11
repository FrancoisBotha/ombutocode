const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { AgentInvocationError, AgentRuntime } = require('../src/main/codingAgentRuntime');

function buildPayload(ticketId = 'KIMI_PICKUP-TEST') {
  return {
    ticketId,
    epicRef: 'docs/Epics/feature_KIMI_PICKUP.md',
    title: 'Test Kimi runtime',
    repoRoot: process.cwd()
  };
}

async function waitForFinalState(runtime, runId, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = runtime.getRunStatus({ runId });
    if (status && (status.state === 'completed' || status.state === 'failed')) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for run ${runId} final state`);
}

test('happy path run completes with exit code 0', async () => {
  const runtime = new AgentRuntime({
    resolveTemplate: () => ({
      command: process.execPath,
      args: ['-e', 'process.exit(0)']
    })
  });

  const started = runtime.startKimi(buildPayload('KIMI_PICKUP-HAPPY'));
  assert.equal(started.state, 'running');
  assert.ok(started.runId);

  const finalStatus = await waitForFinalState(runtime, started.runId);
  assert.equal(finalStatus.state, 'completed');
  assert.equal(finalStatus.exitCode, 0);
  assert.equal(finalStatus.error, null);
});

test('failure path marks run failed when command exits non-zero', async () => {
  const runtime = new AgentRuntime({
    resolveTemplate: () => ({
      command: process.execPath,
      args: ['-e', 'process.exit(3)']
    })
  });

  const started = runtime.startKimi(buildPayload('KIMI_PICKUP-NONZERO'));
  const finalStatus = await waitForFinalState(runtime, started.runId);
  assert.equal(finalStatus.state, 'failed');
  assert.equal(finalStatus.exitCode, 3);
  assert.match(finalStatus.error || '', /exited with code 3/i);
});

test('failure path marks run failed when command exits 0 with semantic error output', async () => {
  const runtime = new AgentRuntime({
    resolveTemplate: () => ({
      command: process.execPath,
      args: ['-e', "process.stdout.write(\"Error code: 400 - {'error': {'message': 'Invalid request'}}\\n\"); process.exit(0)"]
    })
  });

  const started = runtime.startKimi(buildPayload('KIMI_PICKUP-SEMANTIC-ERROR'));
  const finalStatus = await waitForFinalState(runtime, started.runId);
  assert.equal(finalStatus.state, 'failed');
  assert.equal(finalStatus.exitCode, 0);
  assert.match(finalStatus.error || '', /error output despite exit code 0/i);
});

test('failure path marks run failed when executable is missing', async () => {
  const runtime = new AgentRuntime({
    resolveTemplate: () => ({
      command: '__missing_kimi_executable__',
      args: []
    })
  });

  const started = runtime.startKimi(buildPayload('KIMI_PICKUP-MISSING'));
  const finalStatus = await waitForFinalState(runtime, started.runId);
  assert.equal(finalStatus.state, 'failed');
  assert.equal(finalStatus.exitCode, null);
  assert.ok(finalStatus.error);
});

test('duplicate active runs for same ticket are blocked', async () => {
  const runtime = new AgentRuntime({
    resolveTemplate: () => ({
      command: process.execPath,
      args: ['-e', 'setTimeout(() => process.exit(0), 400)']
    })
  });

  runtime.startKimi(buildPayload('KIMI_PICKUP-DUPLICATE'));

  assert.throws(
    () => runtime.startKimi(buildPayload('KIMI_PICKUP-DUPLICATE')),
    (error) => error instanceof AgentInvocationError && error.code === 'RUN_ALREADY_ACTIVE'
  );
});

test('emits run updates with stdout/stderr tails while run is active', async () => {
  const updates = [];
  const runtime = new AgentRuntime({
    resolveTemplate: () => ({
      command: process.execPath,
      args: ['-e', 'process.stdout.write("hello\\n"); setTimeout(() => { process.stderr.write("warn\\n"); setTimeout(() => process.exit(0), 100); }, 200)']
    }),
    onRunUpdated: (run) => {
      updates.push({
        state: run.state,
        stdout: run.stdout,
        stderr: run.stderr
      });
    }
  });

  const started = runtime.startKimi(buildPayload('KIMI_PICKUP-UPDATES'));
  const finalStatus = await waitForFinalState(runtime, started.runId);
  assert.equal(finalStatus.state, 'completed');

  assert.ok(updates.length >= 1);
  assert.ok(updates.some((entry) => (entry.stdout || '').includes('hello')));
  assert.ok(updates.some((entry) => (entry.stderr || '').includes('warn')));
});

test('uses provided workingDirectory as cwd for the spawned process', async () => {
  const workingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ombutocode-runtime-cwd-'));
  const markerName = 'cwd-marker.txt';
  const runtime = new AgentRuntime({
    resolveTemplate: () => ({
      command: process.execPath,
      args: ['-e', `require('fs').writeFileSync('${markerName}', process.cwd(), 'utf8')`]
    })
  });

  const started = runtime.startKimi(buildPayload('KIMI_PICKUP-WORKDIR'), { workingDirectory });
  const finalStatus = await waitForFinalState(runtime, started.runId);
  assert.equal(finalStatus.state, 'completed');
  const markerPath = path.join(workingDirectory, markerName);
  assert.equal(fs.readFileSync(markerPath, 'utf8').trim(), path.resolve(workingDirectory));
  assert.equal(finalStatus.workingDirectory, path.resolve(workingDirectory));
});

test('falls back to repoRoot cwd when workingDirectory is omitted or null', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ombutocode-runtime-reporoot-'));
  const markerName = 'repo-root-cwd-marker.txt';
  const runtime = new AgentRuntime({
    resolveTemplate: () => ({
      command: process.execPath,
      args: ['-e', `require('fs').writeFileSync('${markerName}', process.cwd(), 'utf8')`]
    })
  });

  const payload = buildPayload('KIMI_PICKUP-WORKDIR-FALLBACK');
  payload.repoRoot = repoRoot;

  const startedWithoutOverride = runtime.startKimi(payload);
  const finalWithoutOverride = await waitForFinalState(runtime, startedWithoutOverride.runId);
  assert.equal(finalWithoutOverride.state, 'completed');
  const markerPath = path.join(repoRoot, markerName);
  assert.equal(fs.readFileSync(markerPath, 'utf8').trim(), path.resolve(repoRoot));
  fs.rmSync(markerPath, { force: true });

  const startedWithNullOverride = runtime.startKimi(
    { ...payload, ticketId: 'KIMI_PICKUP-WORKDIR-NULL' },
    { workingDirectory: null }
  );
  const finalWithNullOverride = await waitForFinalState(runtime, startedWithNullOverride.runId);
  assert.equal(finalWithNullOverride.state, 'completed');
  assert.equal(fs.readFileSync(markerPath, 'utf8').trim(), path.resolve(repoRoot));
});
