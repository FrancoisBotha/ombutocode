const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  GitDiffError,
  assertSafeRepoPath,
  commitExists,
  findMergeCommitSha,
  resolveTicketCommit,
  parseNameStatus,
  parseNumstat,
  isProbablyBinary,
  getChangedFiles,
  getFileDiff,
  recordMergeCommitOnTicket,
  MAX_INLINE_FILE_BYTES
} = require('../src/main/gitDiffService');

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8', shell: false });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

/**
 * Build a repo whose history mirrors what a squash-merged ticket leaves behind:
 * a single commit on the base branch titled `[TICKET-ID] Title`.
 */
function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-diff-test-'));
  git(dir, ['init', '--initial-branch=main']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  git(dir, ['config', 'commit.gpgsign', 'false']);

  fs.writeFileSync(path.join(dir, 'keep.js'), 'const a = 1;\n');
  fs.writeFileSync(path.join(dir, 'change.js'), 'line one\nline two\nline three\n');
  fs.writeFileSync(path.join(dir, 'gone.txt'), 'delete me\n');
  fs.writeFileSync(path.join(dir, 'old-name.txt'), 'stable content that survives the rename\n');
  git(dir, ['add', '.']);
  git(dir, ['commit', '-m', 'base commit']);

  // The ticket's change, applied as one squash-style commit.
  fs.writeFileSync(path.join(dir, 'change.js'), 'line one\nline two CHANGED\nline three\n');
  fs.writeFileSync(path.join(dir, 'added.js'), 'export const fresh = true;\n');
  fs.unlinkSync(path.join(dir, 'gone.txt'));
  git(dir, ['mv', 'old-name.txt', 'new-name.txt']);
  fs.writeFileSync(path.join(dir, 'blob.bin'), Buffer.from([0, 1, 2, 0, 3, 4]));
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-m', '[DIFF-001] Do the ticket work']);

  const sha = git(dir, ['rev-parse', 'HEAD']);
  return { dir, sha };
}

let repo;
before(() => { repo = makeRepo(); });
after(() => {
  try { fs.rmSync(repo.dir, { recursive: true, force: true }); } catch (_) { /* best effort */ }
});

describe('assertSafeRepoPath', () => {
  test('accepts a plain relative path', () => {
    assert.strictEqual(assertSafeRepoPath('src/main/index.js'), 'src/main/index.js');
  });

  test('normalizes backslashes to POSIX separators', () => {
    assert.strictEqual(assertSafeRepoPath('src\\main\\index.js'), 'src/main/index.js');
  });

  test('rejects a parent-directory escape', () => {
    assert.throws(() => assertSafeRepoPath('../../etc/passwd'), /inside the repository/);
  });

  test('rejects an escape buried mid-path', () => {
    assert.throws(() => assertSafeRepoPath('src/../../secret'), /inside the repository/);
  });

  test('rejects a POSIX absolute path', () => {
    assert.throws(() => assertSafeRepoPath('/etc/passwd'), /relative to the repository/);
  });

  test('rejects a Windows drive path', () => {
    assert.throws(() => assertSafeRepoPath('C:\\Windows\\System32'), /relative to the repository/);
  });

  test('rejects empty input', () => {
    assert.throws(() => assertSafeRepoPath(''), /required/);
  });
});

describe('parseNameStatus', () => {
  test('parses adds, modifies and deletes', () => {
    const entries = parseNameStatus('M\0a.js\0A\0b.js\0D\0c.js\0');
    assert.deepStrictEqual(entries, [
      { status: 'M', path: 'a.js', oldPath: null },
      { status: 'A', path: 'b.js', oldPath: null },
      { status: 'D', path: 'c.js', oldPath: null }
    ]);
  });

  test('parses a rename into old and new paths', () => {
    const entries = parseNameStatus('R100\0old.txt\0new.txt\0');
    assert.deepStrictEqual(entries, [{ status: 'R', path: 'new.txt', oldPath: 'old.txt' }]);
  });

  test('tolerates truncated output', () => {
    assert.deepStrictEqual(parseNameStatus('M\0'), []);
    assert.deepStrictEqual(parseNameStatus(''), []);
  });
});

describe('parseNumstat', () => {
  test('reads addition and deletion counts', () => {
    const stats = parseNumstat('3\t1\ta.js\0');
    assert.deepStrictEqual(stats.get('a.js'), { additions: 3, deletions: 1, binary: false });
  });

  test('flags binary files, which report dashes', () => {
    const stats = parseNumstat('-\t-\tblob.bin\0');
    assert.deepStrictEqual(stats.get('blob.bin'), { additions: null, deletions: null, binary: true });
  });

  test('attributes a rename to its new path', () => {
    const stats = parseNumstat('0\t0\t\0old.txt\0new.txt\0');
    assert.ok(stats.has('new.txt'));
  });
});

describe('isProbablyBinary', () => {
  test('detects NUL bytes', () => {
    assert.strictEqual(isProbablyBinary('abc\0def'), true);
  });

  test('treats normal text and empty content as text', () => {
    assert.strictEqual(isProbablyBinary('const a = 1;'), false);
    assert.strictEqual(isProbablyBinary(''), false);
    assert.strictEqual(isProbablyBinary(null), false);
  });
});

describe('commitExists / findMergeCommitSha', () => {
  test('confirms a real commit', () => {
    assert.strictEqual(commitExists(repo.dir, repo.sha), true);
  });

  test('rejects a dangling sha', () => {
    assert.strictEqual(commitExists(repo.dir, '0'.repeat(40)), false);
    assert.strictEqual(commitExists(repo.dir, ''), false);
  });

  test('recovers a ticket commit from its subject line', () => {
    assert.strictEqual(findMergeCommitSha(repo.dir, 'DIFF-001'), repo.sha);
  });

  test('returns null for a ticket with no commit', () => {
    assert.strictEqual(findMergeCommitSha(repo.dir, 'NOPE-999'), null);
  });
});

describe('resolveTicketCommit', () => {
  test('prefers the stored sha', () => {
    const resolved = resolveTicketCommit({
      projectRoot: repo.dir,
      ticket: { id: 'DIFF-001', merge_commit_sha: repo.sha }
    });
    assert.deepStrictEqual(resolved, { sha: repo.sha, recovered: false });
  });

  test('falls back to commit-message search when nothing is stored', () => {
    const resolved = resolveTicketCommit({ projectRoot: repo.dir, ticket: { id: 'DIFF-001' } });
    assert.strictEqual(resolved.sha, repo.sha);
    assert.strictEqual(resolved.recovered, true, 'flagged so the caller can cache it');
  });

  test('falls back when the stored sha dangles after a history rewrite', () => {
    const resolved = resolveTicketCommit({
      projectRoot: repo.dir,
      ticket: { id: 'DIFF-001', merge_commit_sha: '0'.repeat(40) }
    });
    assert.strictEqual(resolved.sha, repo.sha);
    assert.strictEqual(resolved.recovered, true);
  });

  test('throws a typed error when nothing can be found', () => {
    assert.throws(
      () => resolveTicketCommit({ projectRoot: repo.dir, ticket: { id: 'GHOST-1' } }),
      (error) => error instanceof GitDiffError && error.code === 'COMMIT_NOT_FOUND'
    );
  });

  test('reports a missing commit distinctly from one never found', () => {
    // A repo with no matching subject at all, so recovery cannot rescue it.
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'git-diff-empty-'));
    git(empty, ['init', '--initial-branch=main']);
    git(empty, ['config', 'user.email', 'test@example.com']);
    git(empty, ['config', 'user.name', 'Test']);
    fs.writeFileSync(path.join(empty, 'a.txt'), 'a');
    git(empty, ['add', '.']);
    git(empty, ['commit', '-m', 'unrelated']);

    assert.throws(
      () => resolveTicketCommit({
        projectRoot: empty,
        ticket: { id: 'GHOST-1', merge_commit_sha: '0'.repeat(40) }
      }),
      (error) => error.code === 'COMMIT_MISSING'
    );
    fs.rmSync(empty, { recursive: true, force: true });
  });
});

describe('getChangedFiles', () => {
  test('lists every changed path with its status', () => {
    const result = getChangedFiles({
      projectRoot: repo.dir,
      ticket: { id: 'DIFF-001', merge_commit_sha: repo.sha }
    });

    const byPath = Object.fromEntries(result.files.map(f => [f.path, f]));
    assert.strictEqual(byPath['change.js'].statusLabel, 'modified');
    assert.strictEqual(byPath['added.js'].statusLabel, 'added');
    assert.strictEqual(byPath['gone.txt'].statusLabel, 'deleted');
    assert.strictEqual(byPath['blob.bin'].binary, true);
    assert.ok(!byPath['keep.js'], 'untouched files are absent');
  });

  test('reports the rename with its previous path', () => {
    const result = getChangedFiles({
      projectRoot: repo.dir,
      ticket: { id: 'DIFF-001', merge_commit_sha: repo.sha }
    });
    const renamed = result.files.find(f => f.path === 'new-name.txt');
    assert.strictEqual(renamed.status, 'R');
    assert.strictEqual(renamed.oldPath, 'old-name.txt');
  });

  test('includes commit metadata and totals', () => {
    const result = getChangedFiles({
      projectRoot: repo.dir,
      ticket: { id: 'DIFF-001', merge_commit_sha: repo.sha }
    });
    assert.strictEqual(result.subject, '[DIFF-001] Do the ticket work');
    assert.ok(result.shortSha.length >= 7);
    assert.ok(result.committedAt, 'ISO timestamp present');
    assert.strictEqual(result.totals.files, result.files.length);
    assert.ok(result.totals.additions > 0);
  });
});

describe('getFileDiff', () => {
  const ticket = { id: 'DIFF-001' };

  test('returns both sides of a modified file', () => {
    const diff = getFileDiff({
      projectRoot: repo.dir,
      ticket: { ...ticket, merge_commit_sha: repo.sha },
      filePath: 'change.js'
    });
    assert.ok(diff.before.includes('line two\n'));
    assert.ok(diff.after.includes('line two CHANGED'));
    assert.strictEqual(diff.binary, false);
  });

  test('an added file has no before side', () => {
    const diff = getFileDiff({
      projectRoot: repo.dir,
      ticket: { ...ticket, merge_commit_sha: repo.sha },
      filePath: 'added.js'
    });
    assert.strictEqual(diff.before, null);
    assert.ok(diff.after.includes('fresh'));
  });

  test('a deleted file has no after side', () => {
    const diff = getFileDiff({
      projectRoot: repo.dir,
      ticket: { ...ticket, merge_commit_sha: repo.sha },
      filePath: 'gone.txt'
    });
    assert.ok(diff.before.includes('delete me'));
    assert.strictEqual(diff.after, null);
  });

  test('a rename resolves the before side via oldPath', () => {
    const diff = getFileDiff({
      projectRoot: repo.dir,
      ticket: { ...ticket, merge_commit_sha: repo.sha },
      filePath: 'new-name.txt',
      oldPath: 'old-name.txt'
    });
    assert.ok(diff.before.includes('survives the rename'), 'before side found under the old path');
    assert.ok(diff.after.includes('survives the rename'));
  });

  test('binary content is reported, not returned', () => {
    const diff = getFileDiff({
      projectRoot: repo.dir,
      ticket: { ...ticket, merge_commit_sha: repo.sha },
      filePath: 'blob.bin'
    });
    assert.strictEqual(diff.binary, true);
    assert.strictEqual(diff.before, null);
    assert.strictEqual(diff.after, null);
  });

  test('rejects a path escaping the repository', () => {
    assert.throws(
      () => getFileDiff({
        projectRoot: repo.dir,
        ticket: { ...ticket, merge_commit_sha: repo.sha },
        filePath: '../../../etc/passwd'
      }),
      /inside the repository/
    );
  });

  test('guards a file over the inline size limit until allowLarge is set', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-diff-big-'));
    git(dir, ['init', '--initial-branch=main']);
    git(dir, ['config', 'user.email', 'test@example.com']);
    git(dir, ['config', 'user.name', 'Test']);
    fs.writeFileSync(path.join(dir, 'seed.txt'), 'seed\n');
    git(dir, ['add', '.']);
    git(dir, ['commit', '-m', 'seed']);

    const big = `${'x'.repeat(80)}\n`.repeat(Math.ceil(MAX_INLINE_FILE_BYTES / 81) + 20);
    fs.writeFileSync(path.join(dir, 'big.txt'), big);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-m', '[BIG-001] Add a big file']);
    const sha = git(dir, ['rev-parse', 'HEAD']);

    const guarded = getFileDiff({
      projectRoot: dir,
      ticket: { id: 'BIG-001', merge_commit_sha: sha },
      filePath: 'big.txt'
    });
    assert.strictEqual(guarded.tooLarge, true);
    assert.strictEqual(guarded.after, null);
    assert.ok(guarded.bytes > MAX_INLINE_FILE_BYTES);

    const forced = getFileDiff({
      projectRoot: dir,
      ticket: { id: 'BIG-001', merge_commit_sha: sha },
      filePath: 'big.txt',
      allowLarge: true
    });
    assert.strictEqual(forced.tooLarge, false);
    assert.ok(forced.after.length > MAX_INLINE_FILE_BYTES);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('treats a root commit as all-additions rather than failing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-diff-root-'));
    git(dir, ['init', '--initial-branch=main']);
    git(dir, ['config', 'user.email', 'test@example.com']);
    git(dir, ['config', 'user.name', 'Test']);
    fs.writeFileSync(path.join(dir, 'first.txt'), 'hello\n');
    git(dir, ['add', '.']);
    git(dir, ['commit', '-m', '[ROOT-001] First commit']);
    const sha = git(dir, ['rev-parse', 'HEAD']);

    const diff = getFileDiff({
      projectRoot: dir,
      ticket: { id: 'ROOT-001', merge_commit_sha: sha },
      filePath: 'first.txt'
    });
    assert.strictEqual(diff.before, null);
    assert.ok(diff.after.includes('hello'));

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('recordMergeCommitOnTicket', () => {
  test('stamps sha and base branch onto the ticket', () => {
    const ticket = { id: 'T-1' };
    recordMergeCommitOnTicket(ticket, { commitSha: 'abc123', baseBranch: 'main' });
    assert.strictEqual(ticket.merge_commit_sha, 'abc123');
    assert.strictEqual(ticket.merge_base_branch, 'main');
  });

  test('nulls the fields when the merge result is incomplete', () => {
    const ticket = { id: 'T-1' };
    recordMergeCommitOnTicket(ticket, {});
    assert.strictEqual(ticket.merge_commit_sha, null);
  });

  test('ignores a missing ticket or result', () => {
    assert.doesNotThrow(() => recordMergeCommitOnTicket(null, { commitSha: 'x' }));
    assert.doesNotThrow(() => recordMergeCommitOnTicket({ id: 'T' }, null));
  });
});
