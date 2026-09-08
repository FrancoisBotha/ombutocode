const test = require('node:test');
const assert = require('node:assert/strict');

const { createRuntimeCallbacks } = require('../src/main/coreCallbacks');

// Minimal harness: a single in-memory ticket and no-op collaborators, enough
// to exercise onRunStarted's assignee handling and onRunFinished's log retention.
function makeHarness({ ticket, isRunOutputRetained = () => false, isRunSummaryEnabled = () => false }) {
  const removed = [];
  const runOutputFilesByRunId = new Map();
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
    removeRunOutputFile: (p) => { if (p) removed.push(p); },
    runOutputFilesByRunId,
    logSchedulerEvent: () => {},
    appendTicketNote: () => {},
    formatCommandLine: () => 'cmd',
    shorten: (s) => s,
    NOTE_OUTPUT_LIMIT: 4000,
    summarizeSquashMergeFailure: () => '',
    summarizeTrialMergeFailure: () => '',
    readMaxEvalRetries: () => 2,
    projectRoot: process.cwd(),
    onTitleBrandingUpdate: null,
    isRunSummaryEnabled,
    isRunOutputRetained
  });
  callbacks.setScheduler({ onRunFinished: () => {}, dispatch: () => {} });
  return { callbacks, removed };
}

function startedRun(overrides = {}) {
  return {
    runId: 'run-1', ticketId: 'T-1', agentName: 'claude', state: 'running',
    startedAt: new Date().toISOString(), pid: 1, command: 'claude', args: [], ...overrides
  };
}

test('onRunStarted keeps an explicit { tool, model } assignee for the same tool', () => {
  const ticket = { id: 'T-1', status: 'todo', assignee: { tool: 'claude', model: 'sonnet-4.6' }, fail_count: 0 };
  const { callbacks } = makeHarness({ ticket });
  callbacks.onRunStarted(startedRun());
  assert.deepEqual(ticket.assignee, { tool: 'claude', model: 'sonnet-4.6' });
  assert.equal(ticket.status, 'in_progress');
});

test('onRunStarted keeps a string assignee that already names the running tool', () => {
  const ticket = { id: 'T-1', status: 'todo', assignee: 'Claude', fail_count: 0 };
  const { callbacks } = makeHarness({ ticket });
  callbacks.onRunStarted(startedRun());
  assert.equal(ticket.assignee, 'Claude');
});

test('onRunStarted records the tool when the ticket had no assignee for it', () => {
  const ticket = { id: 'T-1', status: 'todo', assignee: null, fail_count: 0 };
  const { callbacks } = makeHarness({ ticket });
  callbacks.onRunStarted(startedRun());
  assert.equal(ticket.assignee, 'claude');
});

test('onRunFinished deletes transcripts of a successful run by default', () => {
  const ticket = { id: 'T-1', status: 'in_progress', assignee: 'claude', fail_count: 0, agent: {} };
  const { callbacks, removed } = makeHarness({ ticket });
  callbacks.onRunStarted(startedRun());
  callbacks.onRunFinished(startedRun({ state: 'completed', exitCode: 0, finishedAt: new Date().toISOString(), durationMs: 5, stdout: '', stderr: '', workingDirectory: null }));
  assert.deepEqual(removed.sort(), ['/out/run-1.stderr.log', '/out/run-1.stdout.log']);
});

test('onRunFinished keeps transcripts of a successful run when retain_run_output is on', () => {
  const ticket = { id: 'T-1', status: 'in_progress', assignee: 'claude', fail_count: 0, agent: {} };
  const { callbacks, removed } = makeHarness({ ticket, isRunOutputRetained: () => true });
  callbacks.onRunStarted(startedRun());
  callbacks.onRunFinished(startedRun({ state: 'completed', exitCode: 0, finishedAt: new Date().toISOString(), durationMs: 5, stdout: '', stderr: '', workingDirectory: null }));
  assert.deepEqual(removed, []);
  assert.equal(ticket.agent.stdout_log_file, 'run-output/run-1.stdout.log');
});

// Merge-resolve failures have their own budget: a merge conflict is caused by
// other tickets landing on main, not by this ticket's code, so it must not
// consume the test/eval retry allowance.
function mergeFailedRun(n) {
  return startedRun({ runId: `mr-${n}`, state: 'failed', exitCode: 1, finishedAt: new Date().toISOString(), durationMs: 5, stdout: '', stderr: '', workingDirectory: null });
}

test('a failed merge-resolve does not touch fail_count and halts only on its own cap', () => {
  const ticket = { id: 'T-1', status: 'merging', assignee: { tool: 'claude', model: 'm' }, fail_count: 2, agent: {} };
  const { callbacks } = makeHarness({ ticket });
  callbacks.onRunFinished(mergeFailedRun(1));
  assert.equal(ticket.fail_count, 2, 'eval/test budget untouched');
  assert.equal(ticket.merge_fail_count, 1);
  assert.equal(ticket.status, 'todo');
  assert.deepEqual(ticket.assignee, { tool: 'claude', model: 'm' }, 'not halted after one merge failure');

  ticket.status = 'merging';
  callbacks.onRunFinished(mergeFailedRun(2));
  ticket.status = 'merging';
  callbacks.onRunFinished(mergeFailedRun(3));
  assert.equal(ticket.merge_fail_count, 3);
  assert.equal(ticket.assignee, 'NONE', 'halted at the merge cap (default 3)');
  assert.equal(ticket.fail_count, 2, 'still untouched');
});

