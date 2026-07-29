/**
 * The archive table has fixed columns rather than a JSON blob, so any ticket
 * field not named in insertTicket is silently dropped on archive. These tests
 * pin the two that the changes view and the run summary depend on.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  openDatabase,
  closeDatabase,
  initializeSchema,
  insertTicket,
  getTicket,
  getAllTickets
} = require('../src/main/archiveDb');

let testDbPath = null;

test.beforeEach(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ombutocode-archive-merge-'));
  testDbPath = path.join(dir, 'archive.db');
  await openDatabase(testDbPath);
  initializeSchema();
});

test.afterEach(() => {
  closeDatabase();
  testDbPath = null;
});

function sampleTicket(overrides = {}) {
  return {
    id: 'MERGE-001',
    title: 'Archived with merge metadata',
    epic_ref: 'docs/Epics/test.md',
    status: 'archive',
    last_updated: '2026-07-29T12:00:00.000Z',
    dependencies: [],
    acceptance_criteria: [],
    files_touched: [],
    notes: '',
    assignee: null,
    agent: null,
    ...overrides
  };
}

test('merge_commit_sha survives an archive round trip', () => {
  insertTicket(sampleTicket({ merge_commit_sha: 'a'.repeat(40) }));
  const stored = getTicket('MERGE-001');
  assert.equal(stored.merge_commit_sha, 'a'.repeat(40));
});

test('run_summary survives an archive round trip', () => {
  const summary = {
    status: 'ready',
    agent: 'claude',
    generated_at: '2026-07-29T12:00:00.000Z',
    sections: [
      { phase: 'impl', label: 'Implementation', what_changed: 'Built the thing', files_touched: ['a.js'] }
    ]
  };

  insertTicket(sampleTicket({ run_summary: summary }));
  const stored = getTicket('MERGE-001');

  assert.equal(stored.run_summary.status, 'ready');
  assert.equal(stored.run_summary.sections.length, 1);
  assert.equal(stored.run_summary.sections[0].what_changed, 'Built the thing');
  assert.deepEqual(stored.run_summary.sections[0].files_touched, ['a.js']);
});

test('both fields default to null when the ticket never had them', () => {
  insertTicket(sampleTicket());
  const stored = getTicket('MERGE-001');
  assert.equal(stored.merge_commit_sha, null);
  assert.equal(stored.run_summary, null);
});

test('insertTicket echoes the new fields back to the caller', () => {
  const result = insertTicket(sampleTicket({ merge_commit_sha: 'abc123', run_summary: { status: 'failed' } }));
  assert.equal(result.merge_commit_sha, 'abc123');
  assert.deepEqual(result.run_summary, { status: 'failed' });
});

test('the fields come back through bulk reads too', () => {
  insertTicket(sampleTicket({ id: 'MERGE-001', merge_commit_sha: 'sha-one' }));
  insertTicket(sampleTicket({ id: 'MERGE-002', merge_commit_sha: 'sha-two' }));

  // getAllTickets returns { tickets, total }, not a bare array.
  const byId = Object.fromEntries(getAllTickets().tickets.map(t => [t.id, t]));
  assert.equal(byId['MERGE-001'].merge_commit_sha, 'sha-one');
  assert.equal(byId['MERGE-002'].merge_commit_sha, 'sha-two');
});

test('a malformed run_summary column degrades to a string instead of throwing', () => {
  // parseJsonField falls back to the raw value, so a hand-edited DB cannot
  // crash the archive view.
  insertTicket(sampleTicket({ run_summary: 'not json at all' }));
  const stored = getTicket('MERGE-001');
  assert.equal(typeof stored.run_summary, 'string');
});
