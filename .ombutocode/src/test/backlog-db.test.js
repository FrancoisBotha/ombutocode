const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');
const initSqlJs = require('sql.js');

const backlogDb = require('../src/main/backlogDb');
const ticketFileManager = require('../src/main/ticketFileManager');

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ombutocode-backlog-db-'));
}

function createSampleTicket(id, overrides = {}) {
  return {
    id,
    title: `Test Ticket ${id}`,
    epic_ref: 'docs/Epics/test.md',
    status: 'todo',
    last_updated: '2026-02-19T12:00:00.000Z',
    dependencies: ['DEP-001'],
    acceptance_criteria: ['Criterion 1', 'Criterion 2'],
    files_touched: ['file1.js'],
    notes: 'Test notes',
    assignee: { tool: 'kimi', model: 'k1' },
    agent: { name: 'kimi', run_id: 'run-123' },
    eval_summary: null,
    fail_count: 0,
    eval_fail_count: 0,
    ...overrides
  };
}

let db = null;
let tempDir = null;

test.beforeEach(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  // Create shared metadata table (normally done by ombutocodeDb)
  db.run('CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT)');
  await backlogDb.open(db);

  // Set up ticket file manager with temp directory
  tempDir = mkTempDir();
  const ticketsDir = path.join(tempDir, 'tickets');
  ticketFileManager.setTicketsDir(ticketsDir);
  ticketFileManager.ensureTicketsDir();
  backlogDb.setTicketFileManager(ticketFileManager);
});

test.afterEach(() => {
  backlogDb.setTicketFileManager(null);
  backlogDb.close();
  if (db) {
    db.close();
    db = null;
  }
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

// --- Schema ---

test('open initializes backlog_tickets table with 3-column JSON schema', async () => {
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='backlog_tickets'");
  assert.equal(tables.length, 1);
  assert.equal(tables[0].values[0][0], 'backlog_tickets');

  // Verify it has exactly 3 columns: id, sort_order, data
  const info = db.exec('PRAGMA table_info(backlog_tickets)');
  const columns = info[0].values.map(r => r[1]);
  assert.deepEqual(columns.sort(), ['data', 'id', 'sort_order']);
});

test('open initializes indexes', async () => {
  const indexes = db.exec("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_backlog%'");
  assert.ok(indexes.length > 0);
  const indexNames = indexes[0].values.map(r => r[0]);
  assert.ok(indexNames.includes('idx_backlog_sort_order'));
});

test('open initializes metadata with backlog: prefix', async () => {
  const result = db.exec("SELECT key FROM metadata WHERE key LIKE 'backlog:%'");
  assert.ok(result.length > 0);
  const keys = result[0].values.map(r => r[0]);
  assert.ok(keys.includes('backlog:version'));
  assert.ok(keys.includes('backlog:updated_at'));
});

// --- Old schema migration ---

test('open migrates old 15-column schema to JSON schema', async () => {
  // Create a fresh DB with the old schema
  const SQL = await initSqlJs();
  const oldDb = new SQL.Database();
  oldDb.run('CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT)');

  // Create old-style table
  oldDb.run(`
    CREATE TABLE backlog_tickets (
      id                  TEXT PRIMARY KEY,
      title               TEXT NOT NULL DEFAULT '',
      epic_ref         TEXT DEFAULT '',
      status              TEXT NOT NULL DEFAULT 'backlog',
      last_updated        TEXT DEFAULT '',
      dependencies        TEXT DEFAULT '[]',
      acceptance_criteria TEXT DEFAULT '[]',
      files_touched       TEXT DEFAULT '[]',
      notes               TEXT DEFAULT '',
      assignee            TEXT DEFAULT NULL,
      agent               TEXT DEFAULT NULL,
      eval_summary        TEXT DEFAULT NULL,
      fail_count          INTEGER DEFAULT 0,
      eval_fail_count     INTEGER DEFAULT 0,
      sort_order          INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Insert old-style rows
  oldDb.run(`INSERT INTO backlog_tickets (id, title, status, sort_order, dependencies)
             VALUES ('T-001', 'Old Ticket', 'todo', 0, '["DEP-001"]')`);
  oldDb.run(`INSERT INTO backlog_tickets (id, title, status, sort_order)
             VALUES ('T-002', 'Another Old Ticket', 'in_progress', 1)`);

  backlogDb.close();
  await backlogDb.open(oldDb);

  // Verify migration happened — table should now have 3 columns
  const info = oldDb.exec('PRAGMA table_info(backlog_tickets)');
  const columns = info[0].values.map(r => r[1]);
  assert.deepEqual(columns.sort(), ['data', 'id', 'sort_order']);

  // Verify data was preserved
  const data = backlogDb.readBacklogData();
  assert.equal(data.tickets.length, 2);
  assert.equal(data.tickets[0].id, 'T-001');
  assert.equal(data.tickets[0].title, 'Old Ticket');
  assert.deepEqual(data.tickets[0].dependencies, ['DEP-001']);
  assert.equal(data.tickets[1].id, 'T-002');
  assert.equal(data.tickets[1].status, 'in_progress');

  backlogDb.close();
  oldDb.close();
});

// --- readBacklogData ---

test('readBacklogData returns empty default when no tickets exist', () => {
  const data = backlogDb.readBacklogData();
  assert.equal(data.version, 1);
  assert.ok(typeof data.updated_at === 'string');
  assert.ok(Array.isArray(data.tickets));
  assert.equal(data.tickets.length, 0);
});

test('readBacklogData returns tickets ordered by sort_order', () => {
  backlogDb.writeBacklogData({
    version: 1,
    tickets: [
      createSampleTicket('T-001'),
      createSampleTicket('T-002'),
      createSampleTicket('T-003')
    ]
  });

  const data = backlogDb.readBacklogData();
  assert.equal(data.tickets.length, 3);
  assert.equal(data.tickets[0].id, 'T-001');
  assert.equal(data.tickets[1].id, 'T-002');
  assert.equal(data.tickets[2].id, 'T-003');
});

test('readBacklogData deserializes JSON fields correctly', () => {
  backlogDb.insertTicket(createSampleTicket('T-001'));

  const data = backlogDb.readBacklogData();
  const ticket = data.tickets[0];
  assert.deepEqual(ticket.dependencies, ['DEP-001']);
  assert.deepEqual(ticket.acceptance_criteria, ['Criterion 1', 'Criterion 2']);
  assert.deepEqual(ticket.files_touched, ['file1.js']);
  assert.deepEqual(ticket.assignee, { tool: 'kimi', model: 'k1' });
  assert.deepEqual(ticket.agent, { name: 'kimi', run_id: 'run-123' });
  assert.equal(ticket.eval_summary, null);
  assert.equal(ticket.fail_count, 0);
  assert.equal(ticket.eval_fail_count, 0);
});

test('readBacklogData merges active ticket file overlays', () => {
  backlogDb.insertTicket(createSampleTicket('T-001', { status: 'in_progress' }));

  // Write a ticket file with updated notes
  ticketFileManager.writeTicketFile('T-001', {
    ...createSampleTicket('T-001', { status: 'in_progress' }),
    notes: 'Updated from file'
  });

  const data = backlogDb.readBacklogData();
  assert.equal(data.tickets[0].notes, 'Updated from file');
});

// --- writeBacklogData ---

test('writeBacklogData round-trips correctly', () => {
  const input = {
    version: 2,
    updated_at: '2026-03-01',
    tickets: [
      createSampleTicket('T-001'),
      createSampleTicket('T-002', { status: 'in_progress' })
    ]
  };

  backlogDb.writeBacklogData(input);
  // Disable file manager temporarily to read raw DB data
  backlogDb.setTicketFileManager(null);
  const output = backlogDb.readBacklogData();
  backlogDb.setTicketFileManager(ticketFileManager);

  assert.equal(output.version, 2);
  assert.equal(output.tickets.length, 2);
  assert.equal(output.tickets[0].id, 'T-001');
  assert.equal(output.tickets[1].id, 'T-002');
  assert.equal(output.tickets[1].status, 'in_progress');
});

test('writeBacklogData removes tickets not in the new array', () => {
  backlogDb.writeBacklogData({
    version: 1,
    tickets: [createSampleTicket('T-001'), createSampleTicket('T-002')]
  });

  backlogDb.writeBacklogData({
    version: 1,
    tickets: [createSampleTicket('T-002')]
  });

  const data = backlogDb.readBacklogData();
  assert.equal(data.tickets.length, 1);
  assert.equal(data.tickets[0].id, 'T-002');
});

test('writeBacklogData preserves array ordering via sort_order', () => {
  backlogDb.writeBacklogData({
    version: 1,
    tickets: [
      createSampleTicket('T-003'),
      createSampleTicket('T-001'),
      createSampleTicket('T-002')
    ]
  });

  const data = backlogDb.readBacklogData();
  assert.equal(data.tickets[0].id, 'T-003');
  assert.equal(data.tickets[1].id, 'T-001');
  assert.equal(data.tickets[2].id, 'T-002');
});

// --- getTicketById ---

test('getTicketById returns ticket when found', () => {
  backlogDb.insertTicket(createSampleTicket('T-001'));
  const ticket = backlogDb.getTicketById('T-001');
  assert.ok(ticket);
  assert.equal(ticket.id, 'T-001');
  assert.equal(ticket.title, 'Test Ticket T-001');
});

test('getTicketById returns null when not found', () => {
  const ticket = backlogDb.getTicketById('NONEXISTENT');
  assert.equal(ticket, null);
});

test('getTicketById checks ticket file first for active tickets', () => {
  backlogDb.insertTicket(createSampleTicket('T-001', { status: 'in_progress', notes: 'DB notes' }));

  // Write a ticket file with different notes
  ticketFileManager.writeTicketFile('T-001', {
    ...createSampleTicket('T-001', { status: 'in_progress' }),
    notes: 'File notes'
  });

  const ticket = backlogDb.getTicketById('T-001');
  assert.equal(ticket.notes, 'File notes');
});

// --- updateTicketFields ---

test('updateTicketFields updates specific fields without touching others', () => {
  backlogDb.insertTicket(createSampleTicket('T-001', { notes: 'original' }));

  const updated = backlogDb.updateTicketFields('T-001', {
    status: 'building',
    notes: 'updated'
  });

  assert.ok(updated);
  assert.equal(updated.status, 'building');
  assert.equal(updated.notes, 'updated');
  assert.equal(updated.title, 'Test Ticket T-001'); // unchanged
});

test('updateTicketFields returns null for nonexistent ticket', () => {
  const result = backlogDb.updateTicketFields('NONEXISTENT', { status: 'todo' });
  assert.equal(result, null);
});

test('updateTicketFields handles JSON fields correctly', () => {
  backlogDb.insertTicket(createSampleTicket('T-001'));

  backlogDb.updateTicketFields('T-001', {
    assignee: { tool: 'codex', model: 'gpt-4o' },
    files_touched: ['new-file.js', 'another.js']
  });

  const ticket = backlogDb.getTicketById('T-001');
  assert.deepEqual(ticket.assignee, { tool: 'codex', model: 'gpt-4o' });
  assert.deepEqual(ticket.files_touched, ['new-file.js', 'another.js']);
});

test('updateTicketFields can set fields to null', () => {
  backlogDb.insertTicket(createSampleTicket('T-001'));
  backlogDb.updateTicketFields('T-001', { assignee: null, agent: null });

  const ticket = backlogDb.getTicketById('T-001');
  assert.equal(ticket.assignee, null);
  assert.equal(ticket.agent, null);
});

test('concurrent updateTicketFields for different tickets do not clobber', () => {
  backlogDb.insertTicket(createSampleTicket('T-001', { status: 'todo' }));
  backlogDb.insertTicket(createSampleTicket('T-002', { status: 'todo' }));

  backlogDb.updateTicketFields('T-001', { status: 'building' });
  backlogDb.updateTicketFields('T-002', { status: 'building' });

  const t1 = backlogDb.getTicketById('T-001');
  const t2 = backlogDb.getTicketById('T-002');
  assert.equal(t1.status, 'building');
  assert.equal(t2.status, 'building');
});

// --- Active ticket file routing ---

test('updateTicketFields writes to ticket file for in_progress status', () => {
  backlogDb.insertTicket(createSampleTicket('T-001', { status: 'todo' }));

  backlogDb.updateTicketFields('T-001', { status: 'in_progress' });

  // Verify file was created
  const fileData = ticketFileManager.readTicketFile('T-001');
  assert.ok(fileData);
  assert.equal(fileData.status, 'in_progress');
});

test('updateTicketFields writes to ticket file for eval status', () => {
  backlogDb.insertTicket(createSampleTicket('T-001', { status: 'in_progress' }));

  backlogDb.updateTicketFields('T-001', { status: 'eval' });

  const fileData = ticketFileManager.readTicketFile('T-001');
  assert.ok(fileData);
  assert.equal(fileData.status, 'eval');
});

test('updateTicketFields flushes to DB and deletes file on review transition', () => {
  backlogDb.insertTicket(createSampleTicket('T-001', { status: 'in_progress' }));

  // First, put it in in_progress (creates file)
  backlogDb.updateTicketFields('T-001', { status: 'in_progress', notes: 'working on it' });
  assert.ok(ticketFileManager.readTicketFile('T-001'));

  // Now transition to review (should flush to DB and delete file)
  backlogDb.updateTicketFields('T-001', { status: 'review', notes: 'ready for review' });

  // File should be gone
  assert.equal(ticketFileManager.readTicketFile('T-001'), null);

  // DB should have latest data
  backlogDb.setTicketFileManager(null);
  const ticket = backlogDb.getTicketById('T-001');
  backlogDb.setTicketFileManager(ticketFileManager);
  assert.equal(ticket.status, 'review');
  assert.equal(ticket.notes, 'ready for review');
});

test('updateTicketFields writes to DB for non-active statuses', () => {
  backlogDb.insertTicket(createSampleTicket('T-001', { status: 'todo' }));

  backlogDb.updateTicketFields('T-001', { status: 'building' });

  // No file should exist
  assert.equal(ticketFileManager.readTicketFile('T-001'), null);

  // DB should have the update
  const ticket = backlogDb.getTicketById('T-001');
  assert.equal(ticket.status, 'building');
});

// --- insertTicket ---

test('insertTicket appends to end by default', () => {
  backlogDb.insertTicket(createSampleTicket('T-001'));
  backlogDb.insertTicket(createSampleTicket('T-002'));
  backlogDb.insertTicket(createSampleTicket('T-003'));

  const data = backlogDb.readBacklogData();
  assert.equal(data.tickets[0].id, 'T-001');
  assert.equal(data.tickets[1].id, 'T-002');
  assert.equal(data.tickets[2].id, 'T-003');
});

test('insertTicket at specific position shifts others', () => {
  backlogDb.insertTicket(createSampleTicket('T-001'));
  backlogDb.insertTicket(createSampleTicket('T-002'));
  backlogDb.insertTicket(createSampleTicket('T-003'), 1);

  const data = backlogDb.readBacklogData();
  assert.equal(data.tickets[0].id, 'T-001');
  assert.equal(data.tickets[1].id, 'T-003');
  assert.equal(data.tickets[2].id, 'T-002');
});

test('insertTicket returns the inserted ticket', () => {
  const result = backlogDb.insertTicket(createSampleTicket('T-001'));
  assert.ok(result);
  assert.equal(result.id, 'T-001');
});

// --- deleteTicket ---

test('deleteTicket removes ticket and returns true', () => {
  backlogDb.insertTicket(createSampleTicket('T-001'));
  const result = backlogDb.deleteTicket('T-001');
  assert.equal(result, true);

  const ticket = backlogDb.getTicketById('T-001');
  assert.equal(ticket, null);
});

test('deleteTicket returns false for nonexistent ticket', () => {
  const result = backlogDb.deleteTicket('NONEXISTENT');
  assert.equal(result, false);
});

test('deleteTicket also removes ticket file', () => {
  backlogDb.insertTicket(createSampleTicket('T-001', { status: 'in_progress' }));
  ticketFileManager.writeTicketFile('T-001', createSampleTicket('T-001', { status: 'in_progress' }));

  backlogDb.deleteTicket('T-001');
  assert.equal(ticketFileManager.readTicketFile('T-001'), null);
});

// --- reorderTickets ---

test('reorderTickets assigns sort_order from array position', () => {
  backlogDb.insertTicket(createSampleTicket('T-001'));
  backlogDb.insertTicket(createSampleTicket('T-002'));
  backlogDb.insertTicket(createSampleTicket('T-003'));

  backlogDb.reorderTickets(['T-003', 'T-002', 'T-001']);

  const data = backlogDb.readBacklogData();
  assert.equal(data.tickets[0].id, 'T-003');
  assert.equal(data.tickets[1].id, 'T-002');
  assert.equal(data.tickets[2].id, 'T-001');
});

// --- Crash Recovery ---

test('recoverOrphanedTicketFiles syncs files back to DB', () => {
  backlogDb.insertTicket(createSampleTicket('T-001', { status: 'in_progress', notes: 'DB notes' }));

  // Simulate crash: file exists with newer data
  ticketFileManager.writeTicketFile('T-001', {
    ...createSampleTicket('T-001', { status: 'in_progress' }),
    notes: 'File notes after crash'
  });

  const result = backlogDb.recoverOrphanedTicketFiles();
  assert.deepEqual(result.recovered, ['T-001']);

  // File should be deleted
  assert.equal(ticketFileManager.readTicketFile('T-001'), null);

  // DB should have file data
  backlogDb.setTicketFileManager(null);
  const ticket = backlogDb.getTicketById('T-001');
  backlogDb.setTicketFileManager(ticketFileManager);
  assert.equal(ticket.notes, 'File notes after crash');
});

// --- YAML Migration ---

test('isMigrationNeeded returns true when YAML exists and table is empty', () => {
  const dir = mkTempDir();
  const yamlPath = path.join(dir, 'backlog.yml');
  fs.writeFileSync(yamlPath, yaml.dump({ version: 1, tickets: [] }), 'utf-8');

  assert.equal(backlogDb.isMigrationNeeded(yamlPath), true);
});

test('isMigrationNeeded returns false when YAML does not exist', () => {
  assert.equal(backlogDb.isMigrationNeeded('/nonexistent/backlog.yml'), false);
});

test('isMigrationNeeded returns false when table has tickets', () => {
  backlogDb.insertTicket(createSampleTicket('T-001'));
  const dir = mkTempDir();
  const yamlPath = path.join(dir, 'backlog.yml');
  fs.writeFileSync(yamlPath, yaml.dump({ version: 1, tickets: [{ id: 'T-001' }] }), 'utf-8');

  assert.equal(backlogDb.isMigrationNeeded(yamlPath), false);
});

test('migrateFromYaml imports tickets and renames file', () => {
  const dir = mkTempDir();
  const yamlPath = path.join(dir, 'backlog.yml');
  const yamlData = {
    version: 1,
    updated_at: '2026-03-01',
    tickets: [
      createSampleTicket('T-001'),
      createSampleTicket('T-002', { status: 'in_progress' })
    ]
  };
  fs.writeFileSync(yamlPath, yaml.dump(yamlData, { lineWidth: -1, noRefs: true }), 'utf-8');

  const result = backlogDb.migrateFromYaml(yamlPath);
  assert.equal(result.success, true);
  assert.equal(result.count, 2);

  const data = backlogDb.readBacklogData();
  assert.equal(data.tickets.length, 2);
  assert.equal(data.tickets[0].id, 'T-001');
  assert.equal(data.tickets[1].id, 'T-002');
  assert.equal(data.tickets[1].status, 'in_progress');

  assert.equal(fs.existsSync(yamlPath), false);
  assert.equal(fs.existsSync(`${yamlPath}.migrated`), true);
});

test('migrateFromYaml preserves ticket ordering', () => {
  const dir = mkTempDir();
  const yamlPath = path.join(dir, 'backlog.yml');
  const yamlData = {
    version: 1,
    tickets: [
      createSampleTicket('T-003'),
      createSampleTicket('T-001'),
      createSampleTicket('T-002')
    ]
  };
  fs.writeFileSync(yamlPath, yaml.dump(yamlData, { lineWidth: -1, noRefs: true }), 'utf-8');

  backlogDb.migrateFromYaml(yamlPath);

  const data = backlogDb.readBacklogData();
  assert.equal(data.tickets[0].id, 'T-003');
  assert.equal(data.tickets[1].id, 'T-001');
  assert.equal(data.tickets[2].id, 'T-002');
});

test('migrateFromYaml returns error for nonexistent file', () => {
  const result = backlogDb.migrateFromYaml('/nonexistent/backlog.yml');
  assert.equal(result.success, false);
  assert.ok(result.error);
});

// --- Metadata ---

test('updateMetadata and readMetadata use backlog: prefix', () => {
  backlogDb.updateMetadata('version', '2');
  const val = backlogDb.readMetadata('version');
  assert.equal(val, '2');

  const stmt = db.prepare("SELECT value FROM metadata WHERE key = 'backlog:version'");
  assert.ok(stmt.step());
  assert.equal(stmt.getAsObject().value, '2');
  stmt.free();
});

// --- Edge cases ---

test('insertTicket with string assignee (not object)', () => {
  backlogDb.insertTicket(createSampleTicket('T-001', { assignee: 'claude' }));
  const ticket = backlogDb.getTicketById('T-001');
  assert.equal(ticket.assignee, 'claude');
});

test('insertTicket with null/missing optional fields', () => {
  backlogDb.insertTicket({
    id: 'T-001',
    title: 'Minimal ticket',
    status: 'backlog'
  });
  const ticket = backlogDb.getTicketById('T-001');
  assert.equal(ticket.id, 'T-001');
  assert.deepEqual(ticket.dependencies, []);
  assert.deepEqual(ticket.acceptance_criteria, []);
  assert.deepEqual(ticket.files_touched, []);
  assert.equal(ticket.notes, '');
  assert.equal(ticket.assignee, null);
  assert.equal(ticket.agent, null);
  assert.equal(ticket.fail_count, 0);
  assert.equal(ticket.eval_fail_count, 0);
});

test('updateTicketFields with eval_summary JSON object', () => {
  backlogDb.insertTicket(createSampleTicket('T-001'));
  const evalSummary = {
    verdict: 'PASS',
    criteria_checks: [{ criterion: 'Test', result: 'PASS' }],
    timestamp: '2026-03-01T00:00:00.000Z'
  };
  backlogDb.updateTicketFields('T-001', { eval_summary: evalSummary });

  const ticket = backlogDb.getTicketById('T-001');
  assert.deepEqual(ticket.eval_summary, evalSummary);
});

test('updateTicketFields increments fail_count', () => {
  backlogDb.insertTicket(createSampleTicket('T-001', { fail_count: 1 }));
  backlogDb.updateTicketFields('T-001', { fail_count: 2 });

  const ticket = backlogDb.getTicketById('T-001');
  assert.equal(ticket.fail_count, 2);
});
