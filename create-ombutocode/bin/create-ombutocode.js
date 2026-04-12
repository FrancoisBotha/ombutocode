#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_URL = 'https://github.com/FrancoisBotha/ombutocode.git';
// Installer version is kept in lockstep with the workbench version
// (.ombutocode/src/package.json) — every workbench release bumps both
// to the same number. See DeployInstructions.md §3 and §3.0.
const VERSION = '0.1.1';

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
const CLONE_REF = 'v0.1.1';

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
];

// Files in create-ombutocode/template/ that are copied into the scaffolded
// project after stripping. Any occurrence of {{PROJECT_NAME}} in these
// files is substituted with the user's project name at copy time.
const TEMPLATE_FILES = [
  'README.md',
  'CLAUDE.md',
  'GettingStarted.md',
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

function writeTemplateFiles(projectDir, projectName) {
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
    const content = fs.readFileSync(src, 'utf-8')
      .replace(/\{\{PROJECT_NAME\}\}/g, projectName);
    fs.writeFileSync(path.join(projectDir, name), content);
    log(`Wrote ${name}`);
  }
}

// ── CLI ──

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  create-ombutocode v${VERSION}

  Create a new Ombuto Code project — Agentic Software Engineering Workbench

  Usage:
    npx create-ombutocode <project-name>

  Example:
    npx create-ombutocode my-app
    cd my-app
    .ombutocode/buildandrun.bat     # Windows
    bash .ombutocode/buildandrun    # macOS / Linux
`);
  process.exit(0);
}

const projectName = args[0];
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
  run('npm install --no-audit --no-fund', { cwd: srcDir });
} else {
  fatal('.ombutocode/src/package.json not found — repository may be corrupted.');
}

// ── Step 3: Initialise project data ──

heading('Initialising project');

// Run initombuto with --clear to create fresh docs/
const isWindows = process.platform === 'win32';
const initScript = path.join(projectDir, '.ombutocode', isWindows ? 'initombuto.bat' : 'initombuto');

if (fs.existsSync(initScript)) {
  if (isWindows) {
    run(`"${initScript}" --clear "${projectDir}"`, { cwd: projectDir });
  } else {
    // Ensure executable
    try { fs.chmodSync(initScript, 0o755); } catch {}
    run(`bash "${initScript}" --clear "${projectDir}"`, { cwd: projectDir });
  }
} else {
  log('initombuto script not found — creating docs/ structure manually...');
  const dirs = [
    'Structure', 'Product Requirements Document', 'Architecture',
    'Functional Requirements', 'Non-Functional Requirements', 'Epics',
    'Use Cases', 'Use Case Diagrams', 'Class Diagrams', 'Data Model',
    'Style Guide', 'Mockups', 'References', 'Skills', 'ScratchPad'
  ];
  for (const dir of dirs) {
    fs.mkdirSync(path.join(projectDir, 'docs', dir), { recursive: true });
  }
}

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
