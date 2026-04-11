const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeStartPayload, renderCommand, AgentRuntime } = require('../src/main/codingAgentRuntime');

function buildPayload(overrides = {}) {
  return {
    ticketId: 'ACX-001-TEST',
    epicRef: 'docs/Epics/feature_AGENT_CONTEXT.md',
    title: 'Test retry context',
    repoRoot: process.cwd(),
    ...overrides
  };
}

test('normalizeStartPayload preserves retryContext string', () => {
  const payload = buildPayload({ retryContext: 'Previous run failed: tests did not pass' });
  const normalized = normalizeStartPayload(payload);
  assert.equal(normalized.retryContext, 'Previous run failed: tests did not pass');
});

test('normalizeStartPayload defaults retryContext to empty string when not provided', () => {
  const payload = buildPayload();
  const normalized = normalizeStartPayload(payload);
  assert.equal(normalized.retryContext, '');
});

test('normalizeStartPayload defaults retryContext to empty string when null', () => {
  const payload = buildPayload({ retryContext: null });
  const normalized = normalizeStartPayload(payload);
  assert.equal(normalized.retryContext, '');
});

test('normalizeStartPayload defaults retryContext to empty string when non-string', () => {
  const payload = buildPayload({ retryContext: 42 });
  const normalized = normalizeStartPayload(payload);
  assert.equal(normalized.retryContext, '');
});

test('replaceTemplateTokens substitutes {{retryContext}} in template args', () => {
  const template = {
    command: 'echo',
    args: ['--context', '{{retryContext}}', '--ticket', '{{ticketId}}']
  };
  const payload = normalizeStartPayload(buildPayload({ retryContext: 'FAIL: tests broken' }));
  const runId = 'test-run-id';
  const rendered = renderCommand(template, payload, runId);
  assert.equal(rendered.args[1], 'FAIL: tests broken');
  assert.equal(rendered.args[3], 'ACX-001-TEST');
});

test('replaceTemplateTokens substitutes {{retryContext}} as empty string on first attempt', () => {
  const template = {
    command: 'echo',
    args: ['prefix{{retryContext}}suffix']
  };
  const payload = normalizeStartPayload(buildPayload());
  const rendered = renderCommand(template, payload, 'run-1');
  assert.equal(rendered.args[0], 'prefixsuffix');
});

test('retryContext flows through to spawned agent command args', async () => {
  const retryText = 'PREVIOUS FAILURE: eval criteria X failed';
  const runtime = new AgentRuntime({
    resolveTemplate: () => ({
      command: process.execPath,
      args: ['-e', `process.stdout.write('{{retryContext}}'); process.exit(0)`]
    })
  });

  const payload = buildPayload({ retryContext: retryText });
  const started = runtime.startAgent('claude', payload);

  const deadline = Date.now() + 5000;
  let finalStatus;
  while (Date.now() < deadline) {
    finalStatus = runtime.getRunStatus({ runId: started.runId });
    if (finalStatus && (finalStatus.state === 'completed' || finalStatus.state === 'failed')) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  assert.equal(finalStatus.state, 'completed');
  assert.ok(finalStatus.stdout.includes(retryText));
});
