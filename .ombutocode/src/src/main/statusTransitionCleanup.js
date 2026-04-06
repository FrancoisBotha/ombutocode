'use strict';

const { removeWorktree } = require('./worktreeManager');

// Statuses where the worktree is no longer needed.
// 'review' = squash merge already happened during eval pass.
// 'done' = ticket fully completed.
const CLEANUP_STATUSES = new Set(['review', 'done']);

async function cleanupOnDoneTransition({
  ticketId,
  previousStatus,
  newStatus,
  projectRoot,
  removeTicketWorktree = removeWorktree,
  logger = console
}) {
  const shouldCleanup = CLEANUP_STATUSES.has(newStatus) && !CLEANUP_STATUSES.has(previousStatus);
  if (!shouldCleanup) {
    return {
      cleanupAttempted: false,
      cleanupSucceeded: false
    };
  }

  try {
    const result = await removeTicketWorktree(ticketId, { projectRoot });
    return {
      cleanupAttempted: true,
      cleanupSucceeded: true,
      result
    };
  } catch (error) {
    const message = error?.message || String(error);
    logger.warn(
      `[WorktreeCleanup] Failed to cleanup worktree/branch for ${ticketId}: ${message}`
    );
    return {
      cleanupAttempted: true,
      cleanupSucceeded: false,
      error: message
    };
  }
}

module.exports = {
  cleanupOnDoneTransition
};
