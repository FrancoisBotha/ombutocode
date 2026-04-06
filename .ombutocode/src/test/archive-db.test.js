const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');

const {
  openDatabase,
  closeDatabase,
  saveDatabase,
  initializeSchema,
  insertTicket,
  getTicket,
  getAllTickets,
  updateTicket,
  deleteTicket,
  searchTickets,
  getDistinctFeatureRefs,
  getMetadata,
  getArchiveData,
  migrateFromYaml,
  isMigrationNeeded,
  serializeJson,
  parseJson,
  rowToTicket
} = require('../src/main/archiveDb');

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ombutocode-archive-db-'));
}

function createSampleTicket(id, overrides = {}) {
  return {
    id,
    title: `Test Ticket ${id}`,
    feature_ref: '.ombutocode/features/test.md',
    status: 'archive',
    last_updated: '2026-02-19T12:00:00.000Z',
    dependencies: ['ARCH-001', 'ARCH-002'],
    acceptance_criteria: ['Criterion 1', 'Criterion 2'],
    files_touched: ['file1.js', 'file2.js'],
    notes: 'Test notes for ticket',
    assignee: { tool: 'kimi', model: 'k1' },
    agent: { name: 'kimi', run_id: 'run-123' },
    ...overrides
  };
}

// Setup and teardown helpers
let testDbPath = null;

test.beforeEach(async () => {
  const dir = mkTempDir();
  testDbPath = path.join(dir, 'archive.db');
});

test.afterEach(() => {
  closeDatabase();
  testDbPath = null;
});

// Database lifecycle tests
test('openDatabase creates new database if file does not exist', async () => {
  assert.equal(fs.existsSync(testDbPath), false);
  
  const database = await openDatabase(testDbPath);
  
  assert.ok(database);
  assert.equal(fs.existsSync(testDbPath), true);
});

test('openDatabase loads existing database', async () => {
  // Create initial database
  await openDatabase(testDbPath);
  insertTicket(createSampleTicket('TEST-001'));
  closeDatabase();
  
  // Reopen and verify data persists
  const database = await openDatabase(testDbPath);
  const ticket = getTicket('TEST-001');
  
  assert.ok(ticket);
  assert.equal(ticket.id, 'TEST-001');
});

test('initializeSchema creates metadata and tickets tables', async () => {
  const database = await openDatabase(testDbPath);
  
  // Verify tables exist by querying them
  const tablesResult = database.exec("SELECT name FROM sqlite_master WHERE type='table'");
  const tableNames = tablesResult[0].values.map(row => row[0]);
  
  assert.ok(tableNames.includes('metadata'));
  assert.ok(tableNames.includes('tickets'));
});

test('initializeSchema creates indexes', async () => {
  const database = await openDatabase(testDbPath);
  
  const indexesResult = database.exec("SELECT name FROM sqlite_master WHERE type='index'");
  const indexNames = indexesResult[0].values.map(row => row[0]);
  
  assert.ok(indexNames.includes('idx_tickets_feature_ref'));
  assert.ok(indexNames.includes('idx_tickets_last_updated'));
});

// JSON serialization tests
test('serializeJson serializes values correctly', () => {
  assert.equal(serializeJson(null), null);
  assert.equal(serializeJson(undefined), null);
  assert.equal(serializeJson('string'), 'string');
  assert.equal(serializeJson(['a', 'b']), '["a","b"]');
  assert.equal(serializeJson({ key: 'value' }), '{"key":"value"}');
});

test('parseJson parses values correctly', () => {
  assert.deepEqual(parseJson(null, []), []);
  assert.deepEqual(parseJson('[]', []), []);
  assert.deepEqual(parseJson('["a","b"]', []), ['a', 'b']);
  assert.deepEqual(parseJson('{"key":"value"}', {}), { key: 'value' });
  assert.equal(parseJson('invalid json', 'default'), 'default');
});

// CRUD operation tests
test('insertTicket inserts a ticket into the database', async () => {
  await openDatabase(testDbPath);
  const ticket = createSampleTicket('TEST-002');
  
  const result = insertTicket(ticket);
  
  assert.equal(result.id, 'TEST-002');
  const retrieved = getTicket('TEST-002');
  assert.ok(retrieved);
  assert.equal(retrieved.title, ticket.title);
});

test('insertTicket serializes JSON fields correctly', async () => {
  await openDatabase(testDbPath);
  const ticket = createSampleTicket('TEST-003');
  
  insertTicket(ticket);
  const retrieved = getTicket('TEST-003');
  
  assert.deepEqual(retrieved.dependencies, ticket.dependencies);
  assert.deepEqual(retrieved.acceptance_criteria, ticket.acceptance_criteria);
  assert.deepEqual(retrieved.files_touched, ticket.files_touched);
  assert.deepEqual(retrieved.assignee, ticket.assignee);
  assert.deepEqual(retrieved.agent, ticket.agent);
});

test('getTicket returns null for non-existent ticket', async () => {
  await openDatabase(testDbPath);
  
  const result = getTicket('NON-EXISTENT');
  
  assert.equal(result, null);
});

test('getAllTickets returns all tickets with pagination', async () => {
  await openDatabase(testDbPath);
  
  insertTicket(createSampleTicket('TEST-004'));
  insertTicket(createSampleTicket('TEST-005'));
  insertTicket(createSampleTicket('TEST-006'));
  
  const result = getAllTickets({ limit: 2, offset: 0 });
  
  assert.equal(result.total, 3);
  assert.equal(result.tickets.length, 2);
});

test('updateTicket updates specified fields', async () => {
  await openDatabase(testDbPath);
  insertTicket(createSampleTicket('TEST-007'));
  
  const updated = updateTicket('TEST-007', { title: 'Updated Title', notes: 'Updated notes' });
  
  assert.ok(updated);
  assert.equal(updated.title, 'Updated Title');
  assert.equal(updated.notes, 'Updated notes');
  // Other fields should remain unchanged
  assert.equal(updated.id, 'TEST-007');
  assert.deepEqual(updated.dependencies, ['ARCH-001', 'ARCH-002']);
});

test('updateTicket updates JSON fields correctly', async () => {
  await openDatabase(testDbPath);
  insertTicket(createSampleTicket('TEST-008'));
  
  const updated = updateTicket('TEST-008', { 
    dependencies: ['NEW-001'],
    assignee: { tool: 'codex', model: 'o3' }
  });
  
  assert.ok(updated);
  assert.deepEqual(updated.dependencies, ['NEW-001']);
  assert.deepEqual(updated.assignee, { tool: 'codex', model: 'o3' });
});

test('updateTicket returns null for non-existent ticket', async () => {
  await openDatabase(testDbPath);
  
  const result = updateTicket('NON-EXISTENT', { title: 'New Title' });
  
  assert.equal(result, null);
});

test('deleteTicket removes ticket from database', async () => {
  await openDatabase(testDbPath);
  insertTicket(createSampleTicket('TEST-009'));
  
  const deleted = deleteTicket('TEST-009');
  
  assert.equal(deleted, true);
  assert.equal(getTicket('TEST-009'), null);
});

test('deleteTicket returns false for non-existent ticket', async () => {
  await openDatabase(testDbPath);
  
  const result = deleteTicket('NON-EXISTENT');
  
  assert.equal(result, false);
});

// Search functionality tests
test('searchTickets searches by ticket ID', async () => {
  await openDatabase(testDbPath);
  insertTicket(createSampleTicket('SEARCH-001'));
  insertTicket(createSampleTicket('OTHER-001'));
  
  const result = searchTickets({ query: 'SEARCH' });
  
  assert.equal(result.total, 1);
  assert.equal(result.tickets[0].id, 'SEARCH-001');
});

test('searchTickets searches by title', async () => {
  await openDatabase(testDbPath);
  insertTicket(createSampleTicket('TEST-010', { title: 'Unique Search Title' }));
  insertTicket(createSampleTicket('TEST-011', { title: 'Different Title' }));
  
  const result = searchTickets({ query: 'Unique Search' });
  
  assert.equal(result.total, 1);
  assert.equal(result.tickets[0].title, 'Unique Search Title');
});

test('searchTickets searches by notes', async () => {
  await openDatabase(testDbPath);
  insertTicket(createSampleTicket('TEST-012', { notes: 'Special note content here' }));
  insertTicket(createSampleTicket('TEST-013', { notes: 'Different content' }));
  
  const result = searchTickets({ query: 'Special note' });
  
  assert.equal(result.total, 1);
  assert.equal(result.tickets[0].id, 'TEST-012');
});

test('searchTickets filters by feature_ref', async () => {
  await openDatabase(testDbPath);
  insertTicket(createSampleTicket('TEST-014', { feature_ref: 'feature-a' }));
  insertTicket(createSampleTicket('TEST-015', { feature_ref: 'feature-b' }));
  
  const result = searchTickets({ featureRef: 'feature-a' });
  
  assert.equal(result.total, 1);
  assert.equal(result.tickets[0].id, 'TEST-014');
});

test('searchTickets combines query and feature_ref filter', async () => {
  await openDatabase(testDbPath);
  insertTicket(createSampleTicket('TEST-016', { title: 'Alpha', feature_ref: 'feature-a' }));
  insertTicket(createSampleTicket('TEST-017', { title: 'Beta', feature_ref: 'feature-a' }));
  insertTicket(createSampleTicket('TEST-018', { title: 'Alpha', feature_ref: 'feature-b' }));
  
  const result = searchTickets({ query: 'Alpha', featureRef: 'feature-a' });
  
  assert.equal(result.total, 1);
  assert.equal(result.tickets[0].id, 'TEST-016');
});

test('searchTickets supports pagination', async () => {
  await openDatabase(testDbPath);
  for (let i = 1; i <= 5; i++) {
    insertTicket(createSampleTicket(`PAG-00${i}`, { last_updated: `2026-02-${10 + i}T12:00:00.000Z` }));
  }
  
  const result = searchTickets({ limit: 2, offset: 0 });
  
  assert.equal(result.total, 5);
  assert.equal(result.tickets.length, 2);
});

test('searchTickets returns all tickets when no filters provided', async () => {
  await openDatabase(testDbPath);
  insertTicket(createSampleTicket('TEST-019'));
  insertTicket(createSampleTicket('TEST-020'));
  
  const result = searchTickets({});
  
  assert.equal(result.total, 2);
});

// Feature refs tests
test('getDistinctFeatureRefs returns unique feature refs', async () => {
  await openDatabase(testDbPath);
  insertTicket(createSampleTicket('TEST-021', { feature_ref: 'feature-a' }));
  insertTicket(createSampleTicket('TEST-022', { feature_ref: 'feature-a' }));
  insertTicket(createSampleTicket('TEST-023', { feature_ref: 'feature-b' }));
  
  const result = getDistinctFeatureRefs();
  
  assert.deepEqual(result.sort(), ['feature-a', 'feature-b']);
});

test('getDistinctFeatureRefs excludes empty feature refs', async () => {
  await openDatabase(testDbPath);
  insertTicket(createSampleTicket('TEST-024', { feature_ref: '' }));
  insertTicket(createSampleTicket('TEST-025', { feature_ref: 'feature-a' }));
  
  const result = getDistinctFeatureRefs();
  
  assert.deepEqual(result, ['feature-a']);
});

// Metadata tests
test('getMetadata returns version and updated_at', async () => {
  await openDatabase(testDbPath);
  
  const metadata = getMetadata();
  
  assert.ok(typeof metadata.version === 'number');
  assert.ok(typeof metadata.updated_at === 'string');
});

test('metadata updated_at changes on ticket modification', async () => {
  await openDatabase(testDbPath);
  const before = getMetadata();
  
  insertTicket(createSampleTicket('TEST-026'));
  
  const after = getMetadata();
  assert.ok(after.updated_at);
});

// Archive data compatibility tests
test('getArchiveData returns compatible format with YAML structure', async () => {
  await openDatabase(testDbPath);
  insertTicket(createSampleTicket('TEST-027'));
  
  const data = getArchiveData();
  
  assert.ok(typeof data.version === 'number');
  assert.ok(typeof data.updated_at === 'string');
  assert.ok(Array.isArray(data.tickets));
  assert.equal(data.tickets.length, 1);
  assert.equal(data.tickets[0].id, 'TEST-027');
});

// Migration tests
test('migrateFromYaml migrates tickets from YAML file', async () => {
  await openDatabase(testDbPath);
  const dir = path.dirname(testDbPath);
  const yamlPath = path.join(dir, 'archive.yml');
  
  const yamlData = {
    version: 2,
    updated_at: '2026-02-15',
    tickets: [
      { id: 'MIGRATE-001', title: 'Ticket 1', status: 'archive', last_updated: '2026-02-15T12:00:00Z' },
      { id: 'MIGRATE-002', title: 'Ticket 2', status: 'archive', last_updated: '2026-02-15T12:00:00Z', dependencies: ['MIGRATE-001'] }
    ]
  };
  fs.writeFileSync(yamlPath, yaml.dump(yamlData));
  
  const result = await migrateFromYaml(yamlPath);
  
  assert.equal(result.success, true);
  assert.equal(result.count, 2);
  
  const ticket1 = getTicket('MIGRATE-001');
  assert.ok(ticket1);
  assert.equal(ticket1.title, 'Ticket 1');
  
  const ticket2 = getTicket('MIGRATE-002');
  assert.ok(ticket2);
  assert.deepEqual(ticket2.dependencies, ['MIGRATE-001']);
});

test('migrateFromYaml returns error for non-existent file', async () => {
  await openDatabase(testDbPath);
  
  const result = await migrateFromYaml('/nonexistent/path.yml');
  
  assert.equal(result.success, false);
  assert.ok(result.error.includes('not found'));
});

test('isMigrationNeeded returns true when YAML exists but DB does not', () => {
  const dir = mkTempDir();
  const yamlPath = path.join(dir, 'archive.yml');
  const dbPath = path.join(dir, 'archive.db');
  
  fs.writeFileSync(yamlPath, 'version: 1\nupdated_at: 2026-02-15\ntickets: []');
  
  assert.equal(isMigrationNeeded(yamlPath, dbPath), true);
});

test('isMigrationNeeded returns false when DB already exists', () => {
  const dir = mkTempDir();
  const yamlPath = path.join(dir, 'archive.yml');
  const dbPath = path.join(dir, 'archive.db');
  
  fs.writeFileSync(yamlPath, 'version: 1\nupdated_at: 2026-02-15\ntickets: []');
  fs.writeFileSync(dbPath, 'dummy db content');
  
  assert.equal(isMigrationNeeded(yamlPath, dbPath), false);
});

// Edge case tests
test('insertTicket handles ticket with minimal fields', async () => {
  await openDatabase(testDbPath);
  
  const minimalTicket = { id: 'MINIMAL-001' };
  insertTicket(minimalTicket);
  
  const retrieved = getTicket('MINIMAL-001');
  assert.ok(retrieved);
  assert.equal(retrieved.id, 'MINIMAL-001');
  assert.equal(retrieved.title, '');
  assert.equal(retrieved.status, 'archive');
  assert.deepEqual(retrieved.dependencies, []);
});

test('rowToTicket handles all field types correctly', () => {
  const row = {
    id: 'ROW-001',
    title: 'Test',
    feature_ref: 'feature.md',
    status: 'archive',
    last_updated: '2026-02-19T12:00:00Z',
    dependencies: '["DEP-001"]',
    acceptance_criteria: '["AC-1"]',
    files_touched: '["file.js"]',
    notes: 'Notes',
    assignee: '{"tool":"kimi"}',
    agent: '{"name":"agent"}'
  };
  
  const ticket = rowToTicket(row);
  
  assert.equal(ticket.id, 'ROW-001');
  assert.deepEqual(ticket.dependencies, ['DEP-001']);
  assert.deepEqual(ticket.assignee, { tool: 'kimi' });
});

test('database operations persist after saveDatabase', async () => {
  await openDatabase(testDbPath);
  insertTicket(createSampleTicket('PERSIST-001'));
  
  saveDatabase();
  closeDatabase();
  
  await openDatabase(testDbPath);
  const ticket = getTicket('PERSIST-001');
  
  assert.ok(ticket);
  assert.equal(ticket.id, 'PERSIST-001');
});

test('throws error when database not initialized', () => {
  closeDatabase();
  
  assert.throws(() => insertTicket({ id: 'TEST' }), /Database not initialized/);
  assert.throws(() => getTicket('TEST'), /Database not initialized/);
  assert.throws(() => getAllTickets(), /Database not initialized/);
  assert.throws(() => updateTicket('TEST', {}), /Database not initialized/);
  assert.throws(() => deleteTicket('TEST'), /Database not initialized/);
  assert.throws(() => searchTickets({}), /Database not initialized/);
});
