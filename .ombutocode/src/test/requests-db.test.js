const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  open,
  close,
  initializeSchema,
  saveDb,
  createRequest,
  getRequest,
  getAllRequests,
  updateRequest,
  deleteRequest,
  searchRequests,
  linkToFeature,
  markRequestDone,
  getDistinctStatuses,
  readMetadata,
  updateMetadata,
  getDbPath
} = require('../src/main/requestsDb');

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ombutocode-requests-db-'));
}

// Setup and teardown helpers
let testDbPath = null;

test.beforeEach(async () => {
  const dir = mkTempDir();
  testDbPath = path.join(dir, 'requests.db');
});

test.afterEach(() => {
  close();
  testDbPath = null;
});

// ─── Database lifecycle tests ────────────────────────────────────────

test('open creates new database if file does not exist', async () => {
  assert.equal(fs.existsSync(testDbPath), false);

  const database = await open(testDbPath);

  assert.ok(database);
  assert.equal(fs.existsSync(testDbPath), true);
});

test('open loads existing database and preserves data', async () => {
  await open(testDbPath);
  createRequest({ title: 'Persisted Request' });
  close();

  await open(testDbPath);
  const result = getAllRequests();

  assert.equal(result.total, 1);
  assert.equal(result.requests[0].title, 'Persisted Request');
});

test('open returns existing db when called twice with same path', async () => {
  const db1 = await open(testDbPath);
  const db2 = await open(testDbPath);

  assert.strictEqual(db1, db2);
});

// ─── Schema initialization tests ────────────────────────────────────

test('initializeSchema creates metadata and requests tables', async () => {
  const database = await open(testDbPath);

  const tablesResult = database.exec("SELECT name FROM sqlite_master WHERE type='table'");
  const tableNames = tablesResult[0].values.map(row => row[0]);

  assert.ok(tableNames.includes('metadata'));
  assert.ok(tableNames.includes('requests'));
});

test('initializeSchema creates indexes on status and created_at', async () => {
  const database = await open(testDbPath);

  const indexesResult = database.exec("SELECT name FROM sqlite_master WHERE type='index'");
  const indexNames = indexesResult[0].values.map(row => row[0]);

  assert.ok(indexNames.includes('idx_requests_status'));
  assert.ok(indexNames.includes('idx_requests_created_at'));
});

test('initializeSchema sets default metadata values', async () => {
  await open(testDbPath);

  const lastId = readMetadata('last_request_id');
  const version = readMetadata('version');

  assert.equal(lastId, '0');
  assert.equal(version, '1');
});

// ─── ID auto-generation tests ────────────────────────────────────────

test('createRequest auto-generates ID in REQ-### format', async () => {
  await open(testDbPath);

  const req = createRequest({ title: 'First Request' });

  assert.equal(req.id, 'REQ-001');
});

test('createRequest increments ID counter sequentially', async () => {
  await open(testDbPath);

  const req1 = createRequest({ title: 'Request 1' });
  const req2 = createRequest({ title: 'Request 2' });
  const req3 = createRequest({ title: 'Request 3' });

  assert.equal(req1.id, 'REQ-001');
  assert.equal(req2.id, 'REQ-002');
  assert.equal(req3.id, 'REQ-003');
});

test('ID counter persists across database reopens', async () => {
  await open(testDbPath);
  createRequest({ title: 'Before Close' });
  close();

  await open(testDbPath);
  const req = createRequest({ title: 'After Reopen' });

  assert.equal(req.id, 'REQ-002');
});

test('ID counter pads to 3 digits', async () => {
  await open(testDbPath);
  // Set counter to 9 so next will be 10
  updateMetadata('last_request_id', '9');

  const req = createRequest({ title: 'Request 10' });

  assert.equal(req.id, 'REQ-010');
});

test('ID counter handles triple digits', async () => {
  await open(testDbPath);
  updateMetadata('last_request_id', '99');

  const req = createRequest({ title: 'Request 100' });

  assert.equal(req.id, 'REQ-100');
});

// ─── CRUD: Create tests ─────────────────────────────────────────────

test('createRequest creates a request with all fields populated', async () => {
  await open(testDbPath);

  const req = createRequest({ title: 'My Request', description: 'Some details' });

  assert.equal(req.title, 'My Request');
  assert.equal(req.description, 'Some details');
  assert.equal(req.status, 'new');
  assert.equal(req.feature_ref, null);
  assert.ok(req.created_at);
  assert.ok(req.updated_at);
});

test('createRequest defaults description to empty string', async () => {
  await open(testDbPath);

  const req = createRequest({ title: 'No Description' });

  assert.equal(req.description, '');
});

test('createRequest trims title whitespace', async () => {
  await open(testDbPath);

  const req = createRequest({ title: '  Trimmed Title  ' });

  assert.equal(req.title, 'Trimmed Title');
});

test('createRequest throws when title is missing', async () => {
  await open(testDbPath);

  assert.throws(() => createRequest({}), /title is required/);
});

test('createRequest throws when title is empty string', async () => {
  await open(testDbPath);

  assert.throws(() => createRequest({ title: '' }), /title is required/);
});

test('createRequest throws when title is whitespace only', async () => {
  await open(testDbPath);

  assert.throws(() => createRequest({ title: '   ' }), /title is required/);
});

// ─── CRUD: Read tests ────────────────────────────────────────────────

test('getRequest returns request by ID', async () => {
  await open(testDbPath);
  createRequest({ title: 'Findable' });

  const req = getRequest('REQ-001');

  assert.ok(req);
  assert.equal(req.title, 'Findable');
});

test('getRequest returns null for non-existent ID', async () => {
  await open(testDbPath);

  const result = getRequest('REQ-999');

  assert.equal(result, null);
});

test('getAllRequests returns all requests with total count', async () => {
  await open(testDbPath);
  createRequest({ title: 'Request A' });
  createRequest({ title: 'Request B' });
  createRequest({ title: 'Request C' });

  const result = getAllRequests();

  assert.equal(result.total, 3);
  assert.equal(result.requests.length, 3);
});

test('getAllRequests supports pagination with limit and offset', async () => {
  await open(testDbPath);
  for (let i = 0; i < 5; i++) {
    createRequest({ title: `Request ${i}` });
  }

  const page1 = getAllRequests({ limit: 2, offset: 0 });
  const page2 = getAllRequests({ limit: 2, offset: 2 });

  assert.equal(page1.total, 5);
  assert.equal(page1.requests.length, 2);
  assert.equal(page2.requests.length, 2);
});

test('getAllRequests returns empty array when no requests exist', async () => {
  await open(testDbPath);

  const result = getAllRequests();

  assert.equal(result.total, 0);
  assert.deepEqual(result.requests, []);
});

test('getAllRequests orders by created_at DESC', async () => {
  await open(testDbPath);
  createRequest({ title: 'First' });
  createRequest({ title: 'Second' });
  createRequest({ title: 'Third' });

  const result = getAllRequests();
  // Most recent first
  assert.equal(result.requests[0].title, 'Third');
});

// ─── CRUD: Update tests ─────────────────────────────────────────────

test('updateRequest updates title', async () => {
  await open(testDbPath);
  createRequest({ title: 'Original' });

  const updated = updateRequest('REQ-001', { title: 'Updated Title' });

  assert.equal(updated.title, 'Updated Title');
});

test('updateRequest updates description', async () => {
  await open(testDbPath);
  createRequest({ title: 'Test', description: 'Old' });

  const updated = updateRequest('REQ-001', { description: 'New Description' });

  assert.equal(updated.description, 'New Description');
});

test('updateRequest updates updated_at timestamp', async () => {
  await open(testDbPath);
  const req = createRequest({ title: 'Test' });
  const originalUpdatedAt = req.updated_at;

  // Small delay to ensure different timestamp
  await new Promise(r => setTimeout(r, 10));
  const updated = updateRequest('REQ-001', { title: 'Changed' });

  assert.ok(updated.updated_at >= originalUpdatedAt);
});

test('updateRequest returns null for non-existent ID', async () => {
  await open(testDbPath);

  const result = updateRequest('REQ-999', { title: 'Nope' });

  assert.equal(result, null);
});

test('updateRequest returns existing request when no allowed fields provided', async () => {
  await open(testDbPath);
  createRequest({ title: 'Unchanged' });

  const result = updateRequest('REQ-001', { status: 'linked' });

  assert.equal(result.title, 'Unchanged');
  assert.equal(result.status, 'new'); // status not changed via update
});

test('updateRequest ignores disallowed fields', async () => {
  await open(testDbPath);
  createRequest({ title: 'Test' });

  const result = updateRequest('REQ-001', { id: 'REQ-HACK', status: 'linked', title: 'OK' });

  assert.equal(result.id, 'REQ-001');
  assert.equal(result.status, 'new');
  assert.equal(result.title, 'OK');
});

// ─── CRUD: Delete tests ─────────────────────────────────────────────

test('deleteRequest removes request from database', async () => {
  await open(testDbPath);
  createRequest({ title: 'To Delete' });

  const deleted = deleteRequest('REQ-001');

  assert.equal(deleted, true);
  assert.equal(getRequest('REQ-001'), null);
});

test('deleteRequest returns false for non-existent ID', async () => {
  await open(testDbPath);

  const result = deleteRequest('REQ-999');

  assert.equal(result, false);
});

test('deleteRequest does not affect other requests', async () => {
  await open(testDbPath);
  createRequest({ title: 'Keep' });
  createRequest({ title: 'Delete Me' });

  deleteRequest('REQ-002');

  assert.ok(getRequest('REQ-001'));
  assert.equal(getRequest('REQ-002'), null);
});

// ─── Search functionality tests ──────────────────────────────────────

test('searchRequests by title query', async () => {
  await open(testDbPath);
  createRequest({ title: 'Alpha Feature' });
  createRequest({ title: 'Beta Feature' });

  const result = searchRequests({ query: 'Alpha' });

  assert.equal(result.total, 1);
  assert.equal(result.requests[0].title, 'Alpha Feature');
});

test('searchRequests by description query', async () => {
  await open(testDbPath);
  createRequest({ title: 'Req A', description: 'Contains special keyword' });
  createRequest({ title: 'Req B', description: 'Nothing here' });

  const result = searchRequests({ query: 'special keyword' });

  assert.equal(result.total, 1);
  assert.equal(result.requests[0].title, 'Req A');
});

test('searchRequests filters by status', async () => {
  await open(testDbPath);
  createRequest({ title: 'New One' });
  createRequest({ title: 'Another' });
  // Link the second one to change its status
  linkToFeature('REQ-002', '.ombutocode/features/test.md');

  const result = searchRequests({ status: 'linked' });

  assert.equal(result.total, 1);
  assert.equal(result.requests[0].id, 'REQ-002');
});

test('searchRequests filters by feature_ref', async () => {
  await open(testDbPath);
  createRequest({ title: 'Req 1' });
  createRequest({ title: 'Req 2' });
  linkToFeature('REQ-001', '.ombutocode/features/feature_A.md');
  linkToFeature('REQ-002', '.ombutocode/features/feature_B.md');

  const result = searchRequests({ feature_ref: '.ombutocode/features/feature_A.md' });

  assert.equal(result.total, 1);
  assert.equal(result.requests[0].id, 'REQ-001');
});

test('searchRequests combines query and status filter', async () => {
  await open(testDbPath);
  createRequest({ title: 'Alpha' });
  createRequest({ title: 'Alpha Linked' });
  linkToFeature('REQ-002', '.ombutocode/features/test.md');

  const result = searchRequests({ query: 'Alpha', status: 'linked' });

  assert.equal(result.total, 1);
  assert.equal(result.requests[0].id, 'REQ-002');
});

test('searchRequests supports pagination', async () => {
  await open(testDbPath);
  for (let i = 0; i < 5; i++) {
    createRequest({ title: `Searchable ${i}` });
  }

  const result = searchRequests({ limit: 2, offset: 0 });

  assert.equal(result.total, 5);
  assert.equal(result.requests.length, 2);
});

test('searchRequests returns all when no filters given', async () => {
  await open(testDbPath);
  createRequest({ title: 'A' });
  createRequest({ title: 'B' });

  const result = searchRequests({});

  assert.equal(result.total, 2);
});

// ─── linkToFeature tests ─────────────────────────────────────────────

test('linkToFeature changes status to linked', async () => {
  await open(testDbPath);
  createRequest({ title: 'To Link' });

  const linked = linkToFeature('REQ-001', '.ombutocode/features/feature_TEST.md');

  assert.equal(linked.status, 'linked');
  assert.equal(linked.feature_ref, '.ombutocode/features/feature_TEST.md');
});

test('linkToFeature updates updated_at timestamp', async () => {
  await open(testDbPath);
  const req = createRequest({ title: 'To Link' });

  await new Promise(r => setTimeout(r, 10));
  const linked = linkToFeature('REQ-001', '.ombutocode/features/test.md');

  assert.ok(linked.updated_at >= req.updated_at);
});

test('linkToFeature returns null for non-existent ID', async () => {
  await open(testDbPath);

  const result = linkToFeature('REQ-999', '.ombutocode/features/test.md');

  assert.equal(result, null);
});

// ─── markAsDone tests ─────────────────────────────────────────────────

test('markAsDone changes status to done', async () => {
  await open(testDbPath);
  createRequest({ title: 'To Complete' });

  const done = markRequestDone('REQ-001');

  assert.equal(done.status, 'done');
});

test('markAsDone updates updated_at timestamp', async () => {
  await open(testDbPath);
  const req = createRequest({ title: 'To Complete' });

  await new Promise(r => setTimeout(r, 10));
  const done = markRequestDone('REQ-001');

  assert.ok(done.updated_at >= req.updated_at);
});

test('markAsDone returns null for non-existent ID', async () => {
  await open(testDbPath);

  const result = markRequestDone('REQ-999');

  assert.equal(result, null);
});

test('markAsDone works on linked requests', async () => {
  await open(testDbPath);
  createRequest({ title: 'Linked then done' });
  linkToFeature('REQ-001', '.ombutocode/features/test.md');

  const done = markRequestDone('REQ-001');

  assert.equal(done.status, 'done');
  assert.equal(done.feature_ref, '.ombutocode/features/test.md');
});

test('markAsDone persists to database', async () => {
  await open(testDbPath);
  createRequest({ title: 'Persist done' });
  markRequestDone('REQ-001');
  close();

  await open(testDbPath);
  const req = getRequest('REQ-001');

  assert.equal(req.status, 'done');
});

// ─── Utility tests ───────────────────────────────────────────────────

test('getDistinctStatuses returns unique status values', async () => {
  await open(testDbPath);
  createRequest({ title: 'New 1' });
  createRequest({ title: 'New 2' });
  createRequest({ title: 'To Link' });
  linkToFeature('REQ-003', '.ombutocode/features/test.md');

  const statuses = getDistinctStatuses();

  assert.ok(statuses.includes('new'));
  assert.ok(statuses.includes('linked'));
  assert.equal(statuses.length, 2);
});

test('getDistinctStatuses returns empty array when no requests exist', async () => {
  await open(testDbPath);

  const statuses = getDistinctStatuses();

  assert.deepEqual(statuses, []);
});

test('readMetadata returns value for existing key', async () => {
  await open(testDbPath);

  const version = readMetadata('version');

  assert.equal(version, '1');
});

test('readMetadata returns null for non-existent key', async () => {
  await open(testDbPath);

  const result = readMetadata('nonexistent');

  assert.equal(result, null);
});

test('updateMetadata updates existing key', async () => {
  await open(testDbPath);

  updateMetadata('version', '2');
  const version = readMetadata('version');

  assert.equal(version, '2');
});

test('updateMetadata creates new key', async () => {
  await open(testDbPath);

  updateMetadata('custom_key', 'custom_value');
  const value = readMetadata('custom_key');

  assert.equal(value, 'custom_value');
});

test('getDbPath returns current database path', async () => {
  await open(testDbPath);

  assert.equal(getDbPath(), testDbPath);
});

// ─── Error cases: database not initialized ───────────────────────────

test('throws error when database not initialized', () => {
  close();

  assert.throws(() => createRequest({ title: 'Test' }), /Database not initialized/);
  assert.throws(() => getRequest('REQ-001'), /Database not initialized/);
  assert.throws(() => getAllRequests(), /Database not initialized/);
  assert.throws(() => updateRequest('REQ-001', {}), /Database not initialized/);
  assert.throws(() => deleteRequest('REQ-001'), /Database not initialized/);
  assert.throws(() => searchRequests({}), /Database not initialized/);
  assert.throws(() => linkToFeature('REQ-001', 'path'), /Database not initialized/);
  assert.throws(() => markRequestDone('REQ-001'), /Database not initialized/);
  assert.throws(() => getDistinctStatuses(), /Database not initialized/);
  assert.throws(() => readMetadata('key'), /Database not initialized/);
  assert.throws(() => updateMetadata('key', 'val'), /Database not initialized/);
});

// ─── Data persistence tests ──────────────────────────────────────────

test('saveDb persists data to disk', async () => {
  await open(testDbPath);
  createRequest({ title: 'Persistent' });
  saveDb();
  close();

  await open(testDbPath);
  const req = getRequest('REQ-001');

  assert.ok(req);
  assert.equal(req.title, 'Persistent');
});

test('close saves and closes database cleanly', async () => {
  await open(testDbPath);
  createRequest({ title: 'Before Close' });
  close();

  // Reopen and verify
  await open(testDbPath);
  const req = getRequest('REQ-001');
  assert.ok(req);
});
