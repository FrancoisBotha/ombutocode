const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  resolveTicketStatusAfterRun,
  resolveEvalOutcomeAfterRun,
  resolveTestOutcomeAfterRun,
  formatEvaluationOutcomeNote,
  formatTestOutcomeNote
} = require('../src/main/runLifecycle');

test('completed run transitions ticket to test', () => {
  const nextStatus = resolveTicketStatusAfterRun({
    runState: 'completed',
    currentStatus: 'in_progress'
  });

  assert.equal(nextStatus, 'test');
});

test('failed run transitions ticket to todo', () => {
  const nextStatus = resolveTicketStatusAfterRun({
    runState: 'failed',
    currentStatus: 'in_progress'
  });

  assert.equal(nextStatus, 'todo');
});

test('non-terminal run state keeps current status unchanged', () => {
  const nextStatus = resolveTicketStatusAfterRun({
    runState: 'running',
    currentStatus: 'in_progress'
  });

  assert.equal(nextStatus, 'in_progress');
});

test('completed eval run with explicit PASS and references transitions to review', () => {
  const outcome = resolveEvalOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    epicRef: 'docs/Epics/feature_EVAL_WORKFLOW.md',
    stdout: [
      'Evaluation result: PASS',
      'Acceptance criteria reviewed and verified.',
      'Feature spec checked: docs/Epics/feature_EVAL_WORKFLOW.md'
    ].join('\n')
  });

  assert.equal(outcome.nextStatus, 'review');
  assert.equal(outcome.verdict, 'pass');
  assert.deepEqual(outcome.reasons, []);
});

test('completed eval run with structured PASS markers transitions to review', () => {
  const outcome = resolveEvalOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    finishedAt: '2026-02-17T12:00:00.000Z',
    epicRef: 'docs/Epics/feature_EVAL_WORKFLOW.md',
    stdout: [
      'EVALUATION_RESULT: PASS',
      'ACCEPTANCE_CRITERIA_CHECKS:',
      '- AC1 => PASS',
      '- AC2 => PASS',
      'FEATURE_REFERENCE_CHECK: PASS',
      'VERIFICATION_COMMANDS:',
      '- npm run test:kimi => PASS'
    ].join('\n')
  });

  assert.equal(outcome.nextStatus, 'review');
  assert.equal(outcome.verdict, 'pass');
  assert.deepEqual(outcome.reasons, []);
  assert.deepEqual(outcome.evalSummary, {
    verdict: 'PASS',
    criteria_checks: [
      {
        criterion: 'AC1',
        result: 'PASS',
        failure_reason: null,
        suggestion: null
      },
      {
        criterion: 'AC2',
        result: 'PASS',
        failure_reason: null,
        suggestion: null
      }
    ],
    timestamp: '2026-02-17T12:00:00.000Z'
  });
});

test('completed eval run accepts markdown-style structured markers', () => {
  const outcome = resolveEvalOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    epicRef: 'docs/Epics/feature_RATE_LIMIT_PAUSE.md',
    stdout: [
      '## EVALUATION RESULT: **PASS**',
      '## ACCEPTANCE CRITERIA CHECKS:',
      '- AC1: PASS | evidence: regex matches "out of Codex messages"',
      '- AC2: PASS | evidence: fallback cooldown path verified',
      '## FEATURE REFERENCE CHECK: **PASS**',
      '## SUMMARY: all checks passed'
    ].join('\n')
  });

  assert.equal(outcome.nextStatus, 'review');
  assert.equal(outcome.verdict, 'pass');
  assert.deepEqual(outcome.reasons, []);
});

test('completed eval run with explicit FAIL transitions to todo with reasons', () => {
  const outcome = resolveEvalOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    finishedAt: '2026-02-17T12:05:00.000Z',
    epicRef: 'docs/Epics/feature_EVAL_WORKFLOW.md',
    stdout: [
      'Evaluation result: FAIL',
      'Acceptance criteria reviewed and verified.',
      'Feature spec checked: docs/Epics/feature_EVAL_WORKFLOW.md'
    ].join('\n')
  });

  assert.equal(outcome.nextStatus, 'todo');
  assert.equal(outcome.verdict, 'fail');
  assert.ok(outcome.reasons.includes('Evaluator returned FAIL verdict.'));
  assert.ok(typeof outcome.evalSummary.raw_excerpt === 'string' && outcome.evalSummary.raw_excerpt.length > 0,
    'raw_excerpt should be present when criteria_checks is empty but output exists');
  const { raw_excerpt: _re1, ...rest1 } = outcome.evalSummary;
  assert.deepEqual(rest1, {
    verdict: 'FAIL',
    criteria_checks: [],
    timestamp: '2026-02-17T12:05:00.000Z'
  });
});

test('structured FAIL criteria include failure_reason and suggestion', () => {
  const outcome = resolveEvalOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    finishedAt: '2026-02-17T12:10:00.000Z',
    epicRef: 'docs/Epics/feature_EVAL_SUMMARY.md',
    stdout: [
      'EVALUATION_RESULT: FAIL',
      'ACCEPTANCE_CRITERIA_CHECKS:',
      '- FAIL: build completes without errors | reason: npm run build exits with code 1 due to missing import | suggestion: restore the missing import and rerun npm run build',
      '- PASS: eval summary is persisted to backlog',
      'FEATURE_REFERENCE_CHECK: PASS'
    ].join('\n')
  });

  assert.equal(outcome.nextStatus, 'todo');
  assert.equal(outcome.verdict, 'fail');
  assert.deepEqual(outcome.evalSummary, {
    verdict: 'FAIL',
    criteria_checks: [
      {
        criterion: 'build completes without errors',
        result: 'FAIL',
        failure_reason: 'npm run build exits with code 1 due to missing import',
        suggestion: 'restore the missing import and rerun npm run build'
      },
      {
        criterion: 'eval summary is persisted to backlog',
        result: 'PASS',
        failure_reason: null,
        suggestion: null
      }
    ],
    timestamp: '2026-02-17T12:10:00.000Z'
  });
});

test('missing structured criteria falls back to verdict-only eval summary', () => {
  const outcome = resolveEvalOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    finishedAt: '2026-02-17T12:15:00.000Z',
    epicRef: 'docs/Epics/feature_EVAL_SUMMARY.md',
    stdout: [
      'Evaluation result: FAIL',
      'Evaluator could not parse acceptance checklist.'
    ].join('\n')
  });

  assert.equal(outcome.verdict, 'fail');
  assert.ok(typeof outcome.evalSummary.raw_excerpt === 'string' && outcome.evalSummary.raw_excerpt.length > 0,
    'raw_excerpt should be present when criteria_checks is empty but output exists');
  const { raw_excerpt: _re2, ...rest2 } = outcome.evalSummary;
  assert.deepEqual(rest2, {
    verdict: 'FAIL',
    criteria_checks: [],
    timestamp: '2026-02-17T12:15:00.000Z'
  });
});

test('malformed structured criteria markers still fall back to verdict-only eval summary', () => {
  const outcome = resolveEvalOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    finishedAt: '2026-02-17T12:16:00.000Z',
    epicRef: 'docs/Epics/feature_EVAL_SUMMARY.md',
    stdout: [
      'EVALUATION_RESULT: PASS',
      'ACCEPTANCE_CRITERIA_CHECKS:',
      '- criterion one reviewed',
      '- criterion two reviewed',
      'FEATURE_REFERENCE_CHECK: PASS'
    ].join('\n')
  });

  assert.equal(outcome.nextStatus, 'todo');
  assert.equal(outcome.verdict, 'fail');
  assert.ok(typeof outcome.evalSummary.raw_excerpt === 'string' && outcome.evalSummary.raw_excerpt.length > 0,
    'raw_excerpt should be present when criteria_checks is empty but output exists');
  const { raw_excerpt: _re3, ...rest3 } = outcome.evalSummary;
  assert.deepEqual(rest3, {
    verdict: 'FAIL',
    criteria_checks: [],
    timestamp: '2026-02-17T12:16:00.000Z'
  });
});

test('unstructured PASS output can still persist verdict-only eval summary', () => {
  const outcome = resolveEvalOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    finishedAt: '2026-02-17T12:17:00.000Z',
    epicRef: 'docs/Epics/feature_EVAL_SUMMARY.md',
    stdout: [
      'Evaluation result: PASS',
      'Acceptance criteria reviewed and verified.',
      'Feature spec checked: docs/Epics/feature_EVAL_SUMMARY.md'
    ].join('\n')
  });

  assert.equal(outcome.nextStatus, 'review');
  assert.equal(outcome.verdict, 'pass');
  assert.ok(typeof outcome.evalSummary.raw_excerpt === 'string' && outcome.evalSummary.raw_excerpt.length > 0,
    'raw_excerpt should be present when criteria_checks is empty but output exists');
  const { raw_excerpt: _re4, ...rest4 } = outcome.evalSummary;
  assert.deepEqual(rest4, {
    verdict: 'PASS',
    criteria_checks: [],
    timestamp: '2026-02-17T12:17:00.000Z'
  });
});

test('raw_excerpt is NOT included when structured criteria_checks are populated', () => {
  const outcome = resolveEvalOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    finishedAt: '2026-02-17T12:18:00.000Z',
    epicRef: 'docs/Epics/feature_EVAL_WORKFLOW.md',
    stdout: [
      'EVALUATION_RESULT: PASS',
      'ACCEPTANCE_CRITERIA_CHECKS:',
      '- AC1 => PASS',
      'FEATURE_REFERENCE_CHECK: PASS'
    ].join('\n')
  });

  assert.equal(outcome.nextStatus, 'review');
  assert.equal(outcome.verdict, 'pass');
  assert.ok(outcome.evalSummary.criteria_checks.length > 0,
    'criteria_checks should be populated');
  assert.equal(outcome.evalSummary.raw_excerpt, undefined,
    'raw_excerpt should NOT be present when criteria_checks is populated');
});

test('completed eval run missing acceptance criteria references fails closed', () => {
  const outcome = resolveEvalOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    epicRef: 'docs/Epics/feature_EVAL_WORKFLOW.md',
    stdout: [
      'Evaluation result: PASS',
      'Feature spec checked: docs/Epics/feature_EVAL_WORKFLOW.md'
    ].join('\n')
  });

  assert.equal(outcome.nextStatus, 'todo');
  assert.equal(outcome.verdict, 'fail');
  assert.ok(
    outcome.reasons.some((reason) => reason.includes('acceptance-criteria verification'))
  );
});

test('structured feature reference FAIL forces eval failure', () => {
  const outcome = resolveEvalOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    epicRef: 'docs/Epics/feature_EVAL_WORKFLOW.md',
    stdout: [
      'EVALUATION_RESULT: PASS',
      'ACCEPTANCE_CRITERIA_CHECKS:',
      '- AC1 => PASS',
      'FEATURE_REFERENCE_CHECK: FAIL'
    ].join('\n')
  });

  assert.equal(outcome.nextStatus, 'todo');
  assert.equal(outcome.verdict, 'fail');
  assert.ok(
    outcome.reasons.some((reason) => reason.includes('feature spec verification'))
  );
});

test('acceptance criteria header without PASS/FAIL evidence fails closed', () => {
  const outcome = resolveEvalOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    epicRef: 'docs/Epics/feature_EVAL_WORKFLOW.md',
    stdout: [
      'EVALUATION_RESULT: PASS',
      'ACCEPTANCE_CRITERIA_CHECKS:',
      '- criterion one reviewed',
      'FEATURE_REFERENCE_CHECK: PASS'
    ].join('\n')
  });

  assert.equal(outcome.nextStatus, 'todo');
  assert.equal(outcome.verdict, 'fail');
  assert.ok(
    outcome.reasons.some((reason) => reason.includes('acceptance-criteria verification'))
  );
});

test('failed eval run always returns todo and includes run error', () => {
  const outcome = resolveEvalOutcomeAfterRun({
    runState: 'failed',
    currentStatus: 'eval',
    runError: 'Evaluator process exited with code 1',
    epicRef: 'docs/Epics/feature_EVAL_WORKFLOW.md'
  });

  assert.equal(outcome.nextStatus, 'todo');
  assert.equal(outcome.verdict, 'fail');
  assert.ok(
    outcome.reasons.some((reason) => reason.includes('Evaluator process exited with code 1'))
  );
});

test('ad-hoc eval pass does not require feature spec reference', () => {
  const outcome = resolveEvalOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    epicRef: 'docs/Epics/feature_AD_HOC.md',
    stdout: [
      'Evaluation result: PASS',
      'Acceptance criteria reviewed and verified.'
    ].join('\n')
  });

  assert.equal(outcome.nextStatus, 'review');
  assert.equal(outcome.verdict, 'pass');
  assert.deepEqual(outcome.reasons, []);
});

test('formatEvaluationOutcomeNote includes failback reasons as bullets', () => {
  const note = formatEvaluationOutcomeNote({
    previousStatus: 'eval',
    verdict: 'fail',
    reasons: ['Missing acceptance criteria evidence', 'Feature spec not referenced']
  });

  assert.match(note, /^Eval failed\./);
  assert.match(note, /- Missing acceptance criteria evidence/);
  assert.match(note, /- Feature spec not referenced/);
});

test('formatEvaluationOutcomeNote returns null for non-eval tickets', () => {
  const note = formatEvaluationOutcomeNote({
    previousStatus: 'in_progress',
    verdict: 'fail',
    reasons: ['Any reason']
  });

  assert.equal(note, null);
});

test('narrative "all N criteria confirmed" is recognized as pass verdict', () => {
  const outcome = resolveEvalOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    finishedAt: '2026-02-17T12:20:00.000Z',
    epicRef: 'docs/Epics/feature_EVAL_WORKFLOW.md',
    stdout: [
      'All 8 acceptance criteria are verified in main.rs:',
      '1. --data-dir via clap derive',
      '2. Tracing JSON to stderr',
      'Feature spec checked: docs/Epics/feature_EVAL_WORKFLOW.md'
    ].join('\n')
  });

  assert.equal(outcome.verdict, 'pass');
  assert.equal(outcome.nextStatus, 'review');
});

test('narrative "acceptance criteria — all met" is recognized as pass verdict', () => {
  const outcome = resolveEvalOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    finishedAt: '2026-02-17T12:21:00.000Z',
    epicRef: 'docs/Epics/feature_EVAL_WORKFLOW.md',
    stdout: [
      'Acceptance criteria — all met',
      'Feature spec checked: docs/Epics/feature_EVAL_WORKFLOW.md'
    ].join('\n')
  });

  assert.equal(outcome.verdict, 'pass');
  assert.equal(outcome.nextStatus, 'review');
});

test('checkmark emoji criteria are parsed as PASS in structured output', () => {
  const outcome = resolveEvalOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    finishedAt: '2026-02-17T12:22:00.000Z',
    epicRef: 'docs/Epics/feature_EVAL_WORKFLOW.md',
    stdout: [
      'EVALUATION_RESULT: PASS',
      'ACCEPTANCE_CRITERIA_CHECKS:',
      '- \u2705 config struct with resource budgets',
      '- \u2705 defaults.toml embedded via include_str',
      'FEATURE_REFERENCE_CHECK: PASS'
    ].join('\n')
  });

  assert.equal(outcome.verdict, 'pass');
  assert.equal(outcome.nextStatus, 'review');
  assert.equal(outcome.evalSummary.criteria_checks.length, 2);
  assert.equal(outcome.evalSummary.criteria_checks[0].result, 'PASS');
  assert.equal(outcome.evalSummary.criteria_checks[0].criterion, 'config struct with resource budgets');
});

test('markdown table with checkmarks is parsed as criteria checks', () => {
  const outcome = resolveEvalOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    finishedAt: '2026-02-17T12:23:00.000Z',
    epicRef: 'docs/Epics/feature_EVAL_WORKFLOW.md',
    stdout: [
      'EVALUATION_RESULT: PASS',
      'ACCEPTANCE_CRITERIA_CHECKS:',
      '| --data-dir via clap | \u2705 |',
      '| tracing JSON to stderr | \u2705 |',
      'FEATURE_REFERENCE_CHECK: PASS'
    ].join('\n')
  });

  assert.equal(outcome.verdict, 'pass');
  assert.equal(outcome.nextStatus, 'review');
  assert.equal(outcome.evalSummary.criteria_checks.length, 2);
  assert.equal(outcome.evalSummary.criteria_checks[0].criterion, '--data-dir via clap');
  assert.equal(outcome.evalSummary.criteria_checks[1].criterion, 'tracing JSON to stderr');
});

test('numbered list criteria with PASS/FAIL are parsed', () => {
  const outcome = resolveEvalOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    finishedAt: '2026-02-17T12:24:00.000Z',
    epicRef: 'docs/Epics/feature_EVAL_WORKFLOW.md',
    stdout: [
      'EVALUATION_RESULT: FAIL',
      'ACCEPTANCE_CRITERIA_CHECKS:',
      '1. PASS: config struct exists',
      '2. FAIL: defaults.toml not embedded | failure_reason: file missing | suggestion: add include_str',
      'FEATURE_REFERENCE_CHECK: PASS'
    ].join('\n')
  });

  assert.equal(outcome.verdict, 'fail');
  assert.equal(outcome.evalSummary.criteria_checks.length, 2);
  assert.equal(outcome.evalSummary.criteria_checks[0].result, 'PASS');
  assert.equal(outcome.evalSummary.criteria_checks[1].result, 'FAIL');
  assert.ok(outcome.evalSummary.criteria_checks[1].failure_reason.includes('file missing'));
});

test('NOTE: inside criteria section body does NOT terminate parsing', () => {
  const outcome = resolveEvalOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    finishedAt: '2026-03-02T10:00:00.000Z',
    epicRef: 'docs/Epics/feature_m1_skeleton_protocol_ipc.md',
    stdout: [
      'EVALUATION_RESULT: PASS',
      'ACCEPTANCE_CRITERIA_CHECKS:',
      '- PASS: protocol crate compiles | evidence: cargo test passes',
      'NOTE: The implementation uses serde_json for serialization.',
      '- PASS: IPC types defined | evidence: types.rs line 12',
      'FEATURE_REFERENCE_CHECK: PASS'
    ].join('\n')
  });

  assert.equal(outcome.nextStatus, 'review');
  assert.equal(outcome.verdict, 'pass');
  assert.equal(outcome.evalSummary.criteria_checks.length, 2);
  assert.equal(outcome.evalSummary.criteria_checks[0].criterion, 'protocol crate compiles');
  assert.equal(outcome.evalSummary.criteria_checks[1].criterion, 'IPC types defined');
});

test('feature ref matched by filename stem only (no directory prefix or .md)', () => {
  const outcome = resolveEvalOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    finishedAt: '2026-03-02T10:01:00.000Z',
    epicRef: 'docs/Epics/feature_m1_skeleton_protocol_ipc.md',
    stdout: [
      'Evaluation result: PASS',
      'Acceptance criteria reviewed and verified.',
      'Checked against feature_m1_skeleton_protocol_ipc specification.'
    ].join('\n')
  });

  assert.equal(outcome.nextStatus, 'review');
  assert.equal(outcome.verdict, 'pass');
  assert.deepEqual(outcome.reasons, []);
});

test('feature ref matched by "feature specification" and "verified against feature"', () => {
  const outcome1 = resolveEvalOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    finishedAt: '2026-03-02T10:02:00.000Z',
    epicRef: 'docs/Epics/feature_EVAL_WORKFLOW.md',
    stdout: [
      'Evaluation result: PASS',
      'Acceptance criteria reviewed and verified.',
      'The feature specification has been fully reviewed.'
    ].join('\n')
  });

  assert.equal(outcome1.nextStatus, 'review');
  assert.equal(outcome1.verdict, 'pass');
  assert.deepEqual(outcome1.reasons, []);

  const outcome2 = resolveEvalOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    finishedAt: '2026-03-02T10:03:00.000Z',
    epicRef: 'docs/Epics/feature_EVAL_WORKFLOW.md',
    stdout: [
      'Evaluation result: PASS',
      'Acceptance criteria reviewed.',
      'Verified implementation against feature requirements.'
    ].join('\n')
  });

  assert.equal(outcome2.nextStatus, 'review');
  assert.equal(outcome2.verdict, 'pass');
  assert.deepEqual(outcome2.reasons, []);
});

test('SMART VERDICT INFERENCE fires despite non-empty reasons when all criteria PASS and feature ref matched by prose', () => {
  const outcome = resolveEvalOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    finishedAt: '2026-03-02T10:04:00.000Z',
    epicRef: 'docs/Epics/feature_m1_skeleton_protocol_ipc.md',
    stdout: [
      'EVALUATION_RESULT: FAIL',
      'ACCEPTANCE_CRITERIA_CHECKS:',
      '- PASS: protocol crate compiles | evidence: cargo test passes',
      '- PASS: IPC types defined | evidence: types.rs line 12',
      'Verified against feature specification.'
    ].join('\n')
  });

  assert.equal(outcome.nextStatus, 'review');
  assert.equal(outcome.verdict, 'pass');
  assert.deepEqual(outcome.reasons, []);
});

test('"all acceptance criteria confirmed" (no number) recognized as pass verdict', () => {
  const outcome = resolveEvalOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    finishedAt: '2026-03-02T10:05:00.000Z',
    epicRef: 'docs/Epics/feature_EVAL_WORKFLOW.md',
    stdout: [
      'All acceptance criteria are confirmed.',
      'Feature spec checked: docs/Epics/feature_EVAL_WORKFLOW.md'
    ].join('\n')
  });

  assert.equal(outcome.verdict, 'pass');
  assert.equal(outcome.nextStatus, 'review');
});

test('EVALUATION_RESULT : PASS (space before colon) recognized as structured verdict', () => {
  const outcome = resolveEvalOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    finishedAt: '2026-03-02T10:06:00.000Z',
    epicRef: 'docs/Epics/feature_EVAL_WORKFLOW.md',
    stdout: [
      'EVALUATION_RESULT : PASS',
      'ACCEPTANCE_CRITERIA_CHECKS:',
      '- PASS: criterion one | evidence: verified',
      'FEATURE_REFERENCE_CHECK: PASS'
    ].join('\n')
  });

  assert.equal(outcome.nextStatus, 'review');
  assert.equal(outcome.verdict, 'pass');
  assert.deepEqual(outcome.reasons, []);
});

test('run finished flow does not append legacy eval outcome summary lines to notes', () => {
  const mainContent = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf-8');

  assert.ok(!mainContent.includes('formatEvaluationOutcomeNote('));
  assert.ok(!mainContent.includes('Evaluation outcome:'));
});

// --- Test phase tests ---

test('completed test run transitions ticket from test to eval', () => {
  const nextStatus = resolveTicketStatusAfterRun({
    runState: 'completed',
    currentStatus: 'test'
  });

  assert.equal(nextStatus, 'eval');
});

test('failed test run transitions ticket from test to todo', () => {
  const nextStatus = resolveTicketStatusAfterRun({
    runState: 'failed',
    currentStatus: 'test'
  });

  assert.equal(nextStatus, 'todo');
});

test('non-terminal test run state keeps test status unchanged', () => {
  const nextStatus = resolveTicketStatusAfterRun({
    runState: 'running',
    currentStatus: 'test'
  });

  assert.equal(nextStatus, 'test');
});

test('resolveTestOutcomeAfterRun PASS transitions test to eval', () => {
  const outcome = resolveTestOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'test',
    finishedAt: '2026-03-02T10:00:00.000Z',
    stdout: [
      'TEST_RESULT: PASS',
      'UNIT_TESTS: PASS | 412 pass, 2 fail (pre-existing)',
      'LINT_CHECK: PASS | no errors',
      'TYPE_CHECK: PASS | no errors'
    ].join('\n')
  });

  assert.equal(outcome.nextStatus, 'eval');
  assert.equal(outcome.verdict, 'pass');
  assert.deepEqual(outcome.reasons, []);
  assert.equal(outcome.testSummary.verdict, 'PASS');
  assert.equal(outcome.testSummary.checks.length, 3);
  assert.equal(outcome.testSummary.checks[0].check_name, 'UNIT_TESTS');
  assert.equal(outcome.testSummary.checks[0].result, 'PASS');
});

test('resolveTestOutcomeAfterRun FAIL transitions test to todo', () => {
  const outcome = resolveTestOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'test',
    finishedAt: '2026-03-02T10:05:00.000Z',
    stdout: [
      'TEST_RESULT: FAIL',
      'UNIT_TESTS: FAIL | 3 tests failed in scheduler.test.js',
      'LINT_CHECK: PASS | no errors',
      'TYPE_CHECK: PASS | no errors',
      'FAILURE_DETAILS: scheduler.test.js has 3 failing assertions'
    ].join('\n')
  });

  assert.equal(outcome.nextStatus, 'todo');
  assert.equal(outcome.verdict, 'fail');
  assert.equal(outcome.testSummary.verdict, 'FAIL');
  assert.equal(outcome.testSummary.checks.length, 3);
  assert.equal(outcome.testSummary.checks[0].result, 'FAIL');
  assert.ok(outcome.testSummary.checks[0].details.includes('3 tests failed'));
});

test('resolveTestOutcomeAfterRun missing verdict fails closed', () => {
  const outcome = resolveTestOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'test',
    finishedAt: '2026-03-02T10:10:00.000Z',
    stdout: 'Tests ran but no structured output'
  });

  assert.equal(outcome.nextStatus, 'todo');
  assert.equal(outcome.verdict, 'fail');
  assert.ok(
    outcome.reasons.some((r) => r.includes('missing an explicit TEST_RESULT: PASS verdict'))
  );
});

test('resolveTestOutcomeAfterRun failed run always returns todo', () => {
  const outcome = resolveTestOutcomeAfterRun({
    runState: 'failed',
    currentStatus: 'test',
    runError: 'Test process exited with code 1',
    finishedAt: '2026-03-02T10:15:00.000Z'
  });

  assert.equal(outcome.nextStatus, 'todo');
  assert.equal(outcome.verdict, 'fail');
  assert.ok(
    outcome.reasons.some((r) => r.includes('Test process exited with code 1'))
  );
});

test('resolveTestOutcomeAfterRun returns null for non-test status', () => {
  const outcome = resolveTestOutcomeAfterRun({
    runState: 'completed',
    currentStatus: 'eval',
    stdout: 'TEST_RESULT: PASS'
  });

  assert.equal(outcome.verdict, null);
  assert.equal(outcome.testSummary, null);
});

test('formatTestOutcomeNote returns pass note for test status', () => {
  const note = formatTestOutcomeNote({
    previousStatus: 'test',
    verdict: 'pass',
    reasons: []
  });

  assert.equal(note, 'Test passed.');
});

test('formatTestOutcomeNote returns fail note with reasons', () => {
  const note = formatTestOutcomeNote({
    previousStatus: 'test',
    verdict: 'fail',
    reasons: ['Unit tests failed', 'Lint errors found']
  });

  assert.match(note, /^Test failed\./);
  assert.match(note, /- Unit tests failed/);
  assert.match(note, /- Lint errors found/);
});

test('formatTestOutcomeNote returns null for non-test status', () => {
  const note = formatTestOutcomeNote({
    previousStatus: 'in_progress',
    verdict: 'pass',
    reasons: []
  });

  assert.equal(note, null);
});
