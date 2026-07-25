const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { unlinkNodeModulesLinks } = require('../src/main/worktreeManager');

const linkType = process.platform === 'win32' ? 'junction' : 'dir';

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ombuto-wt-'));
  const mainRepo = path.join(root, 'repo');
  const worktree = path.join(root, 'repo-worktrees', 'TCK-001');

  // Main repo dependencies at the three depths the manager links from.
  const targets = [
    path.join(mainRepo, 'node_modules'),
    path.join(mainRepo, 'frontend', 'node_modules'),
    path.join(mainRepo, '.ombutocode', 'src', 'node_modules'),
  ];
  for (const t of targets) {
    fs.mkdirSync(t, { recursive: true });
    fs.writeFileSync(path.join(t, 'dependency.txt'), 'do not delete me');
  }

  // Worktree with links pointing back at them.
  fs.mkdirSync(path.join(worktree, 'frontend'), { recursive: true });
  fs.mkdirSync(path.join(worktree, '.ombutocode', 'src'), { recursive: true });
  fs.mkdirSync(path.join(worktree, 'src'), { recursive: true });
  fs.writeFileSync(path.join(worktree, 'src', 'app.js'), '// ticket work');

  const links = [
    path.join(worktree, 'node_modules'),
    path.join(worktree, 'frontend', 'node_modules'),
    path.join(worktree, '.ombutocode', 'src', 'node_modules'),
  ];
  links.forEach((link, i) => fs.symlinkSync(targets[i], link, linkType));

  return { root, worktree, targets, links };
}

test('every node_modules junction in a worktree is unlinked, at all three depths', () => {
  const { root, worktree, targets, links } = makeFixture();

  const result = unlinkNodeModulesLinks(worktree);

  assert.equal(result.failed.length, 0, 'nothing should fail to unlink');
  assert.equal(result.unlinked.length, 3, 'root, package and .ombutocode links all found');
  for (const link of links) {
    assert.ok(!fs.existsSync(link), `${link} should be gone`);
  }
  // The whole point: the main repo's dependencies survive untouched.
  for (const target of targets) {
    assert.ok(
      fs.existsSync(path.join(target, 'dependency.txt')),
      `${target} contents must survive the unlink`
    );
  }

  fs.rmSync(root, { recursive: true, force: true });
});

test('real directories named node_modules are left alone', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ombuto-wt-real-'));
  const worktree = path.join(root, 'wt');
  const realNm = path.join(worktree, 'node_modules');
  fs.mkdirSync(realNm, { recursive: true });
  fs.writeFileSync(path.join(realNm, 'installed.txt'), 'locally installed');

  const result = unlinkNodeModulesLinks(worktree);

  assert.deepEqual(result.unlinked, [], 'a real directory is not a link');
  assert.ok(fs.existsSync(path.join(realNm, 'installed.txt')), 'contents untouched');

  fs.rmSync(root, { recursive: true, force: true });
});

test('a missing worktree path is a no-op', () => {
  const result = unlinkNodeModulesLinks(path.join(os.tmpdir(), 'ombuto-does-not-exist-12345'));
  assert.deepEqual(result, { unlinked: [], failed: [] });
});

test('worktree teardown unlinks junctions before handing the tree to git', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/main/worktreeManager.js'), 'utf-8');

  // Both teardown paths must unlink first — git for Windows walks through
  // reparse points and would delete the main repo's dependencies.
  for (const fn of ['removeWorktreeRegistration', 'removeWorktreeRegistrationSync']) {
    const body = src.slice(src.indexOf(`function ${fn}(`));
    const unlinkAt = body.indexOf('unlinkNodeModulesLinks(worktreePath)');
    const gitRemoveAt = body.indexOf("'worktree', 'remove', '--force'");
    assert.ok(unlinkAt !== -1, `${fn} should unlink node_modules links`);
    assert.ok(gitRemoveAt !== -1, `${fn} should still call git worktree remove`);
    assert.ok(unlinkAt < gitRemoveAt, `${fn} must unlink BEFORE calling git`);
  }

  // If a junction survives, git must not be used at all for that tree.
  assert.ok(
    /if \(failed\.length\)/.test(src),
    'a surviving junction should divert teardown away from git'
  );
});
