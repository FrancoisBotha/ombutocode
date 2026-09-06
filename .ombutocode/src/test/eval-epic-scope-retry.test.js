const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveEvalOutcomeAfterRun } = require('../src/main/runLifecycle');
const { buildRetryContext } = require('../src/main/scheduler');

// An eval that passes every acceptance criterion but fails the epic-scope
// check must (a) keep the evaluator's evidence and (b) put it in front of the
// retry — otherwise the retry has nothing to act on and repeats the mistake.
const EVAL_OUTPUT = [
  'EVALUATION_RESULT: FAIL',
  'ACCEPTANCE_CRITERIA_CHECKS:',
  '- PASS: ascending? returns #t for sorted lists | evidence: hw08.scm:1-5',
  '- PASS: my-filter does not call the built-in filter | evidence: hw08.scm:7-10',
  'EPIC_REFERENCE_CHECK: FAIL | evidence: Epic constraint (section 3) says tests/ is read-only but the branch adds cs61_fa24_hw08/tests/test_hw08.py',
  'SUMMARY: criteria met, scope violated'
].join('\n');

test('eval summary records the epic-scope failure evidence', () => {
  const outcome = resolveEvalOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    epicRef: 'docs/Epics/epic_01_X.md',
    stdout: EVAL_OUTPUT
  });
  assert.equal(outcome.nextStatus, 'todo');
  assert.equal(outcome.evalSummary.epic_reference_check, 'FAIL');
  assert.match(outcome.evalSummary.epic_reference_evidence, /tests\/ is read-only/);
  assert.equal(outcome.evalSummary.criteria_checks.filter((c) => c.result === 'FAIL').length, 0);
});

test('retry context carries the epic-scope failure when no criterion failed', () => {
  const outcome = resolveEvalOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    epicRef: 'docs/Epics/epic_01_X.md',
    stdout: EVAL_OUTPUT
  });
  const ticket = { id: 'T-1', eval_fail_count: 1, eval_summary: outcome.evalSummary };
  const ctx = buildRetryContext(ticket);
  assert.match(ctx, /PREVIOUS FAILURE CONTEXT/);
  assert.match(ctx, /EPIC_REFERENCE_CHECK: FAIL/);
  assert.match(ctx, /test_hw08\.py/);
  assert.match(ctx, /do not simply resubmit/);
});

test('a passing epic-scope check adds nothing to the retry context', () => {
  const ticket = {
    id: 'T-1', eval_fail_count: 1,
    eval_summary: { verdict: 'FAIL', criteria_checks: [{ criterion: 'c', result: 'FAIL', failure_reason: 'r' }], epic_reference_check: 'PASS' }
  };
  const ctx = buildRetryContext(ticket);
  assert.doesNotMatch(ctx, /EPIC_REFERENCE_CHECK: FAIL/);
  assert.match(ctx, /Failing criteria/);
});
