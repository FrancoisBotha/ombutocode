#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const REPO_URL = 'https://github.com/FrancoisBotha/ombutocode.git';
// Installer version is kept in lockstep with the workbench version
// (.ombutocode/src/package.json) — every workbench release bumps both
// to the same number. See DeployInstructions.md §3 and §3.0.
const VERSION = '0.2.10';

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
const CLONE_REF = 'v0.2.10';

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

// ── CLI ──

const HELP = `
  create-ombutocode v${VERSION}

  Create a new Ombuto Code project — Agentic Software Engineering Workbench

  Usage:
    npx create-ombutocode <project-name> [--omit-dev]
    npx create-ombutocode --into-existing <dir> [--omit-dev]

  Options:
    --into-existing <dir>   Adopt Ombuto Code into an existing directory
                            instead of creating a new project. Adds
                            .ombutocode/ and seeds docs/ without touching
                            any file that is already there, and never runs
                            git init/add/commit. <dir> must exist and must
                            not already contain .ombutocode/.
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
`;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}

let projectName = null;
let intoExisting = null;
let omitDev = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--omit-dev') {
    omitDev = true;
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
  } else if (arg.startsWith('-')) {
    fatal(`Unknown option "${arg}". Run with --help for usage.`);
  } else if (projectName === null) {
    projectName = arg;
  } else {
    fatal(`Unexpected argument "${arg}". Run with --help for usage.`);
  }
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
    fatal(`"${targetDir}" already contains .ombutocode/ — refusing to overwrite an existing Ombuto Code installation.`);
  }
  const targetName = path.basename(targetDir);
  const targetIsGitRepo = fs.existsSync(path.join(targetDir, '.git'));

  console.log(`
╔═══════════════════════════════════════════╗
║         create-ombutocode v${VERSION}         ║
║   Agentic Software Engineering Workbench  ║
╚═══════════════════════════════════════════╝
`);
  console.log(`Adopting Ombuto Code into: ${targetDir}`);

  // ── Step 1: Clone the pinned release into a temp directory ──

  heading(`Cloning Ombuto Code ${CLONE_REF}`);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'create-ombutocode-'));
  const cloneDir = path.join(tempRoot, 'clone');
  const cleanupTemp = () => { try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch {} };
  process.on('exit', cleanupTemp);
  run(`git clone --depth 1 --branch ${CLONE_REF} ${REPO_URL} "${cloneDir}"`);

  // ── Step 1b: Strip everything that is not the workbench ──
  //
  // Only .ombutocode/ travels into the adopted directory. The clone's
  // docs/ holds the upstream project's own specs and epics, which must not
  // leak into someone else's repository — the docs/ skeleton is seeded by
  // initombuto below instead, file by file, only where nothing exists yet.

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

console.log(`
╔═══════════════════════════════════════════╗
║         create-ombutocode v${VERSION}         ║
║   Agentic Software Engineering Workbench  ║
╚═══════════════════════════════════════════╝
`);

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
