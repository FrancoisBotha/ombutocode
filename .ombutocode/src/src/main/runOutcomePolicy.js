'use strict';

/**
 * Ticket-level rules for run outcomes that are not the ticket's fault, shared
 * by the Electron (main.js) and headless (coreCallbacks.js) run-finished
 * handlers.
 */

const { detectProviderLimitFromRun } = require('./scheduler');

// Columns whose work is already on the ticket branch. A provider limit hit
// here retries the same phase rather than sending the ticket back to todo.
const LATER_PHASES = new Set(['test', 'eval', 'merging']);

/**
 * A failed run that stopped on a provider-side limit (429 usage limit, rate
 * limit, exhausted credit) is not a ticket failure: retrying straight away
 * only burns the retry budget in seconds. Instead the ticket is rescheduled:
 *
 * - reset time known: it stays in its column (todo for implementation) with
 *   `scheduled_start` set to the reset time, so the scheduler retries then;
 * - no reset time: it goes back to todo, unassigned, for a human to schedule.
 *
 * Mutates `ticket` and returns what was done, or null when the run was not
 * stopped by a provider limit (the caller then applies the normal rules).
 * The retry counters are never touched.
 *
 * @param {Object} ticket  backlog ticket (mutated)
 * @param {Object} run     finished run from the agent runtime
 * @param {Object} [options]
 * @param {string} [options.currentStatus] the column the run belonged to,
 *   when the caller has corrected a mismatched ticket.status
 * @returns {null | { action: 'rescheduled'|'unassigned', previousStatus: string, limitUntil: string|null, reason: string, note: string }}
 */
function applyProviderLimitOutcome(ticket, run, { currentStatus } = {}) {
  if (!ticket || !run || run.state !== 'failed') return null;
  const limit = detectProviderLimitFromRun(run);
  if (!limit) return null;

  const previousStatus = currentStatus || ticket.status;
  let action;
  let note;
  if (limit.limitUntil) {
    action = 'rescheduled';
    ticket.status = LATER_PHASES.has(previousStatus) ? previousStatus : 'todo';
    ticket.scheduled_start = limit.limitUntil;
    note = `Provider usage limit hit (${limit.reason}). Not counted as a failure; `
      + `the ${ticket.status} step will be retried after ${limit.limitUntil}.`;
  } else {
    action = 'unassigned';
    ticket.status = 'todo';
    ticket.assignee = 'NONE';
    ticket.scheduled_start = null;
    note = 'Provider usage limit hit, but the error gave no reset time. Not counted as a failure; '
      + 'the ticket was unassigned — schedule or reassign it once the limit resets.';
  }

  return { action, previousStatus, limitUntil: limit.limitUntil, reason: limit.reason, note };
}

/**
 * A human-started implementation run that succeeds is a deliberate override,
 * so the ticket gets a fresh retry budget. Without this a rescued ticket moves
 * to test but the scheduler's retry-limit gate still refuses to dispatch it.
 *
 * @returns {boolean} true when any counter was reset
 */
function resetRetryBudgetAfterManualSuccess(ticket, run, { isManualRun = false } = {}) {
  if (!ticket || !run || !isManualRun) return false;
  if (run.state !== 'completed' || run.isTest || run.isEval) return false;
  if (ticket.status === 'todo') return false;

  let changed = false;
  for (const key of ['fail_count', 'eval_fail_count']) {
    if (typeof ticket[key] === 'number' && ticket[key] > 0) {
      ticket[key] = 0;
      changed = true;
    }
  }
  return changed;
}

module.exports = { applyProviderLimitOutcome, resetRetryBudgetAfterManualSuccess };
