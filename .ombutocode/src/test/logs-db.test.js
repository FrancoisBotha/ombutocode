const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const logsDb = require('../src/main/logsDb');

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ombutocode-logs-db-'));
}

let testDbPath = null;

test.beforeEach(async () => {
  const dir = mkTempDir();
  testDbPath = path.join(dir, 'logs.db');
});

test.afterEach(() => {
  logsDb.close();
  testDbPath = null;
});

// Database lifecycle tests
test('open creates new database if file does not exist', async () => {
  assert.equal(fs.existsSync(testDbPath), false);
  const database = await logsDb.open(testDbPath);
  assert.ok(database);
  assert.equal(fs.existsSync(testDbPath), true);
});

test('open loads existing database', async () => {
  await logsDb.open(testDbPath);
  logsDb.insertLog({
    timestamp: new Date().toISOString(),
    event_type: 'scheduler.started',
    severity: 'info',
    message: 'Scheduler started'
  });
  logsDb.flushSave();
  logsDb.close();

  await logsDb.open(testDbPath);
  const result = logsDb.readLogs({ limit: 10 });
  assert.equal(result.total, 1);
  assert.equal(result.logs[0].event_type, 'scheduler.started');
});

test('initializeSchema creates scheduler_logs table and indexes', async () => {
  const database = await logsDb.open(testDbPath);

  const tablesResult = database.exec("SELECT name FROM sqlite_master WHERE type='table'");
  const tableNames = tablesResult[0].values.map(row => row[0]);
  assert.ok(tableNames.includes('scheduler_logs'));

  const indexesResult = database.exec("SELECT name FROM sqlite_master WHERE type='index'");
  const indexNames = indexesResult[0].values.map(row => row[0]);
  assert.ok(indexNames.includes('idx_logs_timestamp'));
  assert.ok(indexNames.includes('idx_logs_event_type'));
  assert.ok(indexNames.includes('idx_logs_ticket_id'));
  assert.ok(indexNames.includes('idx_logs_severity'));
});

// Insert tests
test('insertLog inserts a log entry and returns its id', async () => {
  await logsDb.open(testDbPath);

  const id = logsDb.insertLog({
    timestamp: '2026-02-21T10:00:00.000Z',
    event_type: 'scheduler.started',
    severity: 'info',
    message: 'Scheduler started'
  });

  assert.ok(id > 0);

  const result = logsDb.readLogs({ limit: 10 });
  assert.equal(result.total, 1);
  assert.equal(result.logs[0].id, id);
  assert.equal(result.logs[0].event_type, 'scheduler.started');
  assert.equal(result.logs[0].severity, 'info');
  assert.equal(result.logs[0].message, 'Scheduler started');
});

test('insertLog stores all optional fields', async () => {
  await logsDb.open(testDbPath);

  logsDb.insertLog({
    timestamp: '2026-02-21T10:00:00.000Z',
    event_type: 'ticket.pickup',
    severity: 'info',
    ticket_id: 'TEST-001',
    run_id: 'run-abc',
    agent_name: 'kimi',
    message: 'Picked up ticket',
    details: { model: 'k1', branch: 'ticket/TEST-001' }
  });

  const result = logsDb.readLogs({ limit: 10 });
  const log = result.logs[0];
  assert.equal(log.ticket_id, 'TEST-001');
  assert.equal(log.run_id, 'run-abc');
  assert.equal(log.agent_name, 'kimi');
  assert.equal(log.message, 'Picked up ticket');
  assert.deepEqual(JSON.parse(log.details), { model: 'k1', branch: 'ticket/TEST-001' });
});

test('insertLog serializes object details to JSON', async () => {
  await logsDb.open(testDbPath);

  logsDb.insertLog({
    timestamp: '2026-02-21T10:00:00.000Z',
    event_type: 'cost.recorded',
    severity: 'debug',
    message: 'Cost recorded',
    details: { cost: 1.5, toolId: 'kimi', modelId: 'k1' }
  });

  const result = logsDb.readLogs();
  const parsed = JSON.parse(result.logs[0].details);
  assert.equal(parsed.cost, 1.5);
});

test('insertLog stores string details as-is', async () => {
  await logsDb.open(testDbPath);

  logsDb.insertLog({
    timestamp: '2026-02-21T10:00:00.000Z',
    event_type: 'error.dispatch',
    severity: 'error',
    message: 'Dispatch failed',
    details: 'Some raw error text'
  });

  const result = logsDb.readLogs();
  assert.equal(result.logs[0].details, 'Some raw error text');
});

// Read tests
test('readLogs returns logs ordered by id desc (newest first)', async () => {
  await logsDb.open(testDbPath);

  logsDb.insertLog({ timestamp: '2026-02-21T10:00:00.000Z', event_type: 'scheduler.started', message: 'First' });
  logsDb.insertLog({ timestamp: '2026-02-21T10:01:00.000Z', event_type: 'scheduler.stopped', message: 'Second' });

  const result = logsDb.readLogs();
  assert.equal(result.logs[0].message, 'Second');
  assert.equal(result.logs[1].message, 'First');
});

test('readLogs supports pagination', async () => {
  await logsDb.open(testDbPath);

  for (let i = 0; i < 5; i++) {
    logsDb.insertLog({
      timestamp: `2026-02-21T10:0${i}:00.000Z`,
      event_type: 'scheduler.started',
      message: `Entry ${i}`
    });
  }

  const page1 = logsDb.readLogs({ limit: 2, offset: 0 });
  assert.equal(page1.total, 5);
  assert.equal(page1.logs.length, 2);

  const page2 = logsDb.readLogs({ limit: 2, offset: 2 });
  assert.equal(page2.logs.length, 2);
});

test('readLogs filters by event_type', async () => {
  await logsDb.open(testDbPath);

  logsDb.insertLog({ timestamp: '2026-02-21T10:00:00.000Z', event_type: 'scheduler.started', message: 'A' });
  logsDb.insertLog({ timestamp: '2026-02-21T10:01:00.000Z', event_type: 'scheduler.stopped', message: 'B' });

  const result = logsDb.readLogs({ event_type: 'scheduler.started' });
  assert.equal(result.total, 1);
  assert.equal(result.logs[0].event_type, 'scheduler.started');
});

test('readLogs filters by severity', async () => {
  await logsDb.open(testDbPath);

  logsDb.insertLog({ timestamp: '2026-02-21T10:00:00.000Z', event_type: 'error.dispatch', severity: 'error', message: 'A' });
  logsDb.insertLog({ timestamp: '2026-02-21T10:01:00.000Z', event_type: 'scheduler.started', severity: 'info', message: 'B' });

  const result = logsDb.readLogs({ severity: 'error' });
  assert.equal(result.total, 1);
  assert.equal(result.logs[0].severity, 'error');
});

test('readLogs filters by ticket_id', async () => {
  await logsDb.open(testDbPath);

  logsDb.insertLog({ timestamp: '2026-02-21T10:00:00.000Z', event_type: 'ticket.pickup', ticket_id: 'T-001', message: 'A' });
  logsDb.insertLog({ timestamp: '2026-02-21T10:01:00.000Z', event_type: 'ticket.pickup', ticket_id: 'T-002', message: 'B' });

  const result = logsDb.readLogs({ ticket_id: 'T-001' });
  assert.equal(result.total, 1);
  assert.equal(result.logs[0].ticket_id, 'T-001');
});

// Search tests
test('searchLogs searches across message field', async () => {
  await logsDb.open(testDbPath);

  logsDb.insertLog({ timestamp: '2026-02-21T10:00:00.000Z', event_type: 'scheduler.started', message: 'Scheduler started successfully' });
  logsDb.insertLog({ timestamp: '2026-02-21T10:01:00.000Z', event_type: 'error.dispatch', message: 'Dispatch error occurred' });

  const result = logsDb.searchLogs({ query: 'successfully' });
  assert.equal(result.total, 1);
  assert.equal(result.logs[0].event_type, 'scheduler.started');
});

test('searchLogs searches across ticket_id field', async () => {
  await logsDb.open(testDbPath);

  logsDb.insertLog({ timestamp: '2026-02-21T10:00:00.000Z', event_type: 'ticket.pickup', ticket_id: 'SEARCH-001', message: 'Picked up' });
  logsDb.insertLog({ timestamp: '2026-02-21T10:01:00.000Z', event_type: 'ticket.pickup', ticket_id: 'OTHER-001', message: 'Picked up' });

  const result = logsDb.searchLogs({ query: 'SEARCH' });
  assert.equal(result.total, 1);
  assert.equal(result.logs[0].ticket_id, 'SEARCH-001');
});

test('searchLogs combines query with filter', async () => {
  await logsDb.open(testDbPath);

  logsDb.insertLog({ timestamp: '2026-02-21T10:00:00.000Z', event_type: 'ticket.pickup', severity: 'info', message: 'Alpha' });
  logsDb.insertLog({ timestamp: '2026-02-21T10:01:00.000Z', event_type: 'error.dispatch', severity: 'error', message: 'Alpha error' });

  const result = logsDb.searchLogs({ query: 'Alpha', severity: 'error' });
  assert.equal(result.total, 1);
  assert.equal(result.logs[0].severity, 'error');
});

// Distinct values tests
test('getDistinctEventTypes returns unique event types', async () => {
  await logsDb.open(testDbPath);

  logsDb.insertLog({ timestamp: '2026-02-21T10:00:00.000Z', event_type: 'scheduler.started', message: 'A' });
  logsDb.insertLog({ timestamp: '2026-02-21T10:01:00.000Z', event_type: 'scheduler.started', message: 'B' });
  logsDb.insertLog({ timestamp: '2026-02-21T10:02:00.000Z', event_type: 'scheduler.stopped', message: 'C' });

  const types = logsDb.getDistinctEventTypes();
  assert.deepEqual(types.sort(), ['scheduler.started', 'scheduler.stopped']);
});

test('getDistinctTicketIds returns unique ticket IDs', async () => {
  await logsDb.open(testDbPath);

  logsDb.insertLog({ timestamp: '2026-02-21T10:00:00.000Z', event_type: 'ticket.pickup', ticket_id: 'T-001', message: 'A' });
  logsDb.insertLog({ timestamp: '2026-02-21T10:01:00.000Z', event_type: 'ticket.pickup', ticket_id: 'T-001', message: 'B' });
  logsDb.insertLog({ timestamp: '2026-02-21T10:02:00.000Z', event_type: 'ticket.pickup', ticket_id: 'T-002', message: 'C' });
  logsDb.insertLog({ timestamp: '2026-02-21T10:03:00.000Z', event_type: 'scheduler.started', message: 'D' }); // no ticket_id

  const ids = logsDb.getDistinctTicketIds();
  assert.deepEqual(ids.sort(), ['T-001', 'T-002']);
});

// Shared-db mode test
test('open with db instance enters shared-db mode', async () => {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const sharedDb = new SQL.Database();

  // Create metadata table that shared-db expects
  sharedDb.run('CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT)');

  await logsDb.open(sharedDb);

  const id = logsDb.insertLog({
    timestamp: '2026-02-21T10:00:00.000Z',
    event_type: 'scheduler.started',
    message: 'Shared mode test'
  });

  assert.ok(id > 0);

  const result = logsDb.readLogs();
  assert.equal(result.total, 1);

  logsDb.close();
  sharedDb.close();
});

// Error handling tests
test('throws error when database not initialized', () => {
  logsDb.close();

  assert.throws(() => logsDb.insertLog({
    timestamp: new Date().toISOString(),
    event_type: 'test',
    message: 'test'
  }), /Database not initialized/);
  assert.throws(() => logsDb.readLogs(), /Database not initialized/);
  assert.throws(() => logsDb.searchLogs(), /Database not initialized/);
  assert.throws(() => logsDb.getDistinctEventTypes(), /Database not initialized/);
  assert.throws(() => logsDb.getDistinctTicketIds(), /Database not initialized/);
});

// Batched save test
test('insertLog triggers batched save after threshold', async () => {
  await logsDb.open(testDbPath);

  // Insert enough logs to trigger threshold save
  for (let i = 0; i < 12; i++) {
    logsDb.insertLog({
      timestamp: `2026-02-21T10:0${String(i).padStart(2, '0')}:00.000Z`,
      event_type: 'scheduler.started',
      message: `Entry ${i}`
    });
  }

  // Data should have been persisted via threshold save
  logsDb.close();

  await logsDb.open(testDbPath);
  const result = logsDb.readLogs({ limit: 20 });
  assert.equal(result.total, 12);
});
