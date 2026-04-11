#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_URL = 'https://github.com/FrancoisBotha/ombutocode.git';
const VERSION = '1.0.0';

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

// ── Step 1: Clone the repository ──

heading('Cloning Ombuto Code repository');
run(`git clone --depth 1 ${REPO_URL} "${projectName}"`);

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

  # Run Ombuto Code:
  .ombutocode/buildandrun.bat          # Windows
  bash .ombutocode/buildandrun         # macOS / Linux

  # Or manually:
  cd .ombutocode/src
  npx vite build && npx electron .

  # Configure coding agents in Settings → Coding Agents.
  # See the README for more details.

  Happy building!
`);
