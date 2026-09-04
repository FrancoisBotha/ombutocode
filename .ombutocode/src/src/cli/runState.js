'use strict';

/**
 * Pure decision logic for `headless.js run --until drained`.
 *
 * The run loop polls the backlog and the scheduler, folds the observations
 * into a tracker (`createRunTracker`) and asks `evaluateRunState` what to do.
 * Nothing in here touches the DB, git, or timers, so the drained / blocked /
 * stalled / timeout paths are unit-testable over plain ticket lists.
 */

const IN_FLIGHT_STATUSES = new Set(['todo', 'building', 'in_progress', 'test', 'eval', 'merging']);
const TERMINAL_STATUSES = new Set(['review', 'done', 'archived']);
// The scheduler treats a dependency in review as met.
const DEPENDENCY_MET_STATUSES = new Set(['review', 'done', 'archived']);

const DEFAULT_STALL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_MERGE_REVERTS = 3;

const OUTCOME_EXIT_CODES = {
  continue: null,
  drained: 0,
  blocked: 1,
  stalled: 1,
  merge_reverts: 1,
  timeout: 3,
  interrupted: 1
};

function normalizeStatus(ticket) {
  return String(ticket?.status || '').trim().toLowerCase();
}

/** Same rule as the scheduler's hasExplicitAssignee. */
function hasExplicitAssignee(ticket) {
  const assignee = ticket?.assignee;
  if (assignee && typeof assignee === 'object') {
    return String(assignee.tool || '').trim().length > 0;
  }
  const str = String(assignee || '').trim().toLowerCase();
  if (str === 'human') return false;
  return str.length > 0 && str !== 'none' && str !== 'null';
}

function dependenciesOf(ticket) {
  return Array.isArray(ticket?.dependencies) ? ticket.dependencies.map((d) => String(d)) : [];
}

/**
 * Explain why an in-flight ticket cannot be dispatched right now, or null
 * when the scheduler should be able to pick it up.
 */
function describeBlocker(ticket, byId) {
  const status = normalizeStatus(ticket);
  if (status === 'todo' || status === 'building') {
    if (!hasExplicitAssignee(ticket)) {
      const failCount = Number(ticket.fail_count) || 0;
      return failCount > 0
        ? `halted after ${failCount} failed attempt(s) (assignee set to NONE)`
        : 'no coding-agent assignee';
    }
    for (const depId of dependenciesOf(ticket)) {
      const dep = byId.get(depId);
      if (!dep) return `depends on unknown ticket ${depId}`;
      const depStatus = normalizeStatus(dep);
      if (!DEPENDENCY_MET_STATUSES.has(depStatus)) {
        const depBlocker = IN_FLIGHT_STATUSES.has(depStatus) ? describeBlocker(dep, byId) : `${depId} is ${depStatus || 'unknown'}`;
        if (depBlocker) return `waiting on ${depId} (${depBlocker})`;
        return null; // dependency is still progressing
      }
    }
  }
  return null;
}

/**
 * Decide whether the run loop should continue or exit.
 *
 * @param {Object} input
 * @param {Array}  input.tickets           current backlog tickets
 * @param {Array}  input.activeRuns        scheduler.getStatus().activeRuns
 * @param {Array}  [input.agentPauses]     scheduler.getStatus().agentPauses
 * @param {Set|Array} input.trackedIds     ids ever seen in flight during this run
 * @param {Function} [input.mergeLanded]   (ticket) => true | false | null
 * @param {number} input.nowMs
 * @param {number} input.startedAtMs
 * @param {number} input.lastChangeAtMs
 * @param {number} [input.maxSeconds]
 * @param {number} [input.stallMs]
 * @param {number} [input.mergeRevertCount]
 * @param {number} [input.maxMergeReverts]
 * @returns {{ outcome: string, exitCode: number|null, reason: string, details: Object }}
 */
function evaluateRunState(input = {}) {
  const {
    tickets = [],
    activeRuns = [],
    agentPauses = [],
    trackedIds = new Set(),
    mergeLanded = () => null,
    nowMs = Date.now(),
    startedAtMs = nowMs,
    lastChangeAtMs = startedAtMs,
    maxSeconds = null,
    stallMs = DEFAULT_STALL_MS,
    mergeRevertCount = 0,
    maxMergeReverts = DEFAULT_MAX_MERGE_REVERTS
  } = input;

  const tracked = trackedIds instanceof Set ? trackedIds : new Set(trackedIds);
  const byId = new Map(tickets.filter((t) => t?.id).map((t) => [String(t.id), t]));
  const inFlight = tickets.filter((t) => IN_FLIGHT_STATUSES.has(normalizeStatus(t)));
  const finish = (outcome, reason, details = {}) => ({
    outcome,
    exitCode: OUTCOME_EXIT_CODES[outcome],
    reason,
    details: { inFlight: inFlight.map((t) => t.id), activeRuns: activeRuns.length, ...details }
  });

  if (Number.isFinite(maxSeconds) && maxSeconds > 0 && nowMs - startedAtMs >= maxSeconds * 1000) {
    return finish('timeout', `--max-seconds ${maxSeconds} budget exhausted`);
  }
  if (Number.isFinite(maxMergeReverts) && mergeRevertCount > maxMergeReverts) {
    return finish('merge_reverts', `scheduler reverted a merge ${mergeRevertCount} times (limit ${maxMergeReverts})`);
  }

  if (activeRuns.length > 0) {
    return finish('continue', `${activeRuns.length} active run(s)`);
  }

  const stalled = Number.isFinite(stallMs) && stallMs > 0 && nowMs - lastChangeAtMs >= stallMs;

  if (inFlight.length === 0) {
    const notLanded = [];
    for (const id of tracked) {
      const ticket = byId.get(String(id));
      if (!ticket) continue; // deleted / archived out of the backlog
      const status = normalizeStatus(ticket);
      if (!TERMINAL_STATUSES.has(status)) {
        // Tracked but neither in flight nor terminal (e.g. demoted to backlog).
        return finish('blocked', `ticket ${ticket.id} left the pipeline with status "${status}"`, {
          blockers: [{ id: ticket.id, status, reason: 'left the pipeline' }]
        });
      }
      if (status === 'review' && mergeLanded(ticket) === false) {
        notLanded.push(ticket.id);
      }
    }
    if (notLanded.length > 0) {
      return finish('blocked', `merged ticket(s) not reachable from HEAD: ${notLanded.join(', ')}`, {
        blockers: notLanded.map((id) => ({ id, status: 'review', reason: 'merge commit not on HEAD' }))
      });
    }
    return finish('drained', 'no ticket in flight, every tracked ticket is review/done and its merge is on HEAD');
  }

  const paused = (agentPauses || []).filter((p) => p?.isPaused);
  const blockers = [];
  let dispatchable = 0;
  for (const ticket of inFlight) {
    const blocker = describeBlocker(ticket, byId);
    if (blocker) blockers.push({ id: ticket.id, status: normalizeStatus(ticket), reason: blocker });
    else dispatchable += 1;
  }

  if (dispatchable === 0 && blockers.length > 0 && paused.length === 0) {
    return finish('blocked', `no active run and no dispatchable ticket: ${blockers.map((b) => `${b.id} (${b.reason})`).join('; ')}`, { blockers });
  }
  if (stalled) {
    return finish('stalled', `no change for ${Math.round((nowMs - lastChangeAtMs) / 60000)} min with no active run`, {
      blockers,
      paused: paused.map((p) => p.toolId || p.agentName || null)
    });
  }
  if (paused.length > 0 && dispatchable === 0) {
    return finish('continue', `provider pause on ${paused.map((p) => p.toolId || p.agentName).join(', ')}`, { paused: paused.map((p) => p.toolId || p.agentName || null) });
  }
  return finish('continue', `${dispatchable} dispatchable ticket(s) waiting for the scheduler`, { blockers });
}

/**
 * Fingerprint the parts of the backlog that mean "something happened" — used
 * for stall detection. Timestamps are included so retries count as change.
 */
function fingerprintTickets(tickets, activeRuns = []) {
  const parts = tickets.map((t) => [
    t.id,
    normalizeStatus(t),
    t.last_updated || '',
    t.agent?.state || '',
    t.agent?.run_id || '',
    Number(t.fail_count) || 0,
    t.merge_commit_sha || ''
  ].join(':'));
  parts.push(...activeRuns.map((r) => `run:${r.runId}:${r.state}`));
  return parts.sort().join('|');
}

/**
 * Accumulates per-ticket observations across polls: first time seen
 * building / in progress, first terminal time, run phases, merge reverts.
 */
function createRunTracker({ now = () => new Date() } = {}) {
  const tracked = new Map(); // id → { firstInFlightAt, firstBuildingAt, finishedAt, lastStatus, lastAgentState }
  const executionOrder = [];
  const runPhaseByRunId = new Map();
  let mergeRevertCount = 0;
  let lastFingerprint = null;
  let lastChangeAt = now().getTime();

  function observe(tickets, activeRuns = []) {
    const ts = now().toISOString();
    for (const ticket of tickets) {
      if (!ticket?.id) continue;
      const status = normalizeStatus(ticket);
      const entry = tracked.get(ticket.id);
      if (!entry && !IN_FLIGHT_STATUSES.has(status)) continue;
      const record = entry || {
        firstInFlightAt: ts,
        firstBuildingAt: null,
        finishedAt: null,
        lastStatus: null,
        lastAgentState: null
      };
      if (!entry) tracked.set(ticket.id, record);

      const inProgressish = status === 'building' || status === 'in_progress' || status === 'test' || status === 'eval' || status === 'merging';
      if (!record.firstBuildingAt && inProgressish) {
        record.firstBuildingAt = ts;
        executionOrder.push(ticket.id);
      }
      if (TERMINAL_STATUSES.has(status)) {
        if (!record.finishedAt) record.finishedAt = ts;
      } else {
        record.finishedAt = null;
      }

      const agentState = ticket.agent?.state || null;
      if ((agentState === 'merge_failed' || agentState === 'merge_aborted')
        && record.lastAgentState !== agentState
        && record.lastStatus !== 'merging') {
        mergeRevertCount += 1;
      }
      record.lastAgentState = agentState;
      record.lastStatus = status;
    }

    for (const run of activeRuns) {
      if (!run?.runId) continue;
      const queueStatus = run.queueStatus || null;
      const phase = queueStatus === 'test' ? 'test'
        : queueStatus === 'eval' ? 'eval'
          : queueStatus === 'merging' ? 'merge_resolve'
            : 'impl';
      if (!runPhaseByRunId.has(run.runId)) runPhaseByRunId.set(run.runId, phase);
      const record = tracked.get(run.ticketId);
      if (record && !record.firstBuildingAt) {
        record.firstBuildingAt = run.startedAt || ts;
        executionOrder.push(run.ticketId);
      }
    }

    const fingerprint = fingerprintTickets(tickets, activeRuns);
    if (fingerprint !== lastFingerprint) {
      lastFingerprint = fingerprint;
      lastChangeAt = now().getTime();
    }
  }

  return {
    observe,
    get trackedIds() { return new Set(tracked.keys()); },
    get executionOrder() { return [...executionOrder]; },
    get mergeRevertCount() { return mergeRevertCount; },
    get lastChangeAtMs() { return lastChangeAt; },
    getRecord: (id) => tracked.get(id) || null,
    phaseForRun: (runId) => runPhaseByRunId.get(runId) || null
  };
}

module.exports = {
  IN_FLIGHT_STATUSES,
  TERMINAL_STATUSES,
  DEPENDENCY_MET_STATUSES,
  DEFAULT_STALL_MS,
  DEFAULT_MAX_MERGE_REVERTS,
  OUTCOME_EXIT_CODES,
  hasExplicitAssignee,
  describeBlocker,
  evaluateRunState,
  fingerprintTickets,
  createRunTracker
};
