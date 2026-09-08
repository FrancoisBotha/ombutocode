// Tests for the pieces behind `create-ombutocode --upgrade` that run without
// a network: the ZIP writer/reader used for the backup, and the replace step
// on a fake .ombutocode/ tree. Run with `node --test create-ombutocode/test/`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const installer = require('../bin/create-ombutocode.js');
const {
  writeZip,
  readZipEntries,
  crc32,
  backupWorkbenchState,
  replaceWorkbench,
  seedMissingSkills,
  findRunningWorkbench,
  compareVersions,
  UPGRADE_REPLACE_DIRS,
  UPGRADE_REPLACE_FILES,
} = installer;

const quiet = () => {};

function tmpDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-ombutocode-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Write a tree from { 'relative/path': 'content' }.
function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
}

function listFiles(root) {
  const out = [];
  const walk = (abs, rel) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const r = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(abs, entry.name), r);
      else out.push(r);
    }
  };
  walk(root, '');
  return out;
}

// ── ZIP writer ──

test('crc32 matches the reference value for "123456789"', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  assert.equal(crc32(Buffer.alloc(0)), 0);
});

test('writeZip round-trips names, sizes and CRCs through readZipEntries', (t) => {
  const dir = tmpDir(t);
  const bigText = 'The quick brown fox jumps over the lazy dog. '.repeat(500);
  const random = Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 7919 + 13) & 0xff));
  const onDisk = path.join(dir, 'ombutocode.db');
  fs.writeFileSync(onDisk, random);

  const entries = [
    { name: '.ombutocode/data/ombutocode.db', file: onDisk },            // stored (incompressible)
    { name: '.ombutocode/planning/backlog.yml', data: Buffer.from(bigText) }, // deflated
    { name: '.ombutocode/data/tickets/empty.json', data: Buffer.alloc(0) },
    { name: '.ombutocode/profiles/ünïcode.json', data: Buffer.from('{}') },
  ];
  const zipPath = path.join(dir, 'backup.zip');
  const written = writeZip(zipPath, entries);
  assert.equal(written.entries, 4);
  assert.equal(written.bytes, fs.statSync(zipPath).size);

  const listed = readZipEntries(zipPath, { verify: true });
  assert.deepEqual(listed.map((e) => e.name), entries.map((e) => e.name));
  assert.equal(listed[0].size, random.length);
  assert.equal(listed[0].crc32, crc32(random));
  assert.equal(listed[1].size, bigText.length);
  assert.ok(listed[1].compressedSize < bigText.length, 'text entry should be deflated');
  assert.equal(listed[1].method, 8);
  assert.equal(listed[2].size, 0);

  // Corrupt one byte of the deflated payload: verification must notice.
  const buf = fs.readFileSync(zipPath);
  buf[listed[1].offset + 30 + listed[1].name.length + 5] ^= 0xff;
  const corrupt = path.join(dir, 'corrupt.zip');
  fs.writeFileSync(corrupt, buf);
  assert.doesNotThrow(() => readZipEntries(corrupt));
  assert.throws(() => readZipEntries(corrupt, { verify: true }), /does not verify/);
  assert.throws(() => readZipEntries(onDisk), /not a ZIP archive/);
});

// Cross-check with whatever archive tool the machine has. Both are optional:
// the test is skipped when neither `unzip` nor PowerShell's Expand-Archive
// is usable.
test('the archive is readable by an external unzip tool', (t) => {
  const dir = tmpDir(t);
  const files = {
    '.ombutocode/data/ombutocode.db': 'SQLite format 3\0' + 'x'.repeat(2000),
    '.ombutocode/codingagents/codingagents.yml': 'agents: []\n',
    '.ombutocode/src/package.json': '{ "version": "0.0.1" }',
  };
  const zipPath = path.join(dir, 'ext.zip');
  writeZip(zipPath, Object.entries(files).map(([name, content]) => ({ name, data: Buffer.from(content, 'latin1') })));

  const unzip = spawnSync('unzip', ['-l', zipPath], { encoding: 'utf8' });
  if (!unzip.error && unzip.status === 0) {
    for (const name of Object.keys(files)) assert.match(unzip.stdout, new RegExp(name.replace(/[.]/g, '\\.')));
    const test_ = spawnSync('unzip', ['-t', zipPath], { encoding: 'utf8' });
    assert.equal(test_.status, 0, test_.stdout);
    return;
  }

  if (process.platform === 'win32') {
    const dest = path.join(dir, 'out');
    const ps = spawnSync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${dest}' -Force`,
    ], { encoding: 'utf8' });
    if (!ps.error && ps.status === 0) {
      for (const [name, content] of Object.entries(files)) {
        assert.equal(fs.readFileSync(path.join(dest, name), 'latin1'), content);
      }
      return;
    }
  }
  t.skip('neither unzip nor Expand-Archive is available');
});

// ── Backup ──

test('backupWorkbenchState captures the preserved paths and verifies the archive', (t) => {
  const project = tmpDir(t);
  const ombuto = path.join(project, '.ombutocode');
  writeTree(ombuto, {
    'data/ombutocode.db': 'db',
    'data/tickets/T-1.json': '{}',
    'codingagents/codingagents.yml': 'agents: []',
    'codingagent-state.json': '{}',
    'profiles/mine.json': '{}',
    'planning/backlog.yml': 'tickets: []',
    'src/package.json': '{"version":"0.1.0"}',
    'src/node_modules/x/index.js': 'not backed up',
    'logs/run.log': 'not backed up',
    'run-output/out.txt': 'not backed up',
    'tools/tool.js': 'not backed up',
  });
  const when = new Date(2026, 8, 8, 13, 4, 5);
  const { zipPath, entries } = backupWorkbenchState(project, '0.1.0', when);
  assert.equal(path.basename(zipPath), '.ombutocode-backup-0.1.0-20260908-130405.zip');
  assert.equal(entries, 7);
  const names = readZipEntries(zipPath).map((e) => e.name).sort();
  assert.deepEqual(names, [
    '.ombutocode/codingagent-state.json',
    '.ombutocode/codingagents/codingagents.yml',
    '.ombutocode/data/ombutocode.db',
    '.ombutocode/data/tickets/T-1.json',
    '.ombutocode/planning/backlog.yml',
    '.ombutocode/profiles/mine.json',
    '.ombutocode/src/package.json',
  ]);
});

// ── Replace step ──

function makeExisting(root) {
  writeTree(root, {
    'data/ombutocode.db': 'SQLite format 3\0 old data ' + 'x'.repeat(1000),
    'data/tickets/T-1.json': '{"id":"T-1"}',
    'data/headless-settings.json': '{"a":1}',
    'codingagents/codingagents.yml': 'agents:\n  - name: mine\n',
    'codingagent-state.json': '{"running":[]}',
    'profiles/mine.json': '{"custom":true}',
    'profiles/benchmark.json': '{"old":true}',
    'planning/backlog.yml': 'tickets: []\n',
    'features/feature_X.md': '# X',
    'logs/run.log': 'log',
    'run-output/out.txt': 'out',
    'run-manifest.json': '{}',
    '.instance.lock': '999999',
    '.gitignore': 'logs/\n',
    'PRD.md': 'project prd',
    'src/package.json': '{"version":"0.2.5"}',
    'src/main.js': 'old main',
    'src/node_modules/x/index.js': 'old dep',
    'tools/old-tool.cjs': 'old tool',
    'tools/tools.json': 'old',
    'templates/backlog.yml': 'old',
    'scripts/old.js': 'old',
    'buildandrun': 'old sh',
    'buildandrun.bat': 'old bat',
    'buildandrun.sh': 'old sh2',
    'initombuto': 'old init',
    'initombuto.bat': 'old init bat',
    'OMBUTOCODE_ENGINEERING_GUIDE.md': 'old guide',
    'README.md': 'old readme',
    'LICENSE': 'old license',
    'codingagent-templates.json': '{"old":true}',
  });
}

function makeRelease(root, { codingagentsYml = 'agents:\n  - name: default\n' } = {}) {
  writeTree(root, {
    'data/ombutocode.db.backup': 'upstream junk that must not be copied',
    'codingagents/codingagents.yml': codingagentsYml,
    'profiles/benchmark.json': '{"new":true}',
    'profiles/extra.json': '{"extra":true}',
    'planning/backlog.yml': 'upstream backlog',
    '.instance.lock': '3044',
    '.gitignore': 'logs/\nrun-output/\n',
    'PRD.md': 'upstream prd',
    'src/package.json': '{"version":"0.2.15"}',
    'src/main.js': 'new main',
    'bench/longcli/run.js': 'bench',
    'tools/tools.json': 'new',
    'tools/new-tool.cjs': 'new tool',
    'templates/backlog.yml': 'new',
    'templates/skills/PRD/PRD Skill.md': '# PRD skill',
    'templates/skills/Insight/Code Map.md': '# Code map',
    'scripts/new.js': 'new',
    'buildandrun': 'new sh',
    'buildandrun.bat': 'new bat',
    'initombuto': 'new init',
    'initombuto.bat': 'new init bat',
    'OMBUTOCODE_ENGINEERING_GUIDE.md': 'new guide',
    'README.md': 'new readme',
    'LICENSE': 'new license',
    'codingagent-templates.json': '{"new":true}',
  });
}

test('replaceWorkbench swaps only the workbench code and preserves project state', (t) => {
  const dir = tmpDir(t);
  const existing = path.join(dir, 'project', '.ombutocode');
  const release = path.join(dir, 'release', '.ombutocode');
  makeExisting(existing);
  makeRelease(release);

  const preservedBefore = {};
  for (const rel of ['data/ombutocode.db', 'data/tickets/T-1.json', 'data/headless-settings.json',
    'codingagents/codingagents.yml', 'codingagent-state.json', 'profiles/mine.json', 'profiles/benchmark.json',
    'planning/backlog.yml', 'features/feature_X.md', 'logs/run.log', 'run-output/out.txt', 'run-manifest.json',
    '.instance.lock', '.gitignore', 'PRD.md']) {
    preservedBefore[rel] = fs.readFileSync(path.join(existing, rel));
  }

  const summary = replaceWorkbench(existing, release, quiet);

  // Preserved paths: byte-for-byte identical.
  for (const [rel, before] of Object.entries(preservedBefore)) {
    assert.ok(fs.readFileSync(path.join(existing, rel)).equals(before), `${rel} must be untouched`);
  }
  assert.equal(fs.existsSync(path.join(existing, 'data', 'ombutocode.db.backup')), false, 'nothing from the release data/ is copied');

  // codingagents.yml differs from the release: kept, with a .new alongside.
  assert.equal(fs.readFileSync(path.join(existing, 'codingagents', 'codingagents.yml.new'), 'utf8'), 'agents:\n  - name: default\n');
  assert.equal(summary.codingagentsNew, path.join(existing, 'codingagents', 'codingagents.yml.new'));

  // profiles/: custom kept, existing not overwritten, new ones added.
  assert.equal(fs.readFileSync(path.join(existing, 'profiles', 'benchmark.json'), 'utf8'), '{"old":true}');
  assert.equal(fs.readFileSync(path.join(existing, 'profiles', 'extra.json'), 'utf8'), '{"extra":true}');
  assert.deepEqual(summary.profilesAdded, ['extra.json']);

  // src/: old tree (including node_modules) gone, new one in place.
  assert.equal(fs.existsSync(path.join(existing, 'src', 'node_modules')), false);
  assert.equal(fs.readFileSync(path.join(existing, 'src', 'main.js'), 'utf8'), 'new main');
  assert.equal(JSON.parse(fs.readFileSync(path.join(existing, 'src', 'package.json'), 'utf8')).version, '0.2.15');

  // Other replaced directories.
  assert.deepEqual(listFiles(path.join(existing, 'tools')), ['new-tool.cjs', 'tools.json']);
  assert.equal(fs.readFileSync(path.join(existing, 'tools', 'tools.json'), 'utf8'), 'new');
  assert.deepEqual(listFiles(path.join(existing, 'scripts')), ['new.js']);
  assert.equal(fs.readFileSync(path.join(existing, 'templates', 'backlog.yml'), 'utf8'), 'new');
  assert.equal(fs.readFileSync(path.join(existing, 'bench', 'longcli', 'run.js'), 'utf8'), 'bench');

  // Plain files and launchers.
  for (const [name, content] of Object.entries({
    'buildandrun': 'new sh', 'buildandrun.bat': 'new bat', 'initombuto': 'new init', 'initombuto.bat': 'new init bat',
    'OMBUTOCODE_ENGINEERING_GUIDE.md': 'new guide', 'README.md': 'new readme', 'LICENSE': 'new license',
    'codingagent-templates.json': '{"new":true}',
  })) {
    assert.equal(fs.readFileSync(path.join(existing, name), 'utf8'), content, name);
  }
  // A launcher the release no longer ships is removed, not left stale.
  assert.equal(fs.existsSync(path.join(existing, 'buildandrun.sh')), false);
  assert.ok(summary.removed.includes('buildandrun.sh'));
  for (const d of UPGRADE_REPLACE_DIRS) assert.ok(summary.replaced.includes(`${d}/`), `${d}/ replaced`);
  for (const f of UPGRADE_REPLACE_FILES) assert.ok(summary.replaced.includes(f), `${f} replaced`);

  // The release tree was consumed for the moved directories only.
  assert.equal(fs.existsSync(path.join(release, 'src')), false);
  assert.equal(fs.existsSync(path.join(release, 'data')), true);
});

test('replaceWorkbench leaves codingagents.yml alone with no .new when it matches the release', (t) => {
  const dir = tmpDir(t);
  const existing = path.join(dir, 'project', '.ombutocode');
  const release = path.join(dir, 'release', '.ombutocode');
  makeExisting(existing);
  makeRelease(release, { codingagentsYml: 'agents:\n  - name: mine\n' });
  // A stale .new from an earlier upgrade is cleared once the files agree.
  fs.writeFileSync(path.join(existing, 'codingagents', 'codingagents.yml.new'), 'stale');

  const summary = replaceWorkbench(existing, release, quiet);
  assert.equal(summary.codingagentsNew, null);
  assert.equal(fs.existsSync(path.join(existing, 'codingagents', 'codingagents.yml.new')), false);
  assert.equal(fs.readFileSync(path.join(existing, 'codingagents', 'codingagents.yml'), 'utf8'), 'agents:\n  - name: mine\n');
});

test('replaceWorkbench copies codingagents.yml when the project has none', (t) => {
  const dir = tmpDir(t);
  const existing = path.join(dir, 'project', '.ombutocode');
  const release = path.join(dir, 'release', '.ombutocode');
  makeExisting(existing);
  makeRelease(release);
  fs.rmSync(path.join(existing, 'codingagents'), { recursive: true });

  const summary = replaceWorkbench(existing, release, quiet);
  assert.deepEqual(summary.codingagentsAdded, ['codingagents.yml']);
  assert.equal(fs.readFileSync(path.join(existing, 'codingagents', 'codingagents.yml'), 'utf8'), 'agents:\n  - name: default\n');
});

test('seedMissingSkills adds only skills that are not already in docs/Skills', (t) => {
  const dir = tmpDir(t);
  const project = path.join(dir, 'project');
  const ombuto = path.join(project, '.ombutocode');
  writeTree(ombuto, {
    'templates/skills/PRD/PRD Skill.md': '# new PRD skill',
    'templates/skills/Insight/Code Map.md': '# Code map',
  });
  writeTree(project, {
    'docs/Skills/PRD/PRD Skill.md': '# my edited PRD skill',
    'docs/Product Requirements Document/PRD.md': '# my prd',
  });

  const added = seedMissingSkills(project, ombuto, quiet);
  assert.deepEqual(added, ['Insight/Code Map.md']);
  assert.equal(fs.readFileSync(path.join(project, 'docs', 'Skills', 'PRD', 'PRD Skill.md'), 'utf8'), '# my edited PRD skill');
  assert.equal(fs.readFileSync(path.join(project, 'docs', 'Product Requirements Document', 'PRD.md'), 'utf8'), '# my prd');

  // No docs/ at all: nothing is created.
  const bare = path.join(dir, 'bare');
  fs.mkdirSync(bare, { recursive: true });
  assert.deepEqual(seedMissingSkills(bare, ombuto, quiet), []);
  assert.equal(fs.existsSync(path.join(bare, 'docs')), false);
});

// ── Preflight ──

test('findRunningWorkbench ignores missing, garbage and stale locks', (t) => {
  const dir = tmpDir(t);
  assert.equal(findRunningWorkbench(dir), null);
  const lock = path.join(dir, '.instance.lock');
  fs.writeFileSync(lock, 'nope');
  assert.equal(findRunningWorkbench(dir), null);
  // Find a PID that is not in use.
  let dead = 4000000;
  for (; dead > 100000; dead -= 7919) {
    try { process.kill(dead, 0); } catch (e) { if (e.code === 'ESRCH') break; }
  }
  fs.writeFileSync(lock, `${dead}\n`);
  assert.equal(findRunningWorkbench(dir), null);
  // Our own PID is alive but is node, not the workbench: treated as stale.
  fs.writeFileSync(lock, String(process.ppid || process.pid));
  const found = findRunningWorkbench(dir);
  assert.ok(found === null || /electron|ombuto/i.test(found.image), 'a live non-Electron PID is not the workbench');
});

test('compareVersions orders dotted versions numerically', () => {
  assert.ok(compareVersions('0.2.5', '0.2.15') < 0);
  assert.ok(compareVersions('0.2.15', '0.2.5') > 0);
  assert.equal(compareVersions('0.2.15', '0.2.15'), 0);
  assert.ok(compareVersions('0.10.0', '0.9.9') > 0);
  assert.ok(compareVersions('1.0', '1.0.0') === 0);
});

// ── CLI surface ──

test('--help mentions --upgrade and requiring the module does not run the CLI', () => {
  const out = execFileSync(process.execPath, [require.resolve('../bin/create-ombutocode.js'), '--help'], { encoding: 'utf8' });
  assert.match(out, /--upgrade \[<dir>\]/);
  assert.match(out, /--no-backup/);
  assert.match(out, /--force/);
  assert.equal(typeof installer.VERSION, 'string');
});

test('--upgrade refuses a directory without a workbench', (t) => {
  const dir = tmpDir(t);
  const res = spawnSync(process.execPath, [require.resolve('../bin/create-ombutocode.js'), '--upgrade', dir], { encoding: 'utf8' });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /does not contain \.ombutocode\/src\/package\.json/);
  assert.match(res.stderr, /--into-existing/);
});

test('--upgrade exits 0 without touching anything when already at the pinned release', (t) => {
  const dir = tmpDir(t);
  const version = installer.CLONE_REF.replace(/^v/, '');
  writeTree(path.join(dir, '.ombutocode'), { 'src/package.json': JSON.stringify({ version }), 'data/ombutocode.db': 'db' });
  const res = spawnSync(process.execPath, [require.resolve('../bin/create-ombutocode.js'), '--upgrade', dir], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /already at/);
  assert.deepEqual(fs.readdirSync(dir), ['.ombutocode']);
});
