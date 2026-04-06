const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  createWorktree,
  createWorktreeSync,
  removeWorktree,
  resolveTicketPaths,
  prepareEvalTrialMergeSync,
  cleanupEvalTrialMergeSync,
  squashMergeTicketBranchSync,
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
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ombutocode-worktree-test-'));
  git(projectRoot, ['init']);
  git(projectRoot, ['config', 'user.email', 'test@example.com']);
  git(projectRoot, ['config', 'user.name', 'Test User']);
  fs.writeFileSync(path.join(projectRoot, 'README.md'), '# test\n', 'utf-8');
  git(projectRoot, ['add', 'README.md']);
  git(projectRoot, ['commit', '-m', 'initial commit']);

  return projectRoot;
}

test('createWorktree creates branch and worktree directory', { skip: !HAS_GIT }, async () => {
  const projectRoot = createTempRepo();
  const ticketId = 'GIT_WT-001';

  const result = await createWorktree(ticketId, { projectRoot });

  assert.equal(result.branch, 'ticket/GIT_WT-001');
  assert.equal(result.created, true);
  assert.equal(result.reused, false);
  assert.ok(fs.existsSync(result.worktreePath));

  const branchRef = git(projectRoot, ['rev-parse', '--verify', '--quiet', 'refs/heads/ticket/GIT_WT-001']);
  assert.ok(branchRef.length > 0);
});

test('createWorktreeSync creates and reuses branch/worktree', { skip: !HAS_GIT }, () => {
  const projectRoot = createTempRepo();
  const ticketId = 'GIT_WT-002-SYNC';

  const first = createWorktreeSync(ticketId, { projectRoot });
  const second = createWorktreeSync(ticketId, { projectRoot });

  assert.equal(first.branch, 'ticket/GIT_WT-002-SYNC');
  assert.equal(first.created, true);
  assert.equal(second.reused, true);
  assert.equal(second.created, false);
  assert.equal(second.worktreePath, first.worktreePath);
  assert.ok(fs.existsSync(first.worktreePath));
});

test('createWorktree reuses existing branch/worktree', { skip: !HAS_GIT }, async () => {
  const projectRoot = createTempRepo();
  const ticketId = 'GIT_WT-002';

  const first = await createWorktree(ticketId, { projectRoot });
  const second = await createWorktree(ticketId, { projectRoot });

  assert.equal(first.created, true);
  assert.equal(second.reused, true);
  assert.equal(second.created, false);
  assert.equal(second.worktreePath, first.worktreePath);
});

test('createWorktree removes stale directory when branch does not exist', { skip: !HAS_GIT }, async () => {
  const projectRoot = createTempRepo();
  const ticketId = 'GIT_WT-003';
  const paths = resolveTicketPaths(projectRoot, ticketId);

  fs.mkdirSync(paths.worktreePath, { recursive: true });
  fs.writeFileSync(path.join(paths.worktreePath, 'stale.txt'), 'stale', 'utf-8');

  const result = await createWorktree(ticketId, { projectRoot });

  assert.equal(result.created, true);
  assert.equal(fs.existsSync(path.join(paths.worktreePath, 'stale.txt')), false);
  const activeBranch = git(paths.worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD']);
  assert.equal(activeBranch, 'ticket/GIT_WT-003');
});

test('createWorktree recreates missing directory when branch already exists', { skip: !HAS_GIT }, async () => {
  const projectRoot = createTempRepo();
  const ticketId = 'GIT_WT-004';

  const first = await createWorktree(ticketId, { projectRoot });
  fs.rmSync(first.worktreePath, { recursive: true, force: true });

  const second = await createWorktree(ticketId, { projectRoot });

  assert.equal(second.created, true);
  assert.equal(second.reused, false);
  assert.ok(fs.existsSync(second.worktreePath));
});

test('removeWorktree removes directory and branch', { skip: !HAS_GIT }, async () => {
  const projectRoot = createTempRepo();
  const ticketId = 'GIT_WT-005';

  const created = await createWorktree(ticketId, { projectRoot });
  const removed = await removeWorktree(ticketId, { projectRoot });

  assert.equal(removed.removedWorktree, true);
  assert.equal(removed.removedBranch, true);
  assert.equal(fs.existsSync(created.worktreePath), false);

  const branchResult = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'refs/heads/ticket/GIT_WT-005'], {
    cwd: projectRoot,
    stdio: 'ignore'
  });
  assert.notEqual(branchResult.status, 0);
});

test('removeWorktree is a no-op when worktree and branch do not exist', { skip: !HAS_GIT }, async () => {
  const projectRoot = createTempRepo();
  const removed = await removeWorktree('GIT_WT-007-NOOP', { projectRoot });

  assert.equal(removed.removedWorktree, false);
  assert.equal(removed.removedBranch, false);
});

test('prepareEvalTrialMergeSync creates eval branch/worktree with merged feature content', { skip: !HAS_GIT }, () => {
  const projectRoot = createTempRepo();
  const ticketId = 'GIT_WT-004-EVAL';
  const feature = createWorktreeSync(ticketId, { projectRoot });
  const targetFile = path.join(projectRoot, 'README.md');

  fs.writeFileSync(path.join(feature.worktreePath, 'README.md'), '# feature change\n', 'utf-8');
  git(feature.worktreePath, ['add', 'README.md']);
  git(feature.worktreePath, ['commit', '-m', 'feature change']);

  const trial = prepareEvalTrialMergeSync(ticketId, { projectRoot });
  assert.equal(trial.branch, 'eval/GIT_WT-004-EVAL');
  assert.equal(trial.featureBranch, 'ticket/GIT_WT-004-EVAL');
  assert.ok(fs.existsSync(trial.worktreePath));

  const evalReadme = fs.readFileSync(path.join(trial.worktreePath, 'README.md'), 'utf-8').replace(/\r\n/g, '\n');
  assert.equal(evalReadme, '# feature change\n');

  const cleanup = cleanupEvalTrialMergeSync(ticketId, { projectRoot });
  assert.equal(cleanup.removedWorktree, true);
  assert.equal(cleanup.removedBranch, true);
  assert.equal(fs.existsSync(targetFile), true);
});

test('prepareEvalTrialMergeSync fails on merge conflict and cleans up eval trial artifacts', { skip: !HAS_GIT }, () => {
  const projectRoot = createTempRepo();
  const ticketId = 'GIT_WT-004-CONFLICT';
  const feature = createWorktreeSync(ticketId, { projectRoot });

  fs.writeFileSync(path.join(feature.worktreePath, 'README.md'), '# feature branch line\n', 'utf-8');
  git(feature.worktreePath, ['add', 'README.md']);
  git(feature.worktreePath, ['commit', '-m', 'feature update']);

  fs.writeFileSync(path.join(projectRoot, 'README.md'), '# main branch line\n', 'utf-8');
  git(projectRoot, ['add', 'README.md']);
  git(projectRoot, ['commit', '-m', 'main update']);

  assert.throws(
    () => prepareEvalTrialMergeSync(ticketId, { projectRoot }),
    (error) => {
      assert.ok(error instanceof WorktreeManagerError);
      assert.equal(error.details?.conflict, true);
      return true;
    }
  );

  const evalBranch = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/eval/${ticketId}`], {
    cwd: projectRoot,
    stdio: 'ignore'
  });
  assert.notEqual(evalBranch.status, 0);
  assert.equal(fs.existsSync(path.join(path.dirname(projectRoot), `${path.basename(projectRoot)}-worktrees`, `${ticketId}-eval`)), false);
});

test('squashMergeTicketBranchSync succeeds and creates commit with ticket ID', { skip: !HAS_GIT }, () => {
  const projectRoot = createTempRepo();
  const ticketId = 'GIT_WT-008-SQUASH';
  const ticketTitle = 'Test feature';

  const feature = createWorktreeSync(ticketId, { projectRoot });
  fs.writeFileSync(path.join(feature.worktreePath, 'feature.txt'), 'feature content\n', 'utf-8');
  git(feature.worktreePath, ['add', 'feature.txt']);
  git(feature.worktreePath, ['commit', '-m', 'add feature']);

  const result = squashMergeTicketBranchSync(ticketId, { projectRoot, title: ticketTitle });

  assert.equal(result.ticketId, ticketId);
  assert.equal(result.branch, `ticket/${ticketId}`);
  assert.ok(['main', 'master'].includes(result.baseBranch), `baseBranch should be main or master, got ${result.baseBranch}`);
  assert.ok(result.commitMessage.includes(`[${ticketId}]`));
  assert.ok(result.commitMessage.includes(ticketTitle));
  assert.ok(result.commitSha.length > 0);

  const featureContent = fs.readFileSync(path.join(projectRoot, 'feature.txt'), 'utf-8').replace(/\r\n/g, '\n');
  assert.equal(featureContent, 'feature content\n');

  const logMessage = git(projectRoot, ['log', '-1', '--pretty=%B']);
  assert.ok(logMessage.includes(`[${ticketId}]`));
});

test('squashMergeTicketBranchSync throws on conflict and leaves working tree clean', { skip: !HAS_GIT }, () => {
  const projectRoot = createTempRepo();
  const ticketId = 'GIT_WT-009-MERGE-CONFLICT';

  const feature = createWorktreeSync(ticketId, { projectRoot });
  fs.writeFileSync(path.join(feature.worktreePath, 'README.md'), '# conflicting feature\n', 'utf-8');
  git(feature.worktreePath, ['add', 'README.md']);
  git(feature.worktreePath, ['commit', '-m', 'feature change']);

  fs.writeFileSync(path.join(projectRoot, 'README.md'), '# different main change\n', 'utf-8');
  git(projectRoot, ['add', 'README.md']);
  git(projectRoot, ['commit', '-m', 'main change']);

  assert.throws(
    () => squashMergeTicketBranchSync(ticketId, { projectRoot, title: 'Conflict test' }),
    (error) => {
      assert.ok(error instanceof WorktreeManagerError);
      assert.equal(error.details?.conflict, true);
      return true;
    }
  );

  // Working tree should be clean after the failed merge is aborted
  const status = git(projectRoot, ['status', '--porcelain']);
  assert.equal(status.trim(), '');
});

test('squashMergeTicketBranchSync auto-resolves codingagent-state.json conflict by keeping main version', { skip: !HAS_GIT }, () => {
  const projectRoot = createTempRepo();
  const ticketId = 'GIT_WT-STATE-CONFLICT';

  // Create the state file on main (simulating scheduler)
  const ombutocodeDir = path.join(projectRoot, '.ombutocode');
  fs.mkdirSync(ombutocodeDir, { recursive: true });
  fs.writeFileSync(path.join(ombutocodeDir, 'codingagent-state.json'), '{"version":1}\n', 'utf-8');
  git(projectRoot, ['add', '.']);
  git(projectRoot, ['commit', '-m', 'add state']);

  // Create feature branch with a real code change AND a state file change
  const feature = createWorktreeSync(ticketId, { projectRoot });
  fs.writeFileSync(path.join(feature.worktreePath, 'feature.txt'), 'new feature\n');
  // Agent modifies state file on the ticket branch
  fs.writeFileSync(
    path.join(feature.worktreePath, '.ombutocode', 'codingagent-state.json'),
    '{"version":1,"agent":"running"}\n',
    'utf-8'
  );
  git(feature.worktreePath, ['add', '.']);
  git(feature.worktreePath, ['commit', '-m', 'feature + state change']);

  // Meanwhile, scheduler updates state file on main (different content → conflict)
  fs.writeFileSync(
    path.join(ombutocodeDir, 'codingagent-state.json'),
    '{"version":1,"agent":"completed"}\n',
    'utf-8'
  );
  git(projectRoot, ['add', '.']);
  git(projectRoot, ['commit', '-m', 'scheduler updates state']);

  // Squash merge should succeed because codingagent-state.json conflict is auto-resolved
  const result = squashMergeTicketBranchSync(ticketId, { projectRoot, title: 'State conflict test' });
  assert.ok(result.commitSha.length > 0);

  // Feature code should be present
  assert.ok(fs.existsSync(path.join(projectRoot, 'feature.txt')));

  // State file should have main's version (scheduler's latest state)
  const stateContent = fs.readFileSync(path.join(ombutocodeDir, 'codingagent-state.json'), 'utf-8');
  assert.ok(stateContent.includes('"completed"'), 'state file should keep main version');
  assert.ok(!stateContent.includes('"running"'), 'state file should NOT have ticket branch version');
});

test('squashMergeTicketBranchSync still throws on non-backlog conflict', { skip: !HAS_GIT }, () => {
  const projectRoot = createTempRepo();
  const ticketId = 'GIT_WT-CODE-CONFLICT';

  // Create feature branch that modifies both code AND backlog
  const backlogDir = path.join(projectRoot, 'docs', 'planning');
  fs.mkdirSync(backlogDir, { recursive: true });
  fs.writeFileSync(path.join(backlogDir, 'backlog.yml'), 'version: 1\n', 'utf-8');
  git(projectRoot, ['add', '.']);
  git(projectRoot, ['commit', '-m', 'initial backlog']);

  const feature = createWorktreeSync(ticketId, { projectRoot });
  fs.writeFileSync(path.join(feature.worktreePath, 'README.md'), '# feature version\n', 'utf-8');
  fs.writeFileSync(path.join(feature.worktreePath, 'docs', 'planning', 'backlog.yml'), 'version: 2\n', 'utf-8');
  git(feature.worktreePath, ['add', '.']);
  git(feature.worktreePath, ['commit', '-m', 'feature changes']);

  // Conflicting change on main for both README.md and backlog.yml
  fs.writeFileSync(path.join(projectRoot, 'README.md'), '# main version\n', 'utf-8');
  fs.writeFileSync(path.join(backlogDir, 'backlog.yml'), 'version: 3\n', 'utf-8');
  git(projectRoot, ['add', '.']);
  git(projectRoot, ['commit', '-m', 'main changes']);

  // Should still throw because README.md has a real conflict
  assert.throws(
    () => squashMergeTicketBranchSync(ticketId, { projectRoot, title: 'Code conflict' }),
    (error) => {
      assert.ok(error instanceof WorktreeManagerError);
      assert.equal(error.details?.conflict, true);
      return true;
    }
  );
});

test('squashMergeTicketBranchSync handles sequential merges of multiple tickets', { skip: !HAS_GIT }, () => {
  const projectRoot = createTempRepo();
  const ticket1 = 'GIT_WT-010-CONCURRENT-1';
  const ticket2 = 'GIT_WT-010-CONCURRENT-2';

  const feature1 = createWorktreeSync(ticket1, { projectRoot });
  const feature2 = createWorktreeSync(ticket2, { projectRoot });

  fs.writeFileSync(path.join(feature1.worktreePath, 'file1.txt'), 'content1\n', 'utf-8');
  git(feature1.worktreePath, ['add', 'file1.txt']);
  git(feature1.worktreePath, ['commit', '-m', 'feature 1']);

  fs.writeFileSync(path.join(feature2.worktreePath, 'file2.txt'), 'content2\n', 'utf-8');
  git(feature2.worktreePath, ['add', 'file2.txt']);
  git(feature2.worktreePath, ['commit', '-m', 'feature 2']);

  const result1 = squashMergeTicketBranchSync(ticket1, { projectRoot, title: 'Feature 1' });
  assert.ok(result1.commitSha.length > 0);

  const result2 = squashMergeTicketBranchSync(ticket2, { projectRoot, title: 'Feature 2' });
  assert.ok(result2.commitSha.length > 0);

  assert.ok(fs.existsSync(path.join(projectRoot, 'file1.txt')));
  assert.ok(fs.existsSync(path.join(projectRoot, 'file2.txt')));
});

test('cleanup removes worktree and branch after successful squash merge', { skip: !HAS_GIT }, async () => {
  const projectRoot = createTempRepo();
  const ticketId = 'GIT_WT-011-CLEANUP';

  const feature = createWorktreeSync(ticketId, { projectRoot });
  fs.writeFileSync(path.join(feature.worktreePath, 'test.txt'), 'content\n', 'utf-8');
  git(feature.worktreePath, ['add', 'test.txt']);
  git(feature.worktreePath, ['commit', '-m', 'test']);

  squashMergeTicketBranchSync(ticketId, { projectRoot, title: 'Cleanup test' });

  const removed = await removeWorktree(ticketId, { projectRoot });
  assert.equal(removed.removedWorktree, true);
  assert.equal(removed.removedBranch, true);

  assert.equal(fs.existsSync(feature.worktreePath), false);

  const branchVerify = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/ticket/${ticketId}`], {
    cwd: projectRoot,
    stdio: 'ignore'
  });
  assert.notEqual(branchVerify.status, 0);

  // Merged content should still be on main
  assert.ok(fs.existsSync(path.join(projectRoot, 'test.txt')));
});

test('squashMergeTicketBranchSync succeeds with dirty working tree (uncommitted changes)', { skip: !HAS_GIT }, () => {
  const projectRoot = createTempRepo();
  const ticketId = 'GIT_WT-DIRTY-001';

  // Create feature branch with changes
  const feature = createWorktreeSync(ticketId, { projectRoot });
  fs.writeFileSync(path.join(feature.worktreePath, 'feature.txt'), 'feature content\n');
  git(feature.worktreePath, ['add', 'feature.txt']);
  git(feature.worktreePath, ['commit', '-m', 'add feature']);

  // Dirty the main working tree (simulates scheduler writing to backlog.yml)
  fs.writeFileSync(path.join(projectRoot, 'dirty-file.txt'), 'uncommitted changes\n');
  // Also modify an existing tracked file
  fs.writeFileSync(path.join(projectRoot, 'README.md'), '# test\nmodified by scheduler\n');

  const result = squashMergeTicketBranchSync(ticketId, { projectRoot, title: 'Dirty tree test' });

  assert.ok(result.commitSha.length > 0);
  assert.ok(fs.existsSync(path.join(projectRoot, 'feature.txt')));

  // Dirty files must still be present after merge (stash was restored)
  assert.ok(fs.existsSync(path.join(projectRoot, 'dirty-file.txt')));
  const readmeContent = fs.readFileSync(path.join(projectRoot, 'README.md'), 'utf-8');
  assert.ok(readmeContent.includes('modified by scheduler'));
});

test('squashMergeTicketBranchSync restores dirty state even on merge conflict', { skip: !HAS_GIT }, () => {
  const projectRoot = createTempRepo();
  const ticketId = 'GIT_WT-DIRTY-002';

  // Create feature branch that modifies README.md
  const feature = createWorktreeSync(ticketId, { projectRoot });
  fs.writeFileSync(path.join(feature.worktreePath, 'README.md'), 'feature version\n');
  git(feature.worktreePath, ['add', 'README.md']);
  git(feature.worktreePath, ['commit', '-m', 'modify readme']);

  // Create conflicting change on main
  fs.writeFileSync(path.join(projectRoot, 'README.md'), 'main version\n');
  git(projectRoot, ['add', 'README.md']);
  git(projectRoot, ['commit', '-m', 'main change']);

  // Now dirty the working tree with an untracked file
  fs.writeFileSync(path.join(projectRoot, 'scheduler-state.txt'), 'scheduler data\n');

  assert.throws(
    () => squashMergeTicketBranchSync(ticketId, { projectRoot, title: 'Conflict with dirty tree' }),
    (error) => {
      assert.ok(error instanceof WorktreeManagerError);
      assert.equal(error.details?.conflict, true);
      return true;
    }
  );

  // Dirty untracked file must still be present (stash was restored)
  assert.ok(fs.existsSync(path.join(projectRoot, 'scheduler-state.txt')));

  // Working tree should be clean of merge artifacts
  const status = git(projectRoot, ['status', '--porcelain']);
  assert.ok(!status.includes('UU '), 'should have no unmerged files');
});

test('squashMergeTicketBranchSync throws when feature branch does not exist', { skip: !HAS_GIT }, () => {
  const projectRoot = createTempRepo();

  assert.throws(
    () => squashMergeTicketBranchSync('NONEXISTENT-001', { projectRoot }),
    (error) => {
      assert.ok(error instanceof WorktreeManagerError);
      assert.equal(error.details?.conflict, false);
      return true;
    }
  );
});

test('prepareEvalTrialMergeSync throws when feature branch does not exist', { skip: !HAS_GIT }, () => {
  const projectRoot = createTempRepo();

  assert.throws(
    () => prepareEvalTrialMergeSync('NONEXISTENT-002', { projectRoot }),
    (error) => {
      assert.ok(error instanceof WorktreeManagerError);
      assert.equal(error.details?.conflict, false);
      return true;
    }
  );
});

test('removeWorktree handles already-deleted directory gracefully', { skip: !HAS_GIT }, async () => {
  const projectRoot = createTempRepo();
  const ticketId = 'GIT_WT-DELETED';

  await createWorktree(ticketId, { projectRoot });
  const paths = resolveTicketPaths(projectRoot, ticketId);
  fs.rmSync(paths.worktreePath, { recursive: true, force: true });

  const removed = await removeWorktree(ticketId, { projectRoot });
  assert.equal(removed.removedBranch, true);
});

test('removeWorktree is idempotent', { skip: !HAS_GIT }, async () => {
  const projectRoot = createTempRepo();
  const ticketId = 'GIT_WT-IDEMPOTENT';

  await createWorktree(ticketId, { projectRoot });
  const first = await removeWorktree(ticketId, { projectRoot });
  const second = await removeWorktree(ticketId, { projectRoot });

  assert.equal(first.removedWorktree, true);
  assert.equal(first.removedBranch, true);
  assert.equal(second.removedWorktree, false);
  assert.equal(second.removedBranch, false);
});

test('multiple worktrees for different tickets do not interfere', { skip: !HAS_GIT }, async () => {
  const projectRoot = createTempRepo();

  const wt1 = await createWorktree('MULTI-001', { projectRoot });
  const wt2 = await createWorktree('MULTI-002', { projectRoot });

  assert.notEqual(wt1.worktreePath, wt2.worktreePath);
  assert.notEqual(wt1.branch, wt2.branch);
  assert.ok(fs.existsSync(wt1.worktreePath));
  assert.ok(fs.existsSync(wt2.worktreePath));

  await removeWorktree('MULTI-001', { projectRoot });
  assert.equal(fs.existsSync(wt1.worktreePath), false);
  assert.ok(fs.existsSync(wt2.worktreePath));
});
