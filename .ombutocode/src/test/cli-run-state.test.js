const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateRunState,
  createRunTracker,
  describeBlocker,
  fingerprintTickets
} = require('../src/cli/runState');

const T0 = Date.parse('2026-08-30T00:00:00Z');
const claude = { tool: 'claude', model: 'opus-4.7' };
const ticket = (id, status, extra = {}) => ({ id, title: id, status, assignee: claude, dependencies: [], ...extra });

function evalWith(overrides) {
  return evaluateRunState({
    tickets: [],
    activeRuns: [],
    agentPauses: [],
    trackedIds: new Set(),
    mergeLanded: () => true,
    nowMs: T0,
    startedAtMs: T0,
    lastChangeAtMs: T0,
    maxSeconds: null,
    stallMs: 10 * 60 * 1000,
    mergeRevertCount: 0,
    maxMergeReverts: 3,
    ...overrides
  });
}

test('drained: nothing in flight, tracked tickets in review/done with merges on HEAD → exit 0', () => {
  const tickets = [ticket('A-1', 'review', { merge_commit_sha: 'aaa' }), ticket('A-2', 'done'), ticket('B-9', 'backlog')];
  const landed = [];
  const result = evalWith({ tickets, trackedIds: ['A-1', 'A-2'], mergeLanded: (t) => { landed.push(t.id); return true; } });
  assert.equal(result.outcome, 'drained');
  assert.equal(result.exitCode, 0);
  assert.deepEqual(landed, ['A-1']);
});

test('a review ticket whose merge is not reachable from HEAD blocks the drain', () => {
  const tickets = [ticket('A-1', 'review', { merge_commit_sha: 'aaa' })];
  const result = evalWith({ tickets, trackedIds: ['A-1'], mergeLanded: () => false });
  assert.equal(result.outcome, 'blocked');
  assert.equal(result.exitCode, 1);
  assert.match(result.reason, /not reachable from HEAD: A-1/);
});

test('active runs always mean continue, even past the stall window', () => {
  const tickets = [ticket('A-1', 'in_progress')];
  const result = evalWith({ tickets, activeRuns: [{ runId: 'r1', ticketId: 'A-1', state: 'running' }], lastChangeAtMs: T0 - 60 * 60 * 1000, nowMs: T0 });
  assert.equal(result.outcome, 'continue');
});

test('timeout wins over everything else → exit 3', () => {
  const tickets = [ticket('A-1', 'in_progress')];
  const result = evalWith({ tickets, activeRuns: [{ runId: 'r1' }], maxSeconds: 60, nowMs: T0 + 61_000 });
  assert.equal(result.outcome, 'timeout');
  assert.equal(result.exitCode, 3);
});

test('blocked: halted ticket (assignee NONE after max retries) with no active run → exit 1', () => {
  const tickets = [ticket('A-1', 'todo', { assignee: 'NONE', fail_count: 2 })];
  const result = evalWith({ tickets, trackedIds: ['A-1'] });
  assert.equal(result.outcome, 'blocked');
  assert.equal(result.exitCode, 1);
  assert.match(result.reason, /A-1 \(halted after 2 failed attempt\(s\)/);
  assert.deepEqual(result.details.blockers.map((b) => b.id), ['A-1']);
});

test('blocked: unassigned todo ticket and tickets waiting on a halted dependency', () => {
  const tickets = [
    ticket('A-1', 'todo', { assignee: null }),
    ticket('A-2', 'todo', { dependencies: ['A-1'] }),
    ticket('A-3', 'todo', { dependencies: ['Z-9'] })
  ];
  const result = evalWith({ tickets });
  assert.equal(result.outcome, 'blocked');
  const reasons = Object.fromEntries(result.details.blockers.map((b) => [b.id, b.reason]));
  assert.equal(reasons['A-1'], 'no coding-agent assignee');
  assert.equal(reasons['A-2'], 'waiting on A-1 (no coding-agent assignee)');
  assert.equal(reasons['A-3'], 'depends on unknown ticket Z-9');
});

test('continue while a dispatchable ticket waits for the scheduler; dependency in review counts as met', () => {
  const tickets = [ticket('A-1', 'review'), ticket('A-2', 'todo', { dependencies: ['A-1'] })];
  const result = evalWith({ tickets, trackedIds: ['A-1'] });
  assert.equal(result.outcome, 'continue');
  assert.equal(result.exitCode, null);
  assert.equal(describeBlocker(tickets[1], new Map(tickets.map((t) => [t.id, t]))), null);
});

test('a ticket waiting on an in-flight dependency that is itself dispatchable is not blocked', () => {
  const tickets = [ticket('A-1', 'todo'), ticket('A-2', 'todo', { dependencies: ['A-1'] })];
  const result = evalWith({ tickets });
  assert.equal(result.outcome, 'continue');
  assert.deepEqual(result.details.blockers, []);
});

test('stalled: dispatchable work but no change for the stall window and no active run → exit 1', () => {
  const tickets = [ticket('A-1', 'todo')];
  const fresh = evalWith({ tickets, lastChangeAtMs: T0 - 9 * 60 * 1000, nowMs: T0 });
  assert.equal(fresh.outcome, 'continue');
  const stale = evalWith({ tickets, lastChangeAtMs: T0 - 10 * 60 * 1000, nowMs: T0 });
  assert.equal(stale.outcome, 'stalled');
  assert.equal(stale.exitCode, 1);
});

test('provider pause keeps the run alive until the stall window', () => {
  const tickets = [ticket('A-1', 'todo', { assignee: 'NONE' })];
  const paused = evalWith({ tickets, agentPauses: [{ toolId: 'claude', isPaused: true }] });
  assert.equal(paused.outcome, 'continue');
  assert.match(paused.reason, /provider pause on claude/);
  const stale = evalWith({ tickets, agentPauses: [{ toolId: 'claude', isPaused: true }], lastChangeAtMs: T0 - 11 * 60 * 1000 });
  assert.equal(stale.outcome, 'stalled');
});

test('merge reverts beyond the limit → exit 1', () => {
  const result = evalWith({ tickets: [ticket('A-1', 'todo')], mergeRevertCount: 4, maxMergeReverts: 3 });
  assert.equal(result.outcome, 'merge_reverts');
  assert.equal(result.exitCode, 1);
});

test('tracked ticket demoted out of the pipeline is reported as blocked', () => {
  const result = evalWith({ tickets: [ticket('A-1', 'backlog')], trackedIds: ['A-1'] });
  assert.equal(result.outcome, 'blocked');
  assert.match(result.reason, /left the pipeline/);
});

test('run tracker records execution order, terminal times and merge reverts across polls', () => {
  let clock = T0;
  const tracker = createRunTracker({ now: () => new Date(clock) });

  tracker.observe([ticket('A-1', 'todo'), ticket('A-2', 'todo'), ticket('X-1', 'review')]);
  assert.deepEqual([...tracker.trackedIds], ['A-1', 'A-2']);
  assert.deepEqual(tracker.executionOrder, []);

  clock += 1000;
  tracker.observe([ticket('A-1', 'building'), ticket('A-2', 'todo')]);
  clock += 1000;
  tracker.observe([ticket('A-1', 'in_progress'), ticket('A-2', 'todo')], [{ runId: 'r1', ticketId: 'A-1', queueStatus: 'building', state: 'running' }]);
  assert.deepEqual(tracker.executionOrder, ['A-1']);
  assert.equal(tracker.phaseForRun('r1'), 'impl');

  clock += 1000;
  tracker.observe([ticket('A-1', 'eval'), ticket('A-2', 'in_progress')], [{ runId: 'r2', ticketId: 'A-1', queueStatus: 'eval' }, { runId: 'r3', ticketId: 'A-2', queueStatus: 'todo' }]);
  assert.deepEqual(tracker.executionOrder, ['A-1', 'A-2']);
  assert.equal(tracker.phaseForRun('r2'), 'eval');

  // squash-merge conflict: ticket goes back to todo with agent.state merge_failed
  clock += 1000;
  tracker.observe([ticket('A-1', 'todo', { agent: { state: 'merge_failed' } }), ticket('A-2', 'in_progress')]);
  assert.equal(tracker.mergeRevertCount, 1);
  clock += 1000;
  tracker.observe([ticket('A-1', 'merging', { agent: { state: 'merge_failed' } }), ticket('A-2', 'in_progress')], [{ runId: 'r4', ticketId: 'A-1', queueStatus: 'merging' }]);
  assert.equal(tracker.mergeRevertCount, 1, 'staying merge_failed while merging is not another revert');
  assert.equal(tracker.phaseForRun('r4'), 'merge_resolve');

  clock += 1000;
  tracker.observe([ticket('A-1', 'review', { merge_commit_sha: 'abc' }), ticket('A-2', 'review')]);
  assert.equal(tracker.getRecord('A-1').finishedAt, new Date(clock).toISOString());
  assert.equal(tracker.getRecord('A-1').firstBuildingAt, new Date(T0 + 1000).toISOString());
  assert.equal(tracker.lastChangeAtMs, clock);

  // nothing changes → lastChangeAt stays put
  clock += 5000;
  tracker.observe([ticket('A-1', 'review', { merge_commit_sha: 'abc' }), ticket('A-2', 'review')]);
  assert.equal(tracker.lastChangeAtMs, clock - 5000);
});

test('fingerprint changes when status, fail_count or active runs change', () => {
  const a = fingerprintTickets([ticket('A-1', 'todo')], []);
  assert.equal(a, fingerprintTickets([ticket('A-1', 'todo')], []));
  assert.notEqual(a, fingerprintTickets([ticket('A-1', 'building')], []));
  assert.notEqual(a, fingerprintTickets([ticket('A-1', 'todo', { fail_count: 1 })], []));
  assert.notEqual(a, fingerprintTickets([ticket('A-1', 'todo')], [{ runId: 'r', state: 'running' }]));
});
