const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildRetryContext } = require('../src/main/scheduler');

// --- Helper ---
function makeTicket(overrides = {}) {
  return {
    id: 'TEST-001',
    title: 'Test ticket',
    acceptance_criteria: ['criterion one', 'criterion two'],
    ...overrides
  };
}

// --- Tests ---

test('buildRetryContext returns empty string when fail_count is 0 or undefined', () => {
  assert.equal(buildRetryContext(makeTicket()), '');
  assert.equal(buildRetryContext(makeTicket({ fail_count: 0 })), '');
  assert.equal(buildRetryContext(makeTicket({ fail_count: undefined })), '');
});

test('buildRetryContext returns empty string when eval_fail_count is 0', () => {
  assert.equal(buildRetryContext(makeTicket({ eval_fail_count: 0 })), '');
});

test('buildRetryContext includes eval summary failing criteria', () => {
  const ticket = makeTicket({
    fail_count: 1,
    eval_summary: {
      verdict: 'FAIL',
      criteria_checks: [
        { criterion: 'Tests pass', result: 'PASS' },
        { criterion: 'Lint clean', result: 'FAIL' },
        { criterion: 'No regressions', result: 'FAIL' }
      ]
    }
  });
  const ctx = buildRetryContext(ticket);
  assert.ok(ctx.includes('PREVIOUS FAILURE CONTEXT'));
  assert.ok(ctx.includes('Eval verdict: FAIL'));
  assert.ok(ctx.includes('- Lint clean'));
  assert.ok(ctx.includes('- No regressions'));
  assert.ok(!ctx.includes('- Tests pass'));
});

test('buildRetryContext includes agent.error when present', () => {
  const ticket = makeTicket({
    fail_count: 1,
    agent: { error: 'Process exited with code 1' }
  });
  const ctx = buildRetryContext(ticket);
  assert.ok(ctx.includes('Last run error: Process exited with code 1'));
});

test('buildRetryContext includes stderr excerpt from log file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retry-ctx-test-'));
  const stderrFile = path.join(tmpDir, 'stderr.log');
  fs.writeFileSync(stderrFile, 'Error: something went wrong\nStack trace line 1\n', 'utf-8');

  const ticket = makeTicket({
    eval_fail_count: 1,
    agent: { stderr_log_file: stderrFile }
  });
  const ctx = buildRetryContext(ticket);
  assert.ok(ctx.includes('Stderr excerpt:'));
  assert.ok(ctx.includes('Error: something went wrong'));

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('buildRetryContext truncates stderr excerpt to 500 chars', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retry-ctx-test-'));
  const stderrFile = path.join(tmpDir, 'stderr.log');
  fs.writeFileSync(stderrFile, 'x'.repeat(1000), 'utf-8');

  const ticket = makeTicket({
    fail_count: 2,
    agent: { stderr_log_file: stderrFile }
  });
  const ctx = buildRetryContext(ticket);
  // The excerpt itself should be at most 500 chars (tail)
  const excerptMatch = ctx.match(/Stderr excerpt:\n([\s\S]*?)\n--- END/);
  assert.ok(excerptMatch, 'should contain stderr excerpt');
  assert.ok(excerptMatch[1].length <= 500, `excerpt length ${excerptMatch[1].length} should be <= 500`);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('buildRetryContext caps total output at 2000 characters', () => {
  const ticket = makeTicket({
    fail_count: 1,
    eval_summary: {
      verdict: 'FAIL',
      criteria_checks: Array.from({ length: 100 }, (_, i) => ({
        criterion: `Very long criterion description number ${i} with extra text to inflate size ${'padding'.repeat(10)}`,
        result: 'FAIL'
      }))
    },
    agent: { error: 'A'.repeat(500) }
  });
  const ctx = buildRetryContext(ticket);
  assert.ok(ctx.length <= 2000, `context length ${ctx.length} should be <= 2000`);
  assert.ok(ctx.endsWith('...'));
});

test('buildRetryContext ignores missing stderr log file gracefully', () => {
  const ticket = makeTicket({
    fail_count: 1,
    agent: { stderr_log_file: '/nonexistent/path/stderr.log', error: 'fail' }
  });
  const ctx = buildRetryContext(ticket);
  assert.ok(ctx.includes('Last run error: fail'));
  assert.ok(!ctx.includes('Stderr excerpt'));
});

test('buildRetryContext triggered by eval_fail_count alone', () => {
  const ticket = makeTicket({
    eval_fail_count: 2,
    eval_summary: {
      verdict: 'FAIL',
      criteria_checks: [
        { criterion: 'Build succeeds', result: 'FAIL' }
      ]
    }
  });
  const ctx = buildRetryContext(ticket);
  assert.ok(ctx.includes('PREVIOUS FAILURE CONTEXT'));
  assert.ok(ctx.includes('- Build succeeds'));
});

test('buildRetryContext returns empty string when fail counts > 0 but no failure details', () => {
  const ticket = makeTicket({ fail_count: 1 });
  const ctx = buildRetryContext(ticket);
  // No eval_summary, no agent.error, no stderr → no parts → empty string
  assert.equal(ctx, '');
});
