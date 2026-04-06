const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { cleanupRunOutput } = require('../src/main/runOutputCleanup');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'run-output-cleanup-test-'));
}

function createFileWithAge(dir, name, ageDays) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, 'log content');
  const mtime = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
  fs.utimesSync(filePath, mtime, mtime);
  return filePath;
}

function silentLogger() {
  const messages = [];
  return {
    log: (...args) => messages.push(args.join(' ')),
    warn: (...args) => messages.push(args.join(' ')),
    messages
  };
}

test('removes files older than 7 days', () => {
  const dir = makeTempDir();
  try {
    createFileWithAge(dir, 'old-stdout.log', 10);
    createFileWithAge(dir, 'old-stderr.log', 8);
    createFileWithAge(dir, 'recent.log', 2);

    const logger = silentLogger();
    cleanupRunOutput(dir, new Set(), logger);

    const remaining = fs.readdirSync(dir);
    assert.deepEqual(remaining, ['recent.log']);
    assert.ok(logger.messages.some(m => m.includes('Removed 2 log file(s)')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('does not remove files for active runs', () => {
  const dir = makeTempDir();
  try {
    const activePath = createFileWithAge(dir, 'active-stdout.log', 10);
    createFileWithAge(dir, 'inactive-old.log', 10);

    const logger = silentLogger();
    cleanupRunOutput(dir, new Set([activePath]), logger);

    const remaining = fs.readdirSync(dir).sort();
    assert.deepEqual(remaining, ['active-stdout.log']);
    assert.ok(logger.messages.some(m => m.includes('Removed 1 log file(s)')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('handles missing directory gracefully', () => {
  const logger = silentLogger();
  cleanupRunOutput('/nonexistent/run-output-dir', new Set(), logger);
  // Should not throw, no messages logged
  assert.equal(logger.messages.length, 0);
});

test('handles empty directory gracefully', () => {
  const dir = makeTempDir();
  try {
    const logger = silentLogger();
    cleanupRunOutput(dir, new Set(), logger);
    assert.equal(logger.messages.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('does not remove files exactly 7 days old (boundary)', () => {
  const dir = makeTempDir();
  try {
    // File at exactly 6.9 days - should be kept
    createFileWithAge(dir, 'borderline-keep.log', 6.9);
    // File at exactly 7.1 days - should be removed
    createFileWithAge(dir, 'borderline-remove.log', 7.1);

    const logger = silentLogger();
    cleanupRunOutput(dir, new Set(), logger);

    const remaining = fs.readdirSync(dir);
    assert.deepEqual(remaining, ['borderline-keep.log']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('skips subdirectories', () => {
  const dir = makeTempDir();
  try {
    const subDir = path.join(dir, 'subdir');
    fs.mkdirSync(subDir);
    // Set old mtime on the subdirectory
    const mtime = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    fs.utimesSync(subDir, mtime, mtime);

    const logger = silentLogger();
    cleanupRunOutput(dir, new Set(), logger);

    // Subdirectory should still exist
    assert.ok(fs.existsSync(subDir));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
