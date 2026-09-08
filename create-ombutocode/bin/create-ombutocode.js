#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');

const REPO_URL = 'https://github.com/FrancoisBotha/ombutocode.git';
// Installer version is kept in lockstep with the workbench version
// (.ombutocode/src/package.json) — every workbench release bumps both
// to the same number. See DeployInstructions.md §3 and §3.0.
const VERSION = '0.2.16';

// Pinned Ombuto Code workbench release to clone.
//
// This installer version ships paired with a specific, tested release of
// the workbench — not the tip of main — so that every `npx create-ombutocode`
// run is reproducible. To ship a new workbench release to users:
//
//   1. Tag and release the workbench on GitHub (see DeployInstructions.md §2)
//   2. Bump CLONE_REF below to the new tag
//   3. Bump this installer's VERSION (above) and the package.json version
//   4. `npm publish` the installer (see DeployInstructions.md §3)
const CLONE_REF = 'v0.2.16';

// Files and directories at the repo root that belong to the Ombuto Code
// upstream project and should be removed from a scaffolded user project.
//
// Two categories:
//
// 1. Maintainer docs — describe how to contribute to / release Ombuto Code
//    itself, not anything the user's new project should inherit.
//
// 2. Sample / demo app files — the upstream repo contains an example
//    Electron + Vue app at the repo root (DropSync) that is used as a
//    test bed for the workbench. It is NOT meant to be a starter template
//    for user projects, so it is stripped too.
const UPSTREAM_FILES_TO_STRIP = [
  // Maintainer docs
  'README.md',
  'CLA.md',
  'CONTRIBUTING.md',
  'DeployInstructions.md',
  'UPGRADING.md',
  'CLAUDE.md',
  'LICENSE', // upstream Apache 2.0 lives under .ombutocode/LICENSE

  // Sample / demo app at the repo root (not a user-facing starter)
  'src',
  'scripts',
  'package.json',
  'package-lock.json',
  'vite.config.js',
  'eslint.config.js',
  'tsconfig.json',

  // Maintainer-only tooling & content — not part of what a user's new project needs
  'migration-tool',
  'marketing',
];

// Files in create-ombutocode/template/ that are copied into the scaffolded
// project after stripping. Any occurrence of {{PROJECT_NAME}} in these
// files is substituted with the user's project name at copy time.
const TEMPLATE_FILES = [
  'README.md',
  'CLAUDE.md',
  'GettingStarted.md',
];

// Root .gitignore entries an adopted project needs so the workbench's
// dependencies and build output never get committed. Runtime state under
// .ombutocode/ (databases, logs, run output) is covered by the
// .ombutocode/.gitignore that ships with the clone.
const OMBUTO_GITIGNORE_LINES = [
  '.ombutocode/src/node_modules/',
  '.ombutocode/src/release/',
  '.ombutocode/src/dist/',
];

// ── Upgrade contract ──
//
// `--upgrade` replaces the workbench code inside an existing project's
// .ombutocode/ with the pinned release and leaves everything else alone.
// These lists are the "Overwrite with the new release" / "Preserve" tables
// in UPGRADING.md. The upgrade only ever deletes or writes the paths named
// in UPGRADE_REPLACE_*; nothing under .ombutocode/ is wiped wholesale, so a
// file that is in neither list is simply left as it was.

// Directories replaced wholesale: the old one is deleted (src/ including
// its node_modules) and the release's copy moved in.
const UPGRADE_REPLACE_DIRS = ['src', 'tools', 'templates', 'scripts', 'bench'];

// Plain files replaced with the release's copy.
const UPGRADE_REPLACE_FILES = [
  'OMBUTOCODE_ENGINEERING_GUIDE.md',
  'README.md',
  'LICENSE',
  'codingagent-templates.json',
];

// Launcher scripts: every plain file directly under .ombutocode/ whose name
// starts with one of these (buildandrun, buildandrun.bat, buildandrun.sh,
// initombuto, initombuto.bat, …) is replaced.
const UPGRADE_REPLACE_PREFIXES = ['buildandrun', 'initombuto'];

// Project state captured in the backup zip before anything is replaced,
// relative to .ombutocode/. Entries that do not exist are skipped. The
// workbench version marker (src/package.json) rides along so the archive
// records what it was taken from.
const UPGRADE_BACKUP_PATHS = [
  'data',
  'codingagents',
  'codingagent-state.json',
  'planning',
  'features',
  'profiles',
  'src/package.json',
];

// ── Helpers ──

function log(msg) { console.log(`  ${msg}`); }
function heading(msg) { console.log(`\n── ${msg} ──`); }

function fatal(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

function run(cmd, opts = {}) {
  try {
    execSync(cmd, { stdio: 'inherit', ...opts });
  } catch {
    fatal(`Command failed: ${cmd}`);
  }
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Move a directory, falling back to copy + delete when the source and
// destination sit on different volumes (rename fails with EXDEV there —
// common when the OS temp directory is on another drive).
function moveDirSync(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    if (err && err.code !== 'EXDEV') throw err;
    copyDirSync(src, dest);
    fs.rmSync(src, { recursive: true, force: true });
  }
}

// Copy every file under srcDir into destDir that does not already exist
// there, recursing into sub-directories. Existing files are never touched.
// Returns the relative paths that were added.
function copyMissingFiles(srcDir, destDir) {
  const added = [];
  const walk = (src, rel) => {
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath = path.join(src, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      const destPath = path.join(destDir, relPath);
      if (entry.isDirectory()) {
        walk(srcPath, relPath);
      } else if (entry.isFile() && !fs.existsSync(destPath)) {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(srcPath, destPath);
        added.push(relPath);
      }
    }
  };
  if (fs.existsSync(srcDir)) walk(srcDir, '');
  return added;
}

function stripUpstreamFiles(projectDir) {
  for (const name of UPSTREAM_FILES_TO_STRIP) {
    const target = path.join(projectDir, name);
    if (fs.existsSync(target)) {
      // Use recursive + force so this handles both files and directories.
      fs.rmSync(target, { recursive: true, force: true });
      log(`Removed upstream ${name}`);
    }
  }
}

// Clone the pinned release into a fresh temp directory and reduce it to the
// workbench: drop the clone's git history, the installer package, the
// upstream maintainer files and the upstream docs/ (which hold the Ombuto
// Code project's own specs and must not leak into someone else's repo).
// Returns the path of the clone's .ombutocode/ and a cleanup function; the
// temp directory is also removed on process exit.
function cloneWorkbench() {
  heading(`Cloning Ombuto Code ${CLONE_REF}`);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'create-ombutocode-'));
  const cloneDir = path.join(tempRoot, 'clone');
  const cleanupTemp = () => { try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch {} };
  process.on('exit', cleanupTemp);
  run(`git clone --depth 1 --branch ${CLONE_REF} ${REPO_URL} "${cloneDir}"`);

  heading('Preparing workbench files');
  fs.rmSync(path.join(cloneDir, '.git'), { recursive: true, force: true });
  fs.rmSync(path.join(cloneDir, 'create-ombutocode'), { recursive: true, force: true });
  stripUpstreamFiles(cloneDir);
  fs.rmSync(path.join(cloneDir, 'docs'), { recursive: true, force: true });
  log('Discarded upstream docs/');

  const clonedOmbutocode = path.join(cloneDir, '.ombutocode');
  if (!fs.existsSync(path.join(clonedOmbutocode, 'src', 'package.json'))) {
    fatal('.ombutocode/src/package.json not found in the clone — repository may be corrupted.');
  }
  return { clonedOmbutocode, cleanupTemp };
}

// Copy the template files into projectDir. With `skipExisting`, a file that
// is already there (the adopted project's own README, CLAUDE.md, …) is left
// untouched.
function writeTemplateFiles(projectDir, projectName, { skipExisting = false } = {}) {
  // Template files ship inside the installer package at ../template
  // relative to this script (bin/create-ombutocode.js).
  const templateDir = path.resolve(__dirname, '..', 'template');
  if (!fs.existsSync(templateDir)) {
    log('Template directory not found — skipping template overlay.');
    return;
  }

  for (const name of TEMPLATE_FILES) {
    const src = path.join(templateDir, name);
    if (!fs.existsSync(src)) {
      log(`Template file missing: ${name} (skipping)`);
      continue;
    }
    const dest = path.join(projectDir, name);
    if (skipExisting && fs.existsSync(dest)) {
      log(`Kept existing ${name}`);
      continue;
    }
    const content = fs.readFileSync(src, 'utf-8')
      .replace(/\{\{PROJECT_NAME\}\}/g, projectName);
    fs.writeFileSync(dest, content);
    log(`Wrote ${name}`);
  }
}

// Ensure the Ombuto ignore lines are present in <projectDir>/.gitignore.
// Creates the file if absent; otherwise appends only the missing lines.
function ensureGitignore(projectDir) {
  const gitignorePath = path.join(projectDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, `# OmbutoCode\n${OMBUTO_GITIGNORE_LINES.join('\n')}\n`);
    log('Wrote .gitignore');
    return;
  }
  const existing = fs.readFileSync(gitignorePath, 'utf-8');
  const present = new Set(existing.split(/\r?\n/).map((l) => l.trim()));
  const missing = OMBUTO_GITIGNORE_LINES.filter((l) => !present.has(l));
  if (missing.length === 0) {
    log('Kept existing .gitignore (Ombuto entries already present)');
    return;
  }
  const separator = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
  fs.appendFileSync(gitignorePath, `${separator}\n# OmbutoCode\n${missing.join('\n')}\n`);
  log(`Appended ${missing.length} Ombuto entr${missing.length === 1 ? 'y' : 'ies'} to .gitignore`);
}

// Run initombuto against projectDir. `initArgs` is the argument list passed
// to the script; `env` lets the caller propagate npm config (see --omit-dev).
function runInitombuto(projectDir, initArgs, env) {
  const isWindows = process.platform === 'win32';
  const initScript = path.join(projectDir, '.ombutocode', isWindows ? 'initombuto.bat' : 'initombuto');

  if (fs.existsSync(initScript)) {
    const argString = initArgs.map((a) => (a.startsWith('--') ? a : `"${a}"`)).join(' ');
    if (isWindows) {
      run(`"${initScript}" ${argString}`, { cwd: projectDir, env });
    } else {
      // Ensure executable
      try { fs.chmodSync(initScript, 0o755); } catch {}
      run(`bash "${initScript}" ${argString}`, { cwd: projectDir, env });
    }
    return;
  }

  log('initombuto script not found — creating docs/ structure manually...');
  const dirs = [
    'Structure', 'Product Requirements Document', 'Architecture',
    'Functional Requirements', 'Non-Functional Requirements', 'Epics',
    'BDD Use Cases', 'Use Cases', 'Use Case Diagrams', 'Class Diagrams',
    'Data Model', 'Style Guide', 'Mockups', 'References', 'Skills',
    'Test Strategy', 'ScratchPad'
  ];
  for (const dir of dirs) {
    fs.mkdirSync(path.join(projectDir, 'docs', dir), { recursive: true });
  }
}

// ── Minimal ZIP writer / reader ──
//
// The installer has no runtime dependencies and must stay that way, so the
// upgrade backup is written with Node's built-in zlib and a hand-rolled ZIP
// container: local file headers, a central directory and an end-of-central-
// directory record, which is everything `unzip`, Expand-Archive and Finder
// need. No zip64 — fewer than 65,535 entries and under 4 GB — which is far
// beyond what a workbench backup holds.

const CRC32_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// MS-DOS date/time fields as stored in ZIP headers (2-second resolution,
// nothing before 1980).
function dosDateTime(date) {
  const d = date.getFullYear() < 1980 ? new Date(1980, 0, 1) : date;
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const ZIP_MAX_ENTRIES = 0xffff;
const ZIP_MAX_BYTES = 0xffffffff;

// Write a ZIP archive. `entries` is an array of { name, data } or
// { name, file } (read from disk at write time, so a backup does not have
// to sit in memory all at once), with an optional `mtime`. Names use
// forward slashes. Each entry is deflated unless that would not save
// anything, in which case it is stored. Returns { entries, bytes }.
function writeZip(zipPath, entries) {
  if (entries.length > ZIP_MAX_ENTRIES) {
    throw new Error(`too many files for a plain ZIP archive (${entries.length})`);
  }
  const fd = fs.openSync(zipPath, 'w');
  const central = [];
  let offset = 0;
  const write = (buf) => { fs.writeSync(fd, buf); offset += buf.length; };
  try {
    for (const entry of entries) {
      const data = entry.data !== undefined ? entry.data : fs.readFileSync(entry.file);
      const mtime = entry.mtime || (entry.file ? fs.statSync(entry.file).mtime : new Date());
      if (data.length > ZIP_MAX_BYTES) throw new Error(`${entry.name} is too large for a plain ZIP archive`);
      const name = Buffer.from(entry.name, 'utf8');
      const crc = crc32(data);
      let method = 8;
      let payload = zlib.deflateRawSync(data);
      if (payload.length >= data.length) { method = 0; payload = data; }
      const { time, date } = dosDateTime(mtime);

      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);   // local file header signature
      local.writeUInt16LE(20, 4);           // version needed to extract (2.0)
      local.writeUInt16LE(0x0800, 6);       // flags: UTF-8 file names
      local.writeUInt16LE(method, 8);
      local.writeUInt16LE(time, 10);
      local.writeUInt16LE(date, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(payload.length, 18);
      local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(name.length, 26);
      local.writeUInt16LE(0, 28);           // extra field length
      central.push({ name, method, time, date, crc, compressedSize: payload.length, size: data.length, offset });
      write(local);
      write(name);
      write(payload);
      if (offset > ZIP_MAX_BYTES) throw new Error('archive is too large for a plain ZIP archive');
    }

    const cdStart = offset;
    for (const e of central) {
      const header = Buffer.alloc(46);
      header.writeUInt32LE(0x02014b50, 0);  // central directory header signature
      header.writeUInt16LE(20, 4);          // version made by
      header.writeUInt16LE(20, 6);          // version needed to extract
      header.writeUInt16LE(0x0800, 8);      // flags: UTF-8 file names
      header.writeUInt16LE(e.method, 10);
      header.writeUInt16LE(e.time, 12);
      header.writeUInt16LE(e.date, 14);
      header.writeUInt32LE(e.crc, 16);
      header.writeUInt32LE(e.compressedSize, 20);
      header.writeUInt32LE(e.size, 24);
      header.writeUInt16LE(e.name.length, 28);
      header.writeUInt16LE(0, 30);          // extra field length
      header.writeUInt16LE(0, 32);          // file comment length
      header.writeUInt16LE(0, 34);          // disk number start
      header.writeUInt16LE(0, 36);          // internal attributes
      header.writeUInt32LE(0, 38);          // external attributes
      header.writeUInt32LE(e.offset, 42);   // local header offset
      write(header);
      write(e.name);
    }

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);      // end of central directory signature
    eocd.writeUInt16LE(0, 4);               // this disk
    eocd.writeUInt16LE(0, 6);               // disk with the central directory
    eocd.writeUInt16LE(central.length, 8);  // entries on this disk
    eocd.writeUInt16LE(central.length, 10); // entries total
    eocd.writeUInt32LE(offset - cdStart, 12);
    eocd.writeUInt32LE(cdStart, 16);
    eocd.writeUInt16LE(0, 20);              // comment length
    write(eocd);
  } finally {
    fs.closeSync(fd);
  }
  return { entries: central.length, bytes: offset };
}

// Read a ZIP archive's central directory: [{ name, method, crc32, size,
// compressedSize, offset }]. With `verify`, every entry's data is also
// inflated and checked against its CRC, which is what makes the backup
// trustworthy before anything is deleted. Throws on a malformed archive.
function readZipEntries(zipPath, { verify = false } = {}) {
  const buf = fs.readFileSync(zipPath);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error(`${zipPath}: not a ZIP archive (no end-of-central-directory record)`);
  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);

  const entries = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) {
      throw new Error(`${zipPath}: corrupt central directory at entry ${i}`);
    }
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    entries.push({
      name: buf.toString('utf8', p + 46, p + 46 + nameLen),
      method: buf.readUInt16LE(p + 10),
      crc32: buf.readUInt32LE(p + 16),
      compressedSize: buf.readUInt32LE(p + 20),
      size: buf.readUInt32LE(p + 24),
      offset: buf.readUInt32LE(p + 42),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (p !== cdOffset + cdSize) throw new Error(`${zipPath}: central directory size mismatch`);

  if (verify) {
    for (const e of entries) {
      const h = e.offset;
      if (buf.readUInt32LE(h) !== 0x04034b50) throw new Error(`${zipPath}: bad local header for ${e.name}`);
      const dataStart = h + 30 + buf.readUInt16LE(h + 26) + buf.readUInt16LE(h + 28);
      const payload = buf.subarray(dataStart, dataStart + e.compressedSize);
      let data;
      try {
        data = e.method === 8 ? zlib.inflateRawSync(payload) : payload;
      } catch (err) {
        throw new Error(`${zipPath}: ${e.name} does not verify (${err.message})`);
      }
      if (data.length !== e.size || crc32(data) !== e.crc32) {
        throw new Error(`${zipPath}: ${e.name} does not verify (size or CRC mismatch)`);
      }
    }
  }
  return entries;
}

// ── Upgrade helpers ──

function isPidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}

// Executable name of a running process, or null if it cannot be determined.
function processImageName(pid) {
  const opts = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
  try {
    if (process.platform === 'win32') {
      const out = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, opts);
      const m = out.match(/^"([^"]+)","(\d+)"/m);
      return m && Number(m[2]) === pid ? m[1] : null;
    }
    return execSync(`ps -p ${pid} -o comm=`, opts).trim() || null;
  } catch {
    return null;
  }
}

// The workbench writes its PID to .ombutocode/.instance.lock on startup and
// removes the file on a clean exit (see acquireProjectLock in main.js). A
// crashed app, or a project scaffolded from a clone, leaves a stale PID
// behind, so a lock only counts when that PID is alive and — where the OS
// tells us — actually belongs to Electron / Ombuto Code rather than to some
// unrelated process that inherited the number. Returns { pid, image } for
// a running workbench, else null.
function findRunningWorkbench(ombutoDir) {
  const lockPath = path.join(ombutoDir, '.instance.lock');
  if (!fs.existsSync(lockPath)) return null;
  const pid = parseInt(fs.readFileSync(lockPath, 'utf8').trim(), 10);
  if (!Number.isFinite(pid) || pid <= 0 || pid === process.pid) return null;
  if (!isPidAlive(pid)) return null;
  const image = processImageName(pid);
  if (image && !/electron|ombuto/i.test(image)) return null;
  return { pid, image };
}

function readWorkbenchVersion(ombutoDir) {
  const pkgPath = path.join(ombutoDir, 'src', 'package.json');
  try {
    const version = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
    return typeof version === 'string' && version ? version : null;
  } catch {
    return null;
  }
}

// Numeric dotted-version comparison: negative if a < b, positive if a > b.
function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Every file under the preserved paths (UPGRADE_BACKUP_PATHS), as ZIP
// entries named `.ombutocode/<relative path>` so the archive extracts back
// into place from the project root.
function collectBackupEntries(ombutoDir) {
  const entries = [];
  const walk = (abs, rel) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const absPath = path.join(abs, entry.name);
      const relPath = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(absPath, relPath);
      else if (entry.isFile()) entries.push({ name: relPath, file: absPath });
    }
  };
  for (const p of UPGRADE_BACKUP_PATHS) {
    const abs = path.join(ombutoDir, p);
    if (!fs.existsSync(abs)) continue;
    const rel = `.ombutocode/${p}`;
    if (fs.statSync(abs).isDirectory()) walk(abs, rel);
    else entries.push({ name: rel, file: abs });
  }
  return entries;
}

// Write `.ombutocode-backup-<version>-<YYYYMMDD-HHMMSS>.zip` into projectDir
// and verify it by re-reading the central directory (entry count, CRCs, and
// that ombutocode.db made it in whenever it existed). Returns
// { zipPath, entries, bytes }.
function backupWorkbenchState(projectDir, currentVersion, now = new Date()) {
  const ombutoDir = path.join(projectDir, '.ombutocode');
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const zipPath = path.join(projectDir, `.ombutocode-backup-${currentVersion}-${stamp}.zip`);

  const entries = collectBackupEntries(ombutoDir);
  const written = writeZip(zipPath, entries);
  const listed = readZipEntries(zipPath, { verify: true });
  if (listed.length !== entries.length) {
    throw new Error(`backup verification failed: wrote ${entries.length} entries, archive lists ${listed.length}`);
  }
  const dbName = '.ombutocode/data/ombutocode.db';
  if (fs.existsSync(path.join(ombutoDir, 'data', 'ombutocode.db')) && !listed.some((e) => e.name === dbName)) {
    throw new Error(`backup verification failed: ${dbName} is missing from the archive`);
  }
  return { zipPath, entries: listed.length, bytes: written.bytes };
}

// Replace the workbench code in targetOmbutoDir with the release in
// newOmbutoDir, following the upgrade contract above. newOmbutoDir is
// consumed (its directories are moved, not copied). Returns a summary:
// { replaced, removed, profilesAdded, codingagentsAdded, codingagentsNew }.
function replaceWorkbench(targetOmbutoDir, newOmbutoDir, logFn = log) {
  const result = { replaced: [], removed: [], profilesAdded: [], codingagentsAdded: [], codingagentsNew: null };
  const rm = (p) => fs.rmSync(p, { recursive: true, force: true, maxRetries: 3 });

  // Directories: delete the old one entirely, then move the release's in.
  for (const name of UPGRADE_REPLACE_DIRS) {
    const target = path.join(targetOmbutoDir, name);
    const source = path.join(newOmbutoDir, name);
    const hadOld = fs.existsSync(target);
    if (hadOld) rm(target);
    if (fs.existsSync(source)) {
      moveDirSync(source, target);
      result.replaced.push(`${name}/`);
      logFn(`Replaced ${name}/`);
    } else if (hadOld) {
      result.removed.push(`${name}/`);
      logFn(`Removed ${name}/ (not shipped by this release)`);
    }
  }

  // Plain files, including every launcher script (buildandrun*, initombuto*)
  // present on either side, so a launcher the release dropped goes too.
  const fileNames = new Set(UPGRADE_REPLACE_FILES);
  for (const dir of [targetOmbutoDir, newOmbutoDir]) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && UPGRADE_REPLACE_PREFIXES.some((p) => entry.name.startsWith(p))) {
        fileNames.add(entry.name);
      }
    }
  }
  for (const name of fileNames) {
    const target = path.join(targetOmbutoDir, name);
    const source = path.join(newOmbutoDir, name);
    const hadOld = fs.existsSync(target);
    if (hadOld) rm(target);
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, target);
      try { fs.chmodSync(target, fs.statSync(source).mode); } catch {}
      result.replaced.push(name);
      logFn(`Replaced ${name}`);
    } else if (hadOld) {
      result.removed.push(name);
      logFn(`Removed ${name} (not shipped by this release)`);
    }
  }

  // profiles/: additive only — the same rule initombuto applies to skills.
  result.profilesAdded = copyMissingFiles(path.join(newOmbutoDir, 'profiles'), path.join(targetOmbutoDir, 'profiles'));
  for (const rel of result.profilesAdded) logFn(`Added profiles/${rel}`);

  // codingagents/: codingagents.yml is the user's agent configuration and is
  // never overwritten. When the release's copy differs it is written
  // alongside as codingagents.yml.new for the user to merge. Any other file
  // the release ships in that directory is added only if missing.
  const ymlSource = path.join(newOmbutoDir, 'codingagents', 'codingagents.yml');
  const ymlTarget = path.join(targetOmbutoDir, 'codingagents', 'codingagents.yml');
  const ymlNew = `${ymlTarget}.new`;
  if (fs.existsSync(ymlSource) && fs.existsSync(ymlTarget)) {
    if (fs.readFileSync(ymlSource).equals(fs.readFileSync(ymlTarget))) {
      if (fs.existsSync(ymlNew)) rm(ymlNew);
    } else {
      fs.copyFileSync(ymlSource, ymlNew);
      result.codingagentsNew = ymlNew;
      logFn('Kept codingagents/codingagents.yml; the release\'s version differs and was written as codingagents.yml.new');
    }
  }
  result.codingagentsAdded = copyMissingFiles(path.join(newOmbutoDir, 'codingagents'), path.join(targetOmbutoDir, 'codingagents'));
  for (const rel of result.codingagentsAdded) logFn(`Added codingagents/${rel}`);

  return result;
}

// Seed docs/Skills/ with any skill template the release ships that the
// project does not have yet — the same file-by-file rule initombuto uses.
// initombuto itself is deliberately not run here: even with --keep-docs it
// deletes the database, ticket files, features and agent state first.
// Returns the relative paths added.
function seedMissingSkills(projectDir, ombutoDir, logFn = log) {
  const docsDir = path.join(projectDir, 'docs');
  if (!fs.existsSync(docsDir)) {
    logFn('No docs/ directory — skipped skill seeding');
    return [];
  }
  const added = copyMissingFiles(path.join(ombutoDir, 'templates', 'skills'), path.join(docsDir, 'Skills'));
  for (const rel of added) logFn(`Added docs/Skills/${rel}`);
  return added;
}

// ── CLI ──

const HELP = `
  create-ombutocode v${VERSION}

  Create a new Ombuto Code project — Agentic Software Engineering Workbench

  Usage:
    npx create-ombutocode <project-name> [--omit-dev]
    npx create-ombutocode --into-existing <dir> [--omit-dev]
    npx create-ombutocode --upgrade [<dir>] [--no-backup] [--force] [--omit-dev]

  Options:
    --into-existing <dir>   Adopt Ombuto Code into an existing directory
                            instead of creating a new project. Adds
                            .ombutocode/ and seeds docs/ without touching
                            any file that is already there, and never runs
                            git init/add/commit. <dir> must exist and must
                            not already contain .ombutocode/.
    --upgrade [<dir>]       Upgrade the workbench (.ombutocode/) of an
                            existing project to this installer's release,
                            ${CLONE_REF}. <dir> defaults to the current directory.
                            Replaces only workbench code (src/, tools/,
                            templates/, scripts/, bench/, the launcher
                            scripts, the engineering guide, README, LICENSE
                            and codingagent-templates.json); the database,
                            tickets, codingagents.yml, profiles and docs/
                            are left alone. Zips the preserved state into
                            .ombutocode-backup-<version>-<timestamp>.zip
                            first, and refuses to run while the workbench
                            is open.
    --no-backup             Skip the backup zip (--upgrade only).
    --force                 Upgrade even when the project is already at
                            ${CLONE_REF} or newer (--upgrade only).
    --omit-dev              Install with \`npm install --omit=dev
                            --legacy-peer-deps\`: no Electron, Vite or
                            electron-builder. For headless and CLI use only —
                            the workbench UI cannot be built from such an
                            install.
    -h, --help              Show this help.

  Example:
    npx create-ombutocode my-app
    cd my-app
    .ombutocode/buildandrun.bat     # Windows
    bash .ombutocode/buildandrun    # macOS / Linux

  Example (existing repository, headless):
    npx create-ombutocode --into-existing /app --omit-dev
    cd /app
    node .ombutocode/src/headless.js status

  Example (upgrade the workbench in the current project):
    cd my-app
    npx create-ombutocode@latest --upgrade
`;

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    process.exit(0);
  }

  let projectName = null;
  let intoExisting = null;
  let upgrade = null;       // false: not requested; string: directory to upgrade
  let omitDev = false;
  let noBackup = false;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--omit-dev') {
      omitDev = true;
    } else if (arg === '--no-backup') {
      noBackup = true;
    } else if (arg === '--force') {
      force = true;
    } else if (arg === '--into-existing') {
      intoExisting = args[i + 1];
      i++;
      if (!intoExisting || intoExisting.startsWith('-')) {
        fatal('--into-existing requires a directory:\n\n  npx create-ombutocode --into-existing /path/to/repo\n');
      }
    } else if (arg.startsWith('--into-existing=')) {
      intoExisting = arg.slice('--into-existing='.length);
      if (!intoExisting) {
        fatal('--into-existing requires a directory:\n\n  npx create-ombutocode --into-existing /path/to/repo\n');
      }
    } else if (arg === '--upgrade') {
      // Optional directory; defaults to the current directory.
      if (args[i + 1] !== undefined && !args[i + 1].startsWith('-')) {
        upgrade = args[i + 1];
        i++;
      } else {
        upgrade = '.';
      }
    } else if (arg.startsWith('--upgrade=')) {
      upgrade = arg.slice('--upgrade='.length) || '.';
    } else if (arg.startsWith('-')) {
      fatal(`Unknown option "${arg}". Run with --help for usage.`);
    } else if (projectName === null) {
      projectName = arg;
    } else {
      fatal(`Unexpected argument "${arg}". Run with --help for usage.`);
    }
  }

  if ((noBackup || force) && upgrade === null) {
    fatal('--no-backup and --force only apply to --upgrade. Run with --help for usage.');
  }

  // --omit=dev alone still downloads Electron: @electron/remote (a runtime
  // dependency) declares electron as a peer dependency and npm 7+ installs
  // peers automatically. --legacy-peer-deps turns that off; --omit=peer does
  // not (verified against npm 10). Nothing headless.js loads needs a peer.
  const npmInstallCmd = omitDev
    ? 'npm install --no-audit --no-fund --omit=dev --legacy-peer-deps'
    : 'npm install --no-audit --no-fund';
  // initombuto runs its own plain `npm install`; npm reads npm_config_* from
  // the environment, so this keeps that second install from adding the dev
  // dependencies and Electron back.
  const initEnv = omitDev
    ? { ...process.env, npm_config_omit: 'dev', npm_config_legacy_peer_deps: 'true' }
    : process.env;

  function noteOmitDev() {
    if (!omitDev) return;
    log('--omit-dev: Electron, Vite and electron-builder were not installed.');
    log('The workbench UI cannot be built from this install; use the headless CLI');
    log('(node .ombutocode/src/headless.js) or re-run `npm install` in .ombutocode/src.');
  }

  const banner = () => console.log(`
╔═══════════════════════════════════════════╗
║         create-ombutocode v${VERSION}         ║
║   Agentic Software Engineering Workbench  ║
╚═══════════════════════════════════════════╝
`);

  // ═════════════════════════════════════════════════════════════════════
  // Upgrade the workbench in an existing project
  // ═════════════════════════════════════════════════════════════════════

  if (upgrade !== null) {
    if (intoExisting !== null) {
      fatal('--upgrade cannot be combined with --into-existing.');
    }
    // `create-ombutocode my-app --upgrade` reads as naturally as
    // `--upgrade my-app`; treat the positional as the directory.
    if (projectName !== null) {
      if (upgrade !== '.') fatal(`Unexpected argument "${projectName}". Run with --help for usage.`);
      upgrade = projectName;
    }

    const projectDir = path.resolve(upgrade);
    const ombutoDir = path.join(projectDir, '.ombutocode');
    if (!fs.existsSync(path.join(ombutoDir, 'src', 'package.json'))) {
      fatal(`"${projectDir}" does not contain .ombutocode/src/package.json — nothing to upgrade.\n  To add Ombuto Code to a directory that does not have it yet, use:\n\n    npx create-ombutocode --into-existing "${projectDir}"\n`);
    }

    banner();
    console.log(`Upgrading Ombuto Code in: ${projectDir}`);

    // ── Step 1: Preflight ──

    heading('Checking the project');
    const running = findRunningWorkbench(ombutoDir);
    if (running) {
      fatal(`The workbench appears to be running for this project (PID ${running.pid}${running.image ? `, ${running.image}` : ''}).\n  Close Ombuto Code and run the upgrade again. If the app is not running,\n  delete the stale lock file .ombutocode/.instance.lock and retry.`);
    }
    const currentVersion = readWorkbenchVersion(ombutoDir) || 'unknown';
    const targetVersion = CLONE_REF.replace(/^v/, '');
    const cmp = currentVersion === 'unknown' ? -1 : compareVersions(currentVersion, targetVersion);
    if (cmp === 0 && !force) {
      log(`.ombutocode is already at ${targetVersion} — nothing to do. (Use --force to reinstall it anyway.)`);
      process.exit(0);
    }
    if (cmp > 0 && !force) {
      fatal(`.ombutocode is at ${currentVersion}, which is newer than this installer's release (${targetVersion}).\n  Run \`npx create-ombutocode@latest --upgrade\` to use the newest installer, or pass --force to downgrade.`);
    }
    log(`Upgrading .ombutocode from ${currentVersion} to ${targetVersion}${cmp > 0 ? ' (downgrade, --force)' : cmp === 0 ? ' (reinstall, --force)' : ''}`);

    // ── Step 2: Backup ──

    let backup = null;
    if (noBackup) {
      heading('Backup');
      log('--no-backup: skipping the backup zip.');
    } else {
      heading('Backing up project state');
      try {
        backup = backupWorkbenchState(projectDir, currentVersion);
      } catch (err) {
        fatal(`Could not write the backup: ${err.message}\n  Nothing has been changed. Fix the problem and retry, or pass --no-backup.`);
      }
      log(`Wrote ${path.basename(backup.zipPath)} (${backup.entries} files, ${(backup.bytes / 1024).toFixed(0)} KB)`);
    }

    // ── Step 3: Fetch the release ──

    const { clonedOmbutocode, cleanupTemp } = cloneWorkbench();

    // ── Step 4: Replace the workbench code ──
    //
    // From here on the project is being modified. Any failure — including
    // one inside `run()`, which exits the process — has to leave the user
    // with clear recovery instructions, hence the exit hook.

    heading('Replacing workbench code');
    let replacing = true;
    process.on('exit', (code) => {
      if (code === 0 || !replacing) return;
      console.error(`
✖ The upgrade did not complete; .ombutocode/ may be half-replaced.
  To restore the previous workbench:
    git checkout -- .ombutocode            # if it was committed, and
${backup ? `    unzip -o "${path.basename(backup.zipPath)}"   # or Expand-Archive on Windows\n` : ''}  then re-run the upgrade once the cause is fixed.`);
    });

    let summary;
    try {
      summary = replaceWorkbench(ombutoDir, clonedOmbutocode);
      seedMissingSkills(projectDir, ombutoDir);
    } catch (err) {
      fatal(`Replacing the workbench failed: ${err.message}`);
    }
    cleanupTemp();

    // ── Step 5: Install dependencies ──

    heading('Installing dependencies');
    run(npmInstallCmd, { cwd: path.join(ombutoDir, 'src') });
    noteOmitDev();
    replacing = false;

    // ── Done ──

    const newVersion = readWorkbenchVersion(ombutoDir) || targetVersion;
    console.log(`
╔═══════════════════════════════════════════╗
║           Workbench upgraded!             ║
╚═══════════════════════════════════════════╝

  .ombutocode: ${currentVersion} → ${newVersion}
`);
    if (backup) {
      console.log(`  Backup of your database, tickets, agent config and profiles:
    ${backup.zipPath}
  Delete it once you are happy with the upgrade (or ignore .ombutocode-backup-*.zip).
`);
    }
    if (summary.codingagentsNew) {
      console.log(`  codingagents/codingagents.yml was kept as-is. This release ships a
  different default, written next to it as codingagents.yml.new — compare
  and merge anything you want, then delete the .new file.
`);
    }
    console.log(`  Next:
    git status                  # review what changed under .ombutocode/ and docs/Skills/
    git add -A .ombutocode docs && git commit -m "Upgrade Ombuto Code to ${newVersion}"

  Check the release notes for version-specific steps:
    https://github.com/FrancoisBotha/ombutocode/releases
${omitDev ? `
  # Headless CLI:
  node .ombutocode/src/headless.js status
` : `
  # Launch the workbench:
  .ombutocode/buildandrun.bat          # Windows
  bash .ombutocode/buildandrun         # macOS / Linux
`}`);
    process.exit(0);
  }

  // ═════════════════════════════════════════════════════════════════════
  // Adopt into an existing directory
  // ═════════════════════════════════════════════════════════════════════

  if (intoExisting !== null) {
    if (projectName !== null) {
      fatal('Give either a <project-name> or --into-existing <dir>, not both.');
    }

    const targetDir = path.resolve(intoExisting);
    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
      fatal(`Directory "${targetDir}" does not exist. --into-existing adopts an existing directory; use \`npx create-ombutocode <project-name>\` to create a new one.`);
    }
    if (fs.existsSync(path.join(targetDir, '.ombutocode'))) {
      fatal(`"${targetDir}" already contains .ombutocode/ — refusing to overwrite an existing Ombuto Code installation. To move it to this installer's release, use \`npx create-ombutocode --upgrade "${targetDir}"\`.`);
    }
    const targetName = path.basename(targetDir);
    const targetIsGitRepo = fs.existsSync(path.join(targetDir, '.git'));

    banner();
    console.log(`Adopting Ombuto Code into: ${targetDir}`);

    // ── Step 1: Clone the pinned release and reduce it to the workbench ──
    //
    // Only .ombutocode/ travels into the adopted directory. The clone's
    // docs/ holds the upstream project's own specs and epics, which must not
    // leak into someone else's repository — the docs/ skeleton is seeded by
    // initombuto below instead, file by file, only where nothing exists yet.

    const { clonedOmbutocode, cleanupTemp } = cloneWorkbench();
    moveDirSync(clonedOmbutocode, path.join(targetDir, '.ombutocode'));
    log('Added .ombutocode/');
    cleanupTemp();

    writeTemplateFiles(targetDir, targetName, { skipExisting: true });
    ensureGitignore(targetDir);

    // ── Step 2: Install dependencies ──

    heading('Installing dependencies');
    run(npmInstallCmd, { cwd: path.join(targetDir, '.ombutocode', 'src') });
    noteOmitDev();

    // ── Step 3: Initialise project data ──
    //
    // --keep-docs: never wipe docs/. initombuto still creates every missing
    // docs/ folder, starter document and skill file, and skips any file that
    // already exists, which is the non-destructive merge an adopted repo needs.

    heading('Initialising project');
    runInitombuto(targetDir, ['--keep-docs', targetDir], initEnv);

    // ── No Step 4: the directory's git history is the owner's business ──

    console.log(`
╔═══════════════════════════════════════════╗
║            Workbench added!               ║
╚═══════════════════════════════════════════╝

  cd ${targetName}
`);
    if (targetIsGitRepo) {
      console.log(`  This directory is already a git repository. Nothing was committed;
  when you are ready, commit the workbench and its docs skeleton:

    git add .ombutocode docs .gitignore
    git commit -m "Add Ombuto Code workbench"
`);
    } else {
      console.log(`  This directory is not a git repository. The workbench needs one
  (agents build in git worktrees), so initialise it before running agents:

    git init && git add -A && git commit -m "Initial commit"
`);
    }
    console.log(`  # Read this first:
  GettingStarted.md           — what's in the project and what to do next
${omitDev ? `
  # Headless CLI:
  node .ombutocode/src/headless.js status
` : `
  # Launch the workbench:
  .ombutocode/buildandrun.bat          # Windows
  bash .ombutocode/buildandrun         # macOS / Linux
`}
  Happy building!
`);
    process.exit(0);
  }

  // ═════════════════════════════════════════════════════════════════════
  // Create a new project
  // ═════════════════════════════════════════════════════════════════════

  if (!projectName) {
    fatal('Please specify a project name:\n\n  npx create-ombutocode my-app\n');
  }

  if (fs.existsSync(projectName)) {
    fatal(`Directory "${projectName}" already exists.`);
  }

  // ── Banner ──

  banner();

  console.log(`Creating project: ${projectName}`);

  // ── Step 1: Clone the repository at the pinned release tag ──

  heading(`Cloning Ombuto Code ${CLONE_REF}`);
  run(`git clone --depth 1 --branch ${CLONE_REF} ${REPO_URL} "${projectName}"`);

  const projectDir = path.resolve(projectName);

  // Remove the .git directory so the user starts fresh
  const gitDir = path.join(projectDir, '.git');
  if (fs.existsSync(gitDir)) {
    log('Removing upstream .git history...');
    fs.rmSync(gitDir, { recursive: true, force: true });
  }

  // Remove create-ombutocode directory (the installer itself)
  const installerDir = path.join(projectDir, 'create-ombutocode');
  if (fs.existsSync(installerDir)) {
    log('Removing installer package...');
    fs.rmSync(installerDir, { recursive: true, force: true });
  }

  // ── Step 1b: Strip upstream maintainer files & write project templates ──
  //
  // The Ombuto Code repo we just cloned contains files that belong to the
  // upstream project (README, CLA, CONTRIBUTING, DeployInstructions, CLAUDE,
  // root LICENSE) — they should not travel into the user's new project.
  // Replace them with minimal project-specific templates.

  heading('Preparing project files');
  stripUpstreamFiles(projectDir);
  writeTemplateFiles(projectDir, projectName);

  // ── Step 2: Install dependencies ──

  heading('Installing dependencies');
  const srcDir = path.join(projectDir, '.ombutocode', 'src');
  if (fs.existsSync(path.join(srcDir, 'package.json'))) {
    run(npmInstallCmd, { cwd: srcDir });
    noteOmitDev();
  } else {
    fatal('.ombutocode/src/package.json not found — repository may be corrupted.');
  }

  // ── Step 3: Initialise project data ──

  heading('Initialising project');

  // Run initombuto with --clear to create fresh docs/
  runInitombuto(projectDir, ['--clear', projectDir], initEnv);

  // ── Step 4: Initialise git ──

  heading('Initialising Git repository');
  run('git init', { cwd: projectDir });
  run('git add -A', { cwd: projectDir });
  run('git commit -m "Initial commit — Ombuto Code project"', { cwd: projectDir });

  // ── Done ──

  console.log(`
╔═══════════════════════════════════════════╗
║            Project ready!                 ║
╚═══════════════════════════════════════════╝

  cd ${projectName}

  # Read this first:
  GettingStarted.md           — what's in the project and what to do next

  # Launch the workbench:
  .ombutocode/buildandrun.bat          # Windows
  bash .ombutocode/buildandrun         # macOS / Linux

  Happy building!
`);
}

// Exported for the tests in ../test; the CLI only runs when this file is
// executed directly.
module.exports = {
  VERSION,
  CLONE_REF,
  UPGRADE_REPLACE_DIRS,
  UPGRADE_REPLACE_FILES,
  UPGRADE_REPLACE_PREFIXES,
  UPGRADE_BACKUP_PATHS,
  crc32,
  writeZip,
  readZipEntries,
  collectBackupEntries,
  backupWorkbenchState,
  replaceWorkbench,
  seedMissingSkills,
  findRunningWorkbench,
  compareVersions,
  copyMissingFiles,
};

if (require.main === module) {
  main();
}
