const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  createMergeLandedCheck,
  readAgentLogEntries,
  readRunPhasesFromSchedulerLogs,
  buildTicketResults
} = require('../src/cli/run');
const { createRunTracker } = require('../src/cli/runState');

test('createMergeLandedCheck uses the recorded sha, then the [ID] squash commit, then branch deletion', () => {
  const calls = [];
  const gitImpl = {
    isAncestorOfHead: (cwd, sha) => { calls.push(['ancestor', sha]); return sha === 'good'; },
    findSquashCommitForTicket: (cwd, id) => { calls.push(['grep', id]); return id === 'B-2' ? 'abc' : null; },
    branchExists: (cwd, branch) => { calls.push(['branch', branch]); return branch === 'ticket/C-3'; }
  };
  const landed = createMergeLandedCheck('/repo', gitImpl);
  assert.equal(landed({ id: 'A-1', merge_commit_sha: 'good' }), true);
  assert.equal(landed({ id: 'A-1', merge_commit_sha: 'good' }), true, 'positive result is memoised');
  assert.equal(calls.filter((c) => c[0] === 'ancestor').length, 1);
  assert.equal(landed({ id: 'A-9', merge_commit_sha: 'bad' }), false);
  assert.equal(landed({ id: 'B-2' }), true, 'no sha but a [B-2] commit on HEAD');
  assert.equal(landed({ id: 'C-3' }), false, 'no sha, no commit, branch still exists');
  assert.equal(landed({ id: 'D-4' }), true, 'no sha, no commit, branch deleted after merge');
  assert.equal(landed(null), null);
});

test('readAgentLogEntries reads JSONL from an offset and skips malformed lines', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ombuto-runlog-'));
  const file = path.join(dir, 'codingagent-runs.jsonl');
  const before = '{"event":"run_started","runId":"old"}\n';
  fs.writeFileSync(file, before);
  const offset = fs.statSync(file).size;
  fs.appendFileSync(file, '{"event":"run_started","runId":"r1"}\nnot json\n{"event":"run_finished","runId":"r1"}\n');
  assert.deepEqual(readAgentLogEntries(file, offset).map((e) => `${e.event}:${e.runId}`), ['run_started:r1', 'run_finished:r1']);
  assert.deepEqual(readAgentLogEntries(file, 0).length, 3);
  assert.deepEqual(readAgentLogEntries(path.join(dir, 'missing.jsonl'), 0), []);
});

test('run phases come from ticket.status_changed events, keyed by run id', () => {
  const logsDb = {
    readLogs: () => ({
      logs: [
        { run_id: 'r3', event_type: 'ticket.status_changed', details: JSON.stringify({ from: 'eval', to: 'review' }) },
        { run_id: 'r2', event_type: 'ticket.status_changed', details: JSON.stringify({ from: 'test', to: 'eval' }) },
        { run_id: 'r1', event_type: 'ticket.status_changed', details: { from: 'in_progress', to: 'test' } },
        { run_id: 'r1', event_type: 'ticket.status_changed', details: JSON.stringify({ from: 'building', to: 'in_progress' }) },
        { run_id: 'r4', event_type: 'ticket.status_changed', details: JSON.stringify({ from: 'merging', to: 'review' }) },
        { run_id: 'zz', event_type: 'ticket.status_changed', details: 'garbage' }
      ]
    })
  };
  const phases = readRunPhasesFromSchedulerLogs(logsDb, new Set(['r1', 'r2', 'r3', 'r4', 'zz']));
  assert.deepEqual([...phases.entries()].sort(), [['r1', 'impl'], ['r2', 'test'], ['r3', 'eval'], ['r4', 'merge_resolve']]);
  assert.equal(readRunPhasesFromSchedulerLogs(null, new Set(['r1'])).size, 0);
});

test('buildTicketResults joins the tracker, the agent log and the scheduler log into manifest rows', () => {
  let clock = Date.parse('2026-08-30T00:00:00Z');
  const tracker = createRunTracker({ now: () => new Date(clock) });
  tracker.observe([{ id: 'T-1', status: 'todo', assignee: { tool: 'claude' }, dependencies: [] }]);
  clock += 1000;
  tracker.observe([{ id: 'T-1', status: 'in_progress', assignee: { tool: 'claude' }, dependencies: [] }], [{ runId: 'r1', ticketId: 'T-1', queueStatus: 'building', startedAt: '2026-08-30T00:00:01.000Z' }]);
  clock += 1000;
  tracker.observe([{ id: 'T-1', status: 'review', assignee: { tool: 'claude' }, dependencies: [], merge_commit_sha: 'abc', run_log_index: [{ runId: 'r2', phase: 'test' }] }]);

  const logEntries = [
    { event: 'run_started', runId: 'r1', ticketId: 'T-1', agentName: 'claude', startedAt: '2026-08-30T00:00:01.000Z' },
    { event: 'run_finished', runId: 'r1', ticketId: 'T-1', agentName: 'claude', state: 'completed', startedAt: '2026-08-30T00:00:01.000Z', finishedAt: '2026-08-30T00:00:01.500Z', durationMs: 500, exitCode: 0 },
    { event: 'run_finished', runId: 'r2', ticketId: 'T-1', agentName: 'claude', state: 'completed', startedAt: '2026-08-30T00:00:01.600Z', finishedAt: '2026-08-30T00:00:01.900Z', durationMs: 300, exitCode: 0 },
    { event: 'run_started', runId: 'r3', ticketId: 'T-1', agentName: 'claude', startedAt: '2026-08-30T00:00:01.950Z' },
    { event: 'run_finished', runId: 'r9', ticketId: 'OTHER', agentName: 'codex', state: 'failed', exitCode: 1 }
  ];
  const logsDb = { readLogs: () => ({ logs: [{ run_id: 'r3', details: JSON.stringify({ from: 'eval', to: 'review' }) }] }) };
  const tickets = [{ id: 'T-1', title: 'One', status: 'review', assignee: { tool: 'claude' }, dependencies: ['T-0'], fail_count: 0, merge_commit_sha: 'abc', run_log_index: [{ runId: 'r2', phase: 'test' }] }];

  const results = buildTicketResults({ tickets, tracker, logEntries, mergeLanded: () => true, logsDb });
  assert.equal(results.length, 1);
  const row = results[0];
  assert.equal(row.id, 'T-1');
  assert.equal(row.finalStatus, 'review');
  assert.deepEqual(row.dependencies, ['T-0']);
  assert.deepEqual(row.assignee, { tool: 'claude' });
  assert.equal(row.mergeCommitSha, 'abc');
  assert.equal(row.mergeLanded, true);
  assert.equal(row.startedAt, '2026-08-30T00:00:01.000Z');
  assert.equal(row.finishedAt, '2026-08-30T00:00:02.000Z');
  assert.deepEqual(row.runs.map((r) => `${r.runId}:${r.phase}:${r.state}:${r.exitCode}:${r.durationMs}`), [
    'r1:impl:completed:0:500',
    'r2:test:completed:0:300',
    'r3:eval:unfinished:null:null'
  ]);
  assert.deepEqual(tracker.executionOrder, ['T-1']);
});
