const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { commitWorktreeChangesSync, BUILD_PRODUCT_EXCLUDES } = require('../src/main/worktreeManager');

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

// A repository with no .gitignore, the way course labs and benchmark tasks
// often ship. An agent that compiles in the worktree leaves .o files and a
// binary behind; the auto-commit must take the source change and nothing else.
test('auto-commit skips build products even when the repository has no .gitignore', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ombuto-wt-'));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 't@t');
  git(root, 'config', 'user.name', 't');
  fs.mkdirSync(path.join(root, 'kernel'));
  fs.writeFileSync(path.join(root, 'kernel', 'vm.c'), 'int x;\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'seed');

  // Simulate the agent's work: a source edit plus a full build's droppings.
  fs.writeFileSync(path.join(root, 'kernel', 'vm.c'), 'int x = 1;\n');
  fs.writeFileSync(path.join(root, 'kernel', 'new.c'), 'int y;\n');
  fs.writeFileSync(path.join(root, 'kernel', 'vm.o'), 'ELF');
  fs.writeFileSync(path.join(root, 'kernel', 'vm.d'), 'vm.o: vm.c');
  fs.writeFileSync(path.join(root, 'kernel', 'kernel.elf'), 'ELF');
  fs.writeFileSync(path.join(root, 'fs.img'), 'IMG');
  fs.mkdirSync(path.join(root, 'user', '__pycache__'), { recursive: true });
  fs.writeFileSync(path.join(root, 'user', '__pycache__', 'x.pyc'), 'PYC');

  const result = commitWorktreeChangesSync('T-1', { projectRoot: root, worktreePath: root });
  assert.equal(result.committed, true);

  const committed = git(root, 'show', '--name-only', '--format=', 'HEAD').split('\n').filter(Boolean).sort();
  assert.deepEqual(committed, ['kernel/new.c', 'kernel/vm.c']);

  const untracked = git(root, 'status', '--porcelain', '--untracked-files=all').split('\n').filter(Boolean);
  assert.ok(untracked.some((l) => l.endsWith('kernel/vm.o')), 'build products stay untracked');
  assert.ok(untracked.some((l) => l.endsWith('fs.img')));
});

test('nothing to commit when only build products changed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ombuto-wt-'));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 't@t');
  git(root, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(root, 'a.c'), 'int a;\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'seed');
  fs.writeFileSync(path.join(root, 'a.o'), 'ELF');

  const result = commitWorktreeChangesSync('T-2', { projectRoot: root, worktreePath: root });
  assert.equal(result.committed, false);
  assert.equal(git(root, 'rev-list', '--count', 'HEAD'), '1');
});

test('the exclude list covers the common compiled-artefact extensions', () => {
  for (const ext of ['o', 'd', 'asm', 'sym', 'pyc', 'class', 'img', 'elf']) {
    assert.ok(BUILD_PRODUCT_EXCLUDES.includes(`**/*.${ext}`), ext);
  }
});
