'use strict';

/**
 * Event type and severity constants for scheduler logging.
 */

const EVENT_TYPES = {
  // Scheduler lifecycle
  SCHEDULER_STARTED: 'scheduler.started',
  SCHEDULER_STOPPED: 'scheduler.stopped',

  // Ticket transitions
  TICKET_TODO_TO_BUILDING: 'ticket.todo_to_building',
  TICKET_BUILDING_TO_TODO: 'ticket.building_to_todo',
  TICKET_PICKUP: 'ticket.pickup',
  TICKET_HELD_FILE_CONFLICT: 'ticket.held_file_conflict',
  TICKET_SKIPPED_LOCKED: 'ticket.skipped_locked',

  // Run lifecycle
  RUN_STARTED: 'run.started',
  RUN_FINISHED: 'run.finished',
  RUN_FAILED: 'run.failed',

  // Auto-commit
  AUTOCOMMIT_SUCCESS: 'autocommit.success',
  AUTOCOMMIT_FAILURE: 'autocommit.failure',

  // Evaluation
  EVAL_TRIAL_MERGE: 'eval.trial_merge',
  EVAL_AUTO_REBASE: 'eval.auto_rebase',
  EVAL_PASS: 'eval.pass',
  EVAL_FAIL: 'eval.fail',
  EVAL_SQUASH_MERGE: 'eval.squash_merge',
  EVAL_SQUASH_CONFLICT: 'eval.squash_conflict',
  EVAL_PREPARATION_FAILED: 'eval.preparation_failed',

  // Ticket failure tracking
  TICKET_FAIL_COUNT_INCREMENTED: 'ticket.fail_count_incremented',
  TICKET_EVAL_FAIL_COUNT_INCREMENTED: 'ticket.eval_fail_count_incremented',
  TICKET_MAX_RETRIES_REACHED: 'ticket.max_retries_reached',

  // Agent lifecycle
  AGENT_PAUSE_DETECTED: 'agent.pause_detected',
  AGENT_RESUMED: 'agent.resumed',
  AGENT_CANCELLED: 'agent.cancelled',
  AGENT_MANUAL_START: 'agent.manual_start',

  // Cost tracking
  COST_RECORDED: 'cost.recorded',

  // Errors
  ERROR_CONFIG_READ_FAILURE: 'error.config_read_failure',
  ERROR_BACKLOG_READ_FAILURE: 'error.backlog_read_failure',
  ERROR_DISPATCH: 'error.dispatch',
  ERROR_WORKTREE: 'error.worktree'
};

const SEVERITIES = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
};

module.exports = { EVENT_TYPES, SEVERITIES };
