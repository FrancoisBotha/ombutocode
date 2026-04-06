const test = require('node:test');
const assert = require('node:assert/strict');

const { cleanupOnDoneTransition } = require('../src/main/statusTransitionCleanup');

test('cleanupOnDoneTransition removes worktree when entering done from non-cleanup status', async () => {
  const calls = [];
  const response = await cleanupOnDoneTransition({
    ticketId: 'GIT_WT-007',
    previousStatus: 'in_progress',
    newStatus: 'done',
    projectRoot: '/tmp/project',
    removeTicketWorktree: async (ticketId, options) => {
      calls.push({ ticketId, options });
      return { removedWorktree: true, removedBranch: true };
    }
  });

  assert.equal(response.cleanupAttempted, true);
  assert.equal(response.cleanupSucceeded, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].ticketId, 'GIT_WT-007');
  assert.equal(calls[0].options.projectRoot, '/tmp/project');
});

test('cleanupOnDoneTransition removes worktree when entering review', async () => {
  const calls = [];
  const response = await cleanupOnDoneTransition({
    ticketId: 'GIT_WT-008',
    previousStatus: 'eval',
    newStatus: 'review',
    projectRoot: '/tmp/project',
    removeTicketWorktree: async (ticketId, options) => {
      calls.push({ ticketId, options });
      return { removedWorktree: true, removedBranch: true };
    }
  });

  assert.equal(response.cleanupAttempted, true);
  assert.equal(response.cleanupSucceeded, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].ticketId, 'GIT_WT-008');
});

test('cleanupOnDoneTransition does not cleanup when status is unchanged done', async () => {
  let called = false;
  const response = await cleanupOnDoneTransition({
    ticketId: 'GIT_WT-007',
    previousStatus: 'done',
    newStatus: 'done',
    projectRoot: '/tmp/project',
    removeTicketWorktree: async () => {
      called = true;
      return {};
    }
  });

  assert.equal(response.cleanupAttempted, false);
  assert.equal(response.cleanupSucceeded, false);
  assert.equal(called, false);
});

test('cleanupOnDoneTransition does not cleanup when moving between cleanup statuses', async () => {
  let called = false;
  const response = await cleanupOnDoneTransition({
    ticketId: 'GIT_WT-009',
    previousStatus: 'review',
    newStatus: 'done',
    projectRoot: '/tmp/project',
    removeTicketWorktree: async () => {
      called = true;
      return { removedWorktree: false, removedBranch: false };
    }
  });

  // review -> done: review is already a cleanup status, so no re-cleanup
  assert.equal(response.cleanupAttempted, false);
  assert.equal(called, false);
});

test('cleanupOnDoneTransition does not cleanup for non-cleanup transitions', async () => {
  let called = false;
  const response = await cleanupOnDoneTransition({
    ticketId: 'GIT_WT-010',
    previousStatus: 'todo',
    newStatus: 'in_progress',
    projectRoot: '/tmp/project',
    removeTicketWorktree: async () => {
      called = true;
      return {};
    }
  });

  assert.equal(response.cleanupAttempted, false);
  assert.equal(called, false);
});

test('cleanupOnDoneTransition logs warning and does not throw on cleanup failure', async () => {
  const warnings = [];
  const response = await cleanupOnDoneTransition({
    ticketId: 'GIT_WT-007',
    previousStatus: 'eval',
    newStatus: 'review',
    projectRoot: '/tmp/project',
    removeTicketWorktree: async () => {
      throw new Error('locked files');
    },
    logger: {
      warn: (message) => warnings.push(message)
    }
  });

  assert.equal(response.cleanupAttempted, true);
  assert.equal(response.cleanupSucceeded, false);
  assert.equal(response.error, 'locked files');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Failed to cleanup worktree\/branch/);
});
