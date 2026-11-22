const test = require('node:test');
const assert = require('node:assert/strict');

const { applyProviderLimitOutcome, resetRetryBudgetAfterManualSuccess } = require('../src/main/runOutcomePolicy');
const { createRuntimeCallbacks } = require('../src/main/coreCallbacks');
const { getScheduledStartDelayMs } = require('../src/main/scheduler');

const RESET_AT = '2099-01-01T05:00:00.000Z';
const usageLimitRun = (overrides = {}) => ({
  runId: 'run-1',
  ticketId: 'T-1',
  agentName: 'codex',
  state: 'failed',
  exitCode: 1,
  stdout: '',
  stderr: `HTTP 429 usage_limit_reached reset_at=${RESET_AT}`,
  ...overrides
});

// --- applyProviderLimitOutcome ---

test('a usage limit on an implementation run reschedules the ticket in todo without counting a failure', () => {
  const ticket = { id: 'T-1', status: 'in_progress', assignee: 'codex', fail_count: 1, eval_fail_count: 0 };
  const outcome = applyProviderLimitOutcome(ticket, usageLimitRun());
  assert.equal(outcome.action, 'rescheduled');
  assert.equal(ticket.status, 'todo');
  assert.equal(ticket.scheduled_start, RESET_AT);
  assert.equal(ticket.assignee, 'codex');
  assert.equal(ticket.fail_count, 1, 'fail_count untouched');
  assert.match(outcome.note, /Not counted as a failure/);
});

test('a usage limit in a later phase keeps the ticket in that column', () => {
  for (const status of ['test', 'eval', 'merging']) {
    const ticket = { id: 'T-1', status, assignee: 'codex', fail_count: 0 };
    applyProviderLimitOutcome(ticket, usageLimitRun({ isTest: status === 'test', isEval: status === 'eval' }));
    assert.equal(ticket.status, status);
    assert.equal(ticket.scheduled_start, RESET_AT);
  }
});

test('the caller-corrected status wins over a tampered ticket.status', () => {
  const ticket = { id: 'T-1', status: 'test', assignee: 'codex' };
  applyProviderLimitOutcome(ticket, usageLimitRun(), { currentStatus: 'in_progress' });
  assert.equal(ticket.status, 'todo');
});

test('a usage limit with no reset time unassigns the ticket for a human to schedule', () => {
  const ticket = { id: 'T-1', status: 'test', assignee: 'codex', fail_count: 2, scheduled_start: '2000-01-01T00:00:00Z' };
  const outcome = applyProviderLimitOutcome(ticket, usageLimitRun({ stderr: "You've hit your usage limit" }));
  assert.equal(outcome.action, 'unassigned');
  assert.equal(ticket.status, 'todo');
  assert.equal(ticket.assignee, 'NONE');
  assert.equal(ticket.scheduled_start, null);
  assert.equal(ticket.fail_count, 2);
});

test('ordinary failures and completed runs are left to the normal rules', () => {
  const ticket = { id: 'T-1', status: 'in_progress' };
  assert.equal(applyProviderLimitOutcome(ticket, usageLimitRun({ stderr: 'TypeError: x is undefined' })), null);
  assert.equal(applyProviderLimitOutcome(ticket, usageLimitRun({ state: 'completed', exitCode: 0 })), null);
  assert.equal(ticket.status, 'in_progress');
});

// --- resetRetryBudgetAfterManualSuccess ---

test('a successful manual implementation run resets the retry counts', () => {
  const ticket = { id: 'T-1', status: 'test', fail_count: 4, eval_fail_count: 1 };
  assert.equal(resetRetryBudgetAfterManualSuccess(ticket, { state: 'completed' }, { isManualRun: true }), true);
  assert.equal(ticket.fail_count, 0);
  assert.equal(ticket.eval_fail_count, 0);
});

test('scheduler runs, failed manual runs and test/eval runs do not reset the counts', () => {
  const cases = [
    [{ state: 'completed' }, { isManualRun: false }, 'test'],
    [{ state: 'failed' }, { isManualRun: true }, 'test'],
    [{ state: 'completed', isTest: true }, { isManualRun: true }, 'eval'],
    [{ state: 'completed' }, { isManualRun: true }, 'todo']
  ];
  for (const [run, opts, status] of cases) {
    const ticket = { id: 'T-1', status, fail_count: 4 };
    assert.equal(resetRetryBudgetAfterManualSuccess(ticket, run, opts), false);
    assert.equal(ticket.fail_count, 4);
  }
});

// --- scheduled_start gate ---

test('scheduled_start holds a ticket in any column, not only todo', () => {
  const nowMs = Date.parse('2098-12-31T00:00:00Z');
  for (const status of ['todo', 'test', 'eval', 'merging']) {
    assert.ok(getScheduledStartDelayMs({ status, scheduled_start: RESET_AT }, nowMs) > 0, status);
  }
  assert.equal(getScheduledStartDelayMs({ status: 'test', scheduled_start: '2000-01-01T00:00:00Z' }, nowMs), 0);
});

// --- end to end through the headless run-finished handler ---

function makeCallbacks(ticket, { isManualRun = () => false } = {}) {
  const events = [];
  const callbacks = createRuntimeCallbacks({
    appendAgentLog: () => {},
    updateTicket: (_id, mutate) => { mutate(ticket); },
    buildRunOutputFilePaths: (run) => ({
      stdoutPath: `/out/${run.runId}.stdout.log`,
      stderrPath: `/out/${run.runId}.stderr.log`,
      stdoutRelative: `run-output/${run.runId}.stdout.log`,
      stderrRelative: `run-output/${run.runId}.stderr.log`
    }),
    writeRunOutputFiles: () => {},
    removeRunOutputFile: () => {},
    runOutputFilesByRunId: new Map(),
    logSchedulerEvent: (type) => events.push(type),
    appendTicketNote: () => {},
    formatCommandLine: () => 'cmd',
    shorten: (s) => s,
    NOTE_OUTPUT_LIMIT: 4000,
    summarizeSquashMergeFailure: () => '',
    summarizeTrialMergeFailure: () => '',
    readMaxEvalRetries: () => 3,
    projectRoot: process.cwd(),
    onTitleBrandingUpdate: null,
    isManualRun
  });
  callbacks.setScheduler({ onRunFinished: () => {}, dispatch: () => {} });
  return { callbacks, events };
}

test('repeated usage-limit failures never burn the retry budget', () => {
  const ticket = { id: 'T-1', status: 'in_progress', assignee: 'codex', fail_count: 0, agent: {} };
  const { callbacks, events } = makeCallbacks(ticket);
  for (let i = 0; i < 4; i += 1) {
    ticket.status = 'in_progress';
    callbacks.onRunFinished(usageLimitRun({ runId: `run-${i}`, workingDirectory: null }));
  }
  assert.equal(ticket.fail_count, 0);
  assert.equal(ticket.status, 'todo');
  assert.equal(ticket.assignee, 'codex');
  assert.equal(ticket.scheduled_start, RESET_AT);
  assert.ok(events.includes('ticket.provider_limit_rescheduled'));
  assert.ok(!events.includes('ticket.fail_count_incremented'));
});

test('a usage limit on a test run keeps the ticket in test instead of failing it', () => {
  const ticket = { id: 'T-1', status: 'test', assignee: 'codex', fail_count: 0, agent: {} };
  const { callbacks } = makeCallbacks(ticket);
  callbacks.onRunFinished(usageLimitRun({ isTest: true, workingDirectory: null }));
  assert.equal(ticket.status, 'test');
  assert.equal(ticket.fail_count, 0);
  assert.equal(ticket.scheduled_start, RESET_AT);
});

test('a successful manual implementation run lets a halted ticket move on through test', () => {
  const ticket = { id: 'T-1', status: 'in_progress', assignee: 'codex', fail_count: 4, eval_fail_count: 0, agent: {} };
  const { callbacks, events } = makeCallbacks(ticket, { isManualRun: (run) => run.runId === 'manual-1' });
  callbacks.onRunFinished({
    runId: 'manual-1', ticketId: 'T-1', agentName: 'codex', state: 'completed', exitCode: 0,
    stdout: '', stderr: '', workingDirectory: null, finishedAt: new Date().toISOString()
  });
  assert.equal(ticket.status, 'test');
  assert.equal(ticket.fail_count, 0);
  assert.ok(events.includes('ticket.retry_budget_reset'));
});
