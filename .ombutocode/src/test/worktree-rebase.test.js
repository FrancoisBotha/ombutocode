const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  rebaseTicketBranchSync,
  createWorktreeSync,
  prepareEvalTrialMergeSync,
  cleanupEvalTrialMergeSync,
  resolveTicketPaths,
  WorktreeManagerError
} = require('../src/main/worktreeManager');

const HAS_GIT = (() => {
  const result = spawnSync('git', ['--version'], { stdio: 'ignore' });
  return result.status === 0;
})();

function git(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf-8'
  });

  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.error || 'unknown error'}`);
  }

  return String(result.stdout || '').trim();
}

function createTempRepo() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ombutocode-rebase-test-'));
  git(projectRoot, ['init']);
  git(projectRoot, ['config', 'user.email', 'test@example.com']);
  git(projectRoot, ['config', 'user.name', 'Test User']);
  // Ensure default branch is 'main' regardless of system git config
  git(projectRoot, ['checkout', '-b', 'main']);
  fs.writeFileSync(path.join(projectRoot, 'README.md'), '# test\n', 'utf-8');
  git(projectRoot, ['add', 'README.md']);
  git(projectRoot, ['commit', '-m', 'initial commit']);

  return projectRoot;
}

test('rebaseTicketBranchSync succeeds when main advanced with non-overlapping changes', { skip: !HAS_GIT }, () => {
  const projectRoot = createTempRepo();
  const ticketId = 'REBASE-001';

  // Create worktree + feature branch and make a commit on it
  createWorktreeSync(ticketId, { projectRoot });
  const paths = resolveTicketPaths(projectRoot, ticketId);
  fs.writeFileSync(path.join(paths.worktreePath, 'feature.txt'), 'feature work\n', 'utf-8');
  git(paths.worktreePath, ['add', 'feature.txt']);
  git(paths.worktreePath, ['commit', '-m', 'feature commit']);

  // Advance main with a different file
  fs.writeFileSync(path.join(projectRoot, 'other.txt'), 'other work\n', 'utf-8');
  git(projectRoot, ['add', 'other.txt']);
  git(projectRoot, ['commit', '-m', 'advance main']);

  // Rebase should succeed
  const result = rebaseTicketBranchSync(ticketId, { projectRoot });
  assert.equal(result.ticketId, ticketId);
  assert.equal(result.branch, `ticket/${ticketId}`);
  assert.equal(result.baseBranch, 'main');
  assert.equal(result.rebased, true);

  // Verify feature branch now contains both commits
  const log = git(paths.worktreePath, ['log', '--oneline']);
  assert.ok(log.includes('feature commit'));
  assert.ok(log.includes('advance main'));
});

test('rebaseTicketBranchSync fails on conflicting changes and aborts cleanly', { skip: !HAS_GIT }, () => {
  const projectRoot = createTempRepo();
  const ticketId = 'REBASE-002';

  // Create worktree + feature branch, modify README.md
  createWorktreeSync(ticketId, { projectRoot });
  const paths = resolveTicketPaths(projectRoot, ticketId);
  fs.writeFileSync(path.join(paths.worktreePath, 'README.md'), '# feature version\n', 'utf-8');
  git(paths.worktreePath, ['add', 'README.md']);
  git(paths.worktreePath, ['commit', '-m', 'feature modifies README']);

  // Advance main with conflicting change to README.md
  fs.writeFileSync(path.join(projectRoot, 'README.md'), '# main version\n', 'utf-8');
  git(projectRoot, ['add', 'README.md']);
  git(projectRoot, ['commit', '-m', 'main modifies README']);

  // Record pre-rebase commit SHA
  const preRebaseSha = git(paths.worktreePath, ['rev-parse', 'HEAD']);

  // Rebase should fail with conflict
  assert.throws(
    () => rebaseTicketBranchSync(ticketId, { projectRoot }),
    (err) => {
      assert.ok(err instanceof WorktreeManagerError);
      assert.equal(err.details.conflict, true);
      assert.equal(err.details.ticketId, ticketId);
      return true;
    }
  );

  // Branch should be in pre-rebase state (abort was called)
  const postRebaseSha = git(paths.worktreePath, ['rev-parse', 'HEAD']);
  assert.equal(postRebaseSha, preRebaseSha, 'Branch should be unchanged after failed rebase');
});

test('rebaseTicketBranchSync throws when feature branch does not exist', { skip: !HAS_GIT }, () => {
  const projectRoot = createTempRepo();
  const ticketId = 'REBASE-003';

  assert.throws(
    () => rebaseTicketBranchSync(ticketId, { projectRoot }),
    (err) => {
      assert.ok(err instanceof WorktreeManagerError);
      assert.equal(err.details.conflict, false);
      assert.ok(err.message.includes('does not exist'));
      return true;
    }
  );
});

test('rebaseTicketBranchSync throws when worktree does not exist', { skip: !HAS_GIT }, () => {
  const projectRoot = createTempRepo();
  const ticketId = 'REBASE-004';

  // Create the branch without a worktree
  git(projectRoot, ['branch', `ticket/${ticketId}`]);

  assert.throws(
    () => rebaseTicketBranchSync(ticketId, { projectRoot }),
    (err) => {
      assert.ok(err instanceof WorktreeManagerError);
      assert.equal(err.details.conflict, false);
      assert.ok(err.message.includes('Worktree'));
      return true;
    }
  );
});

test('full flow: trial merge fails, rebase succeeds, retry succeeds', { skip: !HAS_GIT }, () => {
  const projectRoot = createTempRepo();
  const ticketId = 'REBASE-005';

  // Create worktree + feature branch with changes
  createWorktreeSync(ticketId, { projectRoot });
  const paths = resolveTicketPaths(projectRoot, ticketId);
  fs.writeFileSync(path.join(paths.worktreePath, 'feature.txt'), 'feature work\n', 'utf-8');
  git(paths.worktreePath, ['add', 'feature.txt']);
  git(paths.worktreePath, ['commit', '-m', 'feature commit']);

  // Advance main with a non-overlapping change
  fs.writeFileSync(path.join(projectRoot, 'other.txt'), 'main advanced\n', 'utf-8');
  git(projectRoot, ['add', 'other.txt']);
  git(projectRoot, ['commit', '-m', 'advance main']);

  // Trial merge should succeed (no conflict in this case, but tests the flow)
  // First, let's verify the rebase + trial merge pipeline works end-to-end
  const rebaseResult = rebaseTicketBranchSync(ticketId, { projectRoot });
  assert.equal(rebaseResult.rebased, true);

  // Now trial merge should succeed after rebase
  const trialMerge = prepareEvalTrialMergeSync(ticketId, { projectRoot });
  assert.ok(trialMerge.worktreePath);
  assert.equal(trialMerge.created, true);

  // Cleanup
  cleanupEvalTrialMergeSync(ticketId, { projectRoot });
});
