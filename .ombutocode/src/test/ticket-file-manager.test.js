const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ticketFileManager = require('../src/main/ticketFileManager');

let tempDir = null;
let ticketsDir = null;

test.beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ombutocode-tfm-'));
  ticketsDir = path.join(tempDir, 'tickets');
  ticketFileManager.setTicketsDir(ticketsDir);
  ticketFileManager.ensureTicketsDir();
});

test.afterEach(() => {
  ticketFileManager.setTicketsDir(null);
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

// --- setTicketsDir / getTicketsDir ---

test('setTicketsDir and getTicketsDir round-trip', () => {
  ticketFileManager.setTicketsDir('/some/path');
  assert.equal(ticketFileManager.getTicketsDir(), '/some/path');
  ticketFileManager.setTicketsDir(ticketsDir); // restore
});

// --- ensureTicketsDir ---

test('ensureTicketsDir creates directory if not exists', () => {
  const newDir = path.join(tempDir, 'new-tickets');
  ticketFileManager.setTicketsDir(newDir);
  assert.equal(fs.existsSync(newDir), false);

  ticketFileManager.ensureTicketsDir();
  assert.equal(fs.existsSync(newDir), true);

  ticketFileManager.setTicketsDir(ticketsDir); // restore
});

test('ensureTicketsDir throws if ticketsDir not set', () => {
  ticketFileManager.setTicketsDir(null);
  assert.throws(() => ticketFileManager.ensureTicketsDir(), /ticketsDir not set/);
  ticketFileManager.setTicketsDir(ticketsDir); // restore
});

// --- writeTicketFile / readTicketFile ---

test('writeTicketFile creates file and readTicketFile returns data', () => {
  const data = { id: 'T-001', status: 'in_progress', notes: 'test' };
  ticketFileManager.writeTicketFile('T-001', data);

  const result = ticketFileManager.readTicketFile('T-001');
  assert.deepEqual(result, data);
});

test('writeTicketFile overwrites existing file', () => {
  ticketFileManager.writeTicketFile('T-001', { status: 'v1' });
  ticketFileManager.writeTicketFile('T-001', { status: 'v2' });

  const result = ticketFileManager.readTicketFile('T-001');
  assert.equal(result.status, 'v2');
});

test('writeTicketFile is atomic (uses temp + rename)', () => {
  ticketFileManager.writeTicketFile('T-001', { status: 'test' });

  // No .tmp file should remain
  const files = fs.readdirSync(ticketsDir);
  assert.equal(files.filter(f => f.endsWith('.tmp')).length, 0);
  assert.ok(files.includes('T-001.json'));
});

test('readTicketFile returns null for nonexistent file', () => {
  const result = ticketFileManager.readTicketFile('NONEXISTENT');
  assert.equal(result, null);
});

// --- deleteTicketFile ---

test('deleteTicketFile removes the file', () => {
  ticketFileManager.writeTicketFile('T-001', { status: 'test' });
  assert.ok(ticketFileManager.readTicketFile('T-001'));

  ticketFileManager.deleteTicketFile('T-001');
  assert.equal(ticketFileManager.readTicketFile('T-001'), null);
});

test('deleteTicketFile is no-op for nonexistent file', () => {
  // Should not throw
  ticketFileManager.deleteTicketFile('NONEXISTENT');
});

// --- listTicketFiles ---

test('listTicketFiles returns empty array when no files', () => {
  const result = ticketFileManager.listTicketFiles();
  assert.deepEqual(result, []);
});

test('listTicketFiles returns ticket IDs from file names', () => {
  ticketFileManager.writeTicketFile('T-001', { status: 'in_progress' });
  ticketFileManager.writeTicketFile('T-002', { status: 'eval' });

  const result = ticketFileManager.listTicketFiles();
  assert.equal(result.length, 2);
  assert.ok(result.includes('T-001'));
  assert.ok(result.includes('T-002'));
});

test('listTicketFiles excludes .tmp files', () => {
  ticketFileManager.writeTicketFile('T-001', { status: 'test' });
  // Manually create a .tmp file
  fs.writeFileSync(path.join(ticketsDir, 'T-002.json.tmp'), '{}', 'utf-8');

  const result = ticketFileManager.listTicketFiles();
  assert.equal(result.length, 1);
  assert.equal(result[0], 'T-001');
});

test('listTicketFiles returns empty when ticketsDir not set', () => {
  ticketFileManager.setTicketsDir(null);
  const result = ticketFileManager.listTicketFiles();
  assert.deepEqual(result, []);
  ticketFileManager.setTicketsDir(ticketsDir); // restore
});

test('listTicketFiles returns empty when directory does not exist', () => {
  ticketFileManager.setTicketsDir(path.join(tempDir, 'nonexistent'));
  const result = ticketFileManager.listTicketFiles();
  assert.deepEqual(result, []);
  ticketFileManager.setTicketsDir(ticketsDir); // restore
});

// --- Complex data round-trip ---

test('complex ticket data survives write/read cycle', () => {
  const data = {
    id: 'JMAIL-050',
    title: 'Complex ticket',
    status: 'in_progress',
    dependencies: ['JMAIL-001', 'JMAIL-002'],
    acceptance_criteria: ['AC 1', 'AC 2', 'AC 3'],
    files_touched: ['src/main.rs', 'src/lib.rs'],
    notes: 'Multi\nline\nnotes',
    assignee: { tool: 'claude', model: 'opus' },
    agent: { name: 'claude', run_id: 'run-abc-123', pid: 12345 },
    eval_summary: { verdict: 'PASS', score: 0.95 },
    fail_count: 2,
    eval_fail_count: 1,
    last_updated: '2026-03-06T10:00:00.000Z'
  };

  ticketFileManager.writeTicketFile('JMAIL-050', data);
  const result = ticketFileManager.readTicketFile('JMAIL-050');
  assert.deepEqual(result, data);
});
