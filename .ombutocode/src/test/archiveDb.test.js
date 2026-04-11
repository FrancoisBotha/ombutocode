const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const archiveDb = require('../src/main/archiveDb');

/**
 * Create a temporary directory for test databases
 */
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'archivedb-test-'));
}

/**
 * Clean up a temporary directory and all its contents
 */
function cleanupTempDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ==================== Schema & Initialization ====================

test('Database: schema is created on first access', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    // Verify metadata table exists and has initial values
    const version = archiveDb.readMetadata('version');
    assert.equal(version, '1', 'version metadata should be initialized to 1');

    const updatedAt = archiveDb.readMetadata('updated_at');
    assert.ok(updatedAt, 'updated_at metadata should be set');

    // Verify tickets table is empty and queryable
    const allTickets = archiveDb.readAllTickets();
    assert.deepEqual(allTickets, [], 'newly created database should have no tickets');

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('Database: initializing same path twice does not error', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);
    const version1 = archiveDb.readMetadata('version');

    // Open again with same path
    await archiveDb.open(dbPath);
    const version2 = archiveDb.readMetadata('version');

    assert.equal(version1, version2, 'reopening same path should preserve data');

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ==================== CRUD: Insert ====================

test('CRUD: insert a ticket', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    const ticket = {
      id: 'TICKET-001',
      title: 'Test Ticket',
      epic_ref: 'feature_test.md',
      status: 'archive',
      last_updated: '2026-02-19',
      dependencies: ['DEP-001'],
      acceptance_criteria: ['AC-1', 'AC-2'],
      files_touched: ['file1.js'],
      notes: 'Test notes',
      assignee: { name: 'John Doe' },
      agent: { state: 'completed' }
    };

    archiveDb.insertTicket(ticket);

    const read = archiveDb.readTicketById('TICKET-001');
    assert.ok(read, 'ticket should be readable after insert');
    assert.equal(read.id, 'TICKET-001');
    assert.equal(read.title, 'Test Ticket');
    assert.equal(read.epic_ref, 'feature_test.md');
    assert.deepEqual(read.dependencies, ['DEP-001']);
    assert.deepEqual(read.acceptance_criteria, ['AC-1', 'AC-2']);
    assert.deepEqual(read.files_touched, ['file1.js']);
    assert.deepEqual(read.assignee, { name: 'John Doe' });
    assert.deepEqual(read.agent, { state: 'completed' });

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('CRUD: insert multiple tickets', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    archiveDb.insertTicket({ id: 'TICKET-001', title: 'First' });
    archiveDb.insertTicket({ id: 'TICKET-002', title: 'Second' });
    archiveDb.insertTicket({ id: 'TICKET-003', title: 'Third' });

    const allTickets = archiveDb.readAllTickets();
    assert.equal(allTickets.length, 3, 'should have 3 tickets');
    assert.equal(allTickets[0].id, 'TICKET-003', 'readAllTickets should order by last_updated DESC');

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ==================== CRUD: Read ====================

test('CRUD: read all tickets', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    assert.deepEqual(archiveDb.readAllTickets(), []);

    archiveDb.insertTicket({ id: 'T1', title: 'Ticket 1' });
    archiveDb.insertTicket({ id: 'T2', title: 'Ticket 2' });

    const tickets = archiveDb.readAllTickets();
    assert.equal(tickets.length, 2);

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('CRUD: read ticket by id', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    archiveDb.insertTicket({ id: 'T1', title: 'Ticket 1', notes: 'Note 1' });
    archiveDb.insertTicket({ id: 'T2', title: 'Ticket 2', notes: 'Note 2' });

    const ticket = archiveDb.readTicketById('T1');
    assert.equal(ticket.id, 'T1');
    assert.equal(ticket.title, 'Ticket 1');
    assert.equal(ticket.notes, 'Note 1');

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('CRUD: read non-existent ticket returns null', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    const ticket = archiveDb.readTicketById('NONEXISTENT');
    assert.equal(ticket, null);

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ==================== CRUD: Update ====================

test('CRUD: update ticket fields', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    archiveDb.insertTicket({
      id: 'T1',
      title: 'Original Title',
      notes: 'Original Notes',
      epic_ref: 'original.md'
    });

    const updated = archiveDb.updateTicket('T1', {
      title: 'Updated Title',
      epic_ref: 'updated.md'
    });

    assert.equal(updated.title, 'Updated Title');
    assert.equal(updated.epic_ref, 'updated.md');
    assert.equal(updated.notes, 'Original Notes', 'unchanged fields should remain');

    const reread = archiveDb.readTicketById('T1');
    assert.equal(reread.title, 'Updated Title');

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('CRUD: update non-existent ticket returns null', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    const result = archiveDb.updateTicket('NONEXISTENT', { title: 'New' });
    assert.equal(result, null);

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('CRUD: update with JSON fields', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    archiveDb.insertTicket({
      id: 'T1',
      dependencies: ['DEP-1'],
      acceptance_criteria: ['AC-1']
    });

    const updated = archiveDb.updateTicket('T1', {
      dependencies: ['DEP-1', 'DEP-2', 'DEP-3'],
      acceptance_criteria: ['AC-1', 'AC-2', 'AC-3']
    });

    assert.deepEqual(updated.dependencies, ['DEP-1', 'DEP-2', 'DEP-3']);
    assert.deepEqual(updated.acceptance_criteria, ['AC-1', 'AC-2', 'AC-3']);

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ==================== CRUD: Delete ====================

test('CRUD: delete ticket', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    archiveDb.insertTicket({ id: 'T1', title: 'Ticket 1' });
    archiveDb.insertTicket({ id: 'T2', title: 'Ticket 2' });

    assert.equal(archiveDb.readAllTickets().length, 2);

    archiveDb.deleteTicket('T1');

    assert.equal(archiveDb.readAllTickets().length, 1);
    assert.equal(archiveDb.readTicketById('T1'), null);
    assert.ok(archiveDb.readTicketById('T2'));

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('CRUD: delete non-existent ticket does not error', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    archiveDb.deleteTicket('NONEXISTENT');
    assert.ok(true, 'deleting non-existent ticket should not throw');

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ==================== JSON Serialization ====================

test('JSON: round-trip serialization of complex objects', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    const complexTicket = {
      id: 'COMPLEX',
      title: 'Complex Ticket',
      dependencies: ['DEP-A', 'DEP-B'],
      acceptance_criteria: ['AC-1', 'AC-2', 'AC-3'],
      files_touched: ['file1.js', 'file2.ts', 'docs/readme.md'],
      assignee: {
        name: 'John Doe',
        email: 'john@example.com'
      },
      agent: {
        state: 'completed',
        metadata: { runs: 5 }
      }
    };

    archiveDb.insertTicket(complexTicket);
    const read = archiveDb.readTicketById('COMPLEX');

    assert.deepEqual(read.dependencies, complexTicket.dependencies);
    assert.deepEqual(read.acceptance_criteria, complexTicket.acceptance_criteria);
    assert.deepEqual(read.files_touched, complexTicket.files_touched);
    assert.deepEqual(read.assignee, complexTicket.assignee);
    assert.deepEqual(read.agent, complexTicket.agent);

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('JSON: null JSON fields are preserved', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    const ticket = {
      id: 'NULL-FIELDS',
      title: 'Test',
      assignee: null,
      agent: null
    };

    archiveDb.insertTicket(ticket);
    const read = archiveDb.readTicketById('NULL-FIELDS');

    assert.equal(read.assignee, null);
    assert.equal(read.agent, null);

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('JSON: empty arrays are preserved', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    const ticket = {
      id: 'EMPTY-ARRAYS',
      title: 'Test',
      dependencies: [],
      acceptance_criteria: [],
      files_touched: []
    };

    archiveDb.insertTicket(ticket);
    const read = archiveDb.readTicketById('EMPTY-ARRAYS');

    assert.deepEqual(read.dependencies, []);
    assert.deepEqual(read.acceptance_criteria, []);
    assert.deepEqual(read.files_touched, []);

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ==================== Search ====================

test('Search: basic query search', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    archiveDb.insertTicket({ id: 'T1', title: 'Create Database' });
    archiveDb.insertTicket({ id: 'T2', title: 'Update API' });
    archiveDb.insertTicket({ id: 'T3', title: 'Fix Database Bug' });

    const results = archiveDb.searchTickets('Database');
    assert.equal(results.total, 2);
    assert.equal(results.tickets.length, 2);

    const ids = results.tickets.map(t => t.id);
    assert.ok(ids.includes('T1'));
    assert.ok(ids.includes('T3'));

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('Search: search by ticket ID', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    archiveDb.insertTicket({ id: 'TICKET-001', title: 'First' });
    archiveDb.insertTicket({ id: 'TICKET-002', title: 'Second' });
    archiveDb.insertTicket({ id: 'OTHER-001', title: 'Third' });

    const results = archiveDb.searchTickets('TICKET');
    assert.equal(results.total, 2);

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('Search: search by notes', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    archiveDb.insertTicket({ id: 'T1', title: 'One', notes: 'This is important' });
    archiveDb.insertTicket({ id: 'T2', title: 'Two', notes: 'Not relevant' });
    archiveDb.insertTicket({ id: 'T3', title: 'Three', notes: 'Very important' });

    const results = archiveDb.searchTickets('important');
    assert.equal(results.total, 2);

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('Search: case-insensitive search', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    archiveDb.insertTicket({ id: 'T1', title: 'TestCase' });
    archiveDb.insertTicket({ id: 'T2', title: 'another' });

    const lowercase = archiveDb.searchTickets('testcase');
    const uppercase = archiveDb.searchTickets('TESTCASE');
    const mixed = archiveDb.searchTickets('TestCase');

    assert.equal(lowercase.total, 1);
    assert.equal(uppercase.total, 1);
    assert.equal(mixed.total, 1);

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('Search: epic_ref filter', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    archiveDb.insertTicket({ id: 'T1', epic_ref: 'feature_auth.md', title: 'Auth' });
    archiveDb.insertTicket({ id: 'T2', epic_ref: 'feature_db.md', title: 'Database' });
    archiveDb.insertTicket({ id: 'T3', epic_ref: 'feature_auth.md', title: 'Login' });
    archiveDb.insertTicket({ id: 'T4', epic_ref: '', title: 'Untagged' });

    const results = archiveDb.searchTickets('', 'feature_auth.md');
    assert.equal(results.total, 2);
    assert.ok(results.tickets.every(t => t.epic_ref === 'feature_auth.md'));

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('Search: combined query and epic_ref filter', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    archiveDb.insertTicket({ id: 'T1', epic_ref: 'feature_auth.md', title: 'Auth Setup' });
    archiveDb.insertTicket({ id: 'T2', epic_ref: 'feature_db.md', title: 'Auth Migration' });
    archiveDb.insertTicket({ id: 'T3', epic_ref: 'feature_auth.md', title: 'Auth Login Form' });

    const results = archiveDb.searchTickets('Auth', 'feature_auth.md');
    assert.equal(results.total, 2, 'should find T1 and T3 with feature_auth.md and Auth in title');

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('Search: pagination with limit and offset', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    for (let i = 1; i <= 10; i++) {
      archiveDb.insertTicket({ id: `T${i}`, title: `Ticket ${i}` });
    }

    const page1 = archiveDb.searchTickets('', '', 3, 0);
    assert.equal(page1.tickets.length, 3);
    assert.equal(page1.total, 10);

    const page2 = archiveDb.searchTickets('', '', 3, 3);
    assert.equal(page2.tickets.length, 3);

    const page4 = archiveDb.searchTickets('', '', 3, 9);
    assert.equal(page4.tickets.length, 1);

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('Search: empty search returns all tickets', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    archiveDb.insertTicket({ id: 'T1', title: 'First' });
    archiveDb.insertTicket({ id: 'T2', title: 'Second' });
    archiveDb.insertTicket({ id: 'T3', title: 'Third' });

    const results = archiveDb.searchTickets('');
    assert.equal(results.total, 3);
    assert.equal(results.tickets.length, 3);

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ==================== Migration ====================

test('Migration: isMigrationNeeded detects when YAML exists but DB does not', async () => {
  const tempDir = createTempDir();
  const yamlPath = path.join(tempDir, 'archive.yml');
  const dbPath = path.join(tempDir, 'archive.db');

  try {
    // Write a dummy YAML file
    fs.writeFileSync(yamlPath, 'version: 1\nupdated_at: "2026-02-19"\ntickets: []\n');

    const needed = archiveDb.isMigrationNeeded(yamlPath, dbPath);
    assert.equal(needed, true);

    // Now create the DB file
    await archiveDb.open(dbPath);
    archiveDb.close();

    const needed2 = archiveDb.isMigrationNeeded(yamlPath, dbPath);
    assert.equal(needed2, false);

    fs.unlinkSync(yamlPath);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('Migration: migrateFromYaml imports all tickets', async () => {
  const tempDir = createTempDir();
  const yamlPath = path.join(tempDir, 'archive.yml');
  const dbPath = path.join(tempDir, 'archive.db');

  try {
    // Create a YAML file with test data
    const yamlContent = `
version: 2
updated_at: "2026-02-19"
tickets:
  - id: ARCHIVED-001
    title: Old Ticket
    epic_ref: feature_test.md
    status: archive
    last_updated: "2026-02-19T10:00:00Z"
    dependencies: []
    acceptance_criteria: []
    files_touched: []
    notes: Test note
    assignee: null
    agent: null
  - id: ARCHIVED-002
    title: Another Old Ticket
    epic_ref: feature_other.md
    status: archive
    last_updated: "2026-02-19T11:00:00Z"
    dependencies:
      - ARCHIVED-001
    acceptance_criteria:
      - Test AC
    files_touched:
      - file.js
    notes: Second note
    assignee: null
    agent: null
`;

    fs.writeFileSync(yamlPath, yamlContent);

    // Initialize and open database
    await archiveDb.open(dbPath);

    // Run migration (modifies the currently open database)
    const result = await archiveDb.migrateFromYaml(yamlPath);
    assert.equal(result.success, true);
    assert.equal(result.count, 2);

    // Verify the tickets are in the currently open database
    const tickets = archiveDb.readAllTickets();
    assert.equal(tickets.length, 2);

    const ticket1 = archiveDb.readTicketById('ARCHIVED-001');
    assert.equal(ticket1.title, 'Old Ticket');
    assert.equal(ticket1.epic_ref, 'feature_test.md');

    const ticket2 = archiveDb.readTicketById('ARCHIVED-002');
    assert.deepEqual(ticket2.dependencies, ['ARCHIVED-001']);
    assert.deepEqual(ticket2.acceptance_criteria, ['Test AC']);
    assert.deepEqual(ticket2.files_touched, ['file.js']);

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('Migration: renames archive.yml to archive.yml.migrated after success', async () => {
  const tempDir = createTempDir();
  const yamlPath = path.join(tempDir, 'archive.yml');
  const migratedPath = path.join(tempDir, 'archive.yml.migrated');
  const dbPath = path.join(tempDir, 'archive.db');

  try {
    const yamlContent = `
version: 1
updated_at: "2026-02-19"
tickets:
  - id: T1
    title: Test
    epic_ref: ""
    status: archive
    last_updated: "2026-02-19"
    dependencies: []
    acceptance_criteria: []
    files_touched: []
    notes: ""
    assignee: null
    agent: null
`;

    fs.writeFileSync(yamlPath, yamlContent);
    assert.ok(fs.existsSync(yamlPath), 'YAML file should exist before migration');

    await archiveDb.openDatabase(dbPath);
    await archiveDb.migrateFromYaml(yamlPath);

    assert.ok(fs.existsSync(migratedPath), 'archive.yml.migrated should exist after migration');
    assert.ok(!fs.existsSync(yamlPath), 'archive.yml should not exist after migration');

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('Migration: migration is idempotent (no duplicate on re-run)', async () => {
  const tempDir = createTempDir();
  const yamlPath = path.join(tempDir, 'archive.yml');
  const dbPath = path.join(tempDir, 'archive.db');

  try {
    const yamlContent = `
version: 1
updated_at: "2026-02-19"
tickets:
  - id: T1
    title: Test
    epic_ref: ""
    status: archive
    last_updated: "2026-02-19"
    dependencies: []
    acceptance_criteria: []
    files_touched: []
    notes: ""
    assignee: null
    agent: null
`;

    fs.writeFileSync(yamlPath, yamlContent);

    // First migration
    const result1 = await archiveDb.migrateFromYaml(yamlPath);
    await archiveDb.open(dbPath);
    const count1 = archiveDb.readAllTickets().length;
    archiveDb.close();

    // Restore the YAML file and try again
    fs.writeFileSync(yamlPath, yamlContent);

    // Second migration (should only succeed if db doesn't exist, or handle gracefully)
    const result2 = await archiveDb.migrateFromYaml(yamlPath);

    // Verify no duplicates
    await archiveDb.open(dbPath);
    const count2 = archiveDb.readAllTickets().length;
    assert.equal(count1, count2, 'running migration twice should not duplicate tickets');

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('Migration: handles YAML file not found gracefully', async () => {
  const tempDir = createTempDir();
  const yamlPath = path.join(tempDir, 'nonexistent.yml');

  try {
    const result = await archiveDb.migrateFromYaml(yamlPath);
    assert.equal(result.success, false);
    assert.ok(result.error.includes('not found'));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('Migration: handles YAML with no tickets gracefully', async () => {
  const tempDir = createTempDir();
  const yamlPath = path.join(tempDir, 'archive.yml');
  const dbPath = path.join(tempDir, 'archive.db');

  try {
    fs.writeFileSync(yamlPath, 'version: 1\nupdated_at: "2026-02-19"\ntickets: null\n');

    const result = await archiveDb.migrateFromYaml(yamlPath);
    assert.equal(result.success, true);
    assert.equal(result.count, 0);

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ==================== Edge Cases ====================

test('Edge case: empty archive returns correct data', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    const allTickets = archiveDb.readAllTickets();
    assert.deepEqual(allTickets, []);

    const results = archiveDb.searchTickets('anything');
    assert.equal(results.total, 0);
    assert.deepEqual(results.tickets, []);

    const archiveData = archiveDb.getArchiveData();
    assert.deepEqual(archiveData.tickets, []);
    assert.ok(archiveData.version);

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('Edge case: duplicate ticket ID is replaced (INSERT OR REPLACE)', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    archiveDb.insertTicket({ id: 'T1', title: 'First Version' });
    assert.equal(archiveDb.readAllTickets().length, 1);

    archiveDb.insertTicket({ id: 'T1', title: 'Second Version' });
    assert.equal(archiveDb.readAllTickets().length, 1, 'duplicate ID should replace');

    const ticket = archiveDb.readTicketById('T1');
    assert.equal(ticket.title, 'Second Version');

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('Edge case: special characters in ticket fields', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    const ticket = {
      id: 'SPECIAL-001',
      title: 'Test with "quotes" and \'apostrophes\'',
      notes: 'Notes with % and _ and \\ backslash',
      epic_ref: 'feature_test_2026-02-19.md'
    };

    archiveDb.insertTicket(ticket);
    const read = archiveDb.readTicketById('SPECIAL-001');

    assert.equal(read.title, ticket.title);
    assert.equal(read.notes, ticket.notes);
    assert.equal(read.epic_ref, ticket.epic_ref);

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('Edge case: very long strings', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    const longString = 'a'.repeat(10000);
    const ticket = {
      id: 'LONG-001',
      title: 'Normal title',
      notes: longString
    };

    archiveDb.insertTicket(ticket);
    const read = archiveDb.readTicketById('LONG-001');

    assert.equal(read.notes.length, 10000);
    assert.equal(read.notes, longString);

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ==================== Metadata Operations ====================

test('Metadata: read and update metadata', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    archiveDb.updateMetadata('custom_key', 'custom_value');
    const value = archiveDb.readMetadata('custom_key');
    assert.equal(value, 'custom_value');

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('Metadata: readAllMetadata returns all keys', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    archiveDb.updateMetadata('key1', 'value1');
    archiveDb.updateMetadata('key2', 'value2');

    const allMetadata = archiveDb.readAllMetadata();
    assert.equal(allMetadata.key1, 'value1');
    assert.equal(allMetadata.key2, 'value2');
    assert.ok(allMetadata.version);
    assert.ok(allMetadata.updated_at);

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ==================== Feature References ====================

test('Feature references: getDistinctEpicRefs returns unique feature refs', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    archiveDb.insertTicket({ id: 'T1', epic_ref: 'feature_auth.md' });
    archiveDb.insertTicket({ id: 'T2', epic_ref: 'feature_db.md' });
    archiveDb.insertTicket({ id: 'T3', epic_ref: 'feature_auth.md' });
    archiveDb.insertTicket({ id: 'T4', epic_ref: '' });

    const refs = archiveDb.getDistinctEpicRefs();
    assert.deepEqual(refs, ['feature_auth.md', 'feature_db.md']);

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('Feature references: empty epic_ref is excluded', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    archiveDb.insertTicket({ id: 'T1', epic_ref: '' });
    archiveDb.insertTicket({ id: 'T2', epic_ref: 'feature.md' });

    const refs = archiveDb.getDistinctEpicRefs();
    assert.ok(!refs.includes(''));
    assert.equal(refs.length, 1);

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ==================== Archive Data Export ====================

test('Export: getArchiveData returns YAML-compatible format', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await archiveDb.open(dbPath);

    archiveDb.insertTicket({ id: 'T1', title: 'Ticket 1' });
    archiveDb.insertTicket({ id: 'T2', title: 'Ticket 2' });
    archiveDb.updateMetadata('version', '2');
    archiveDb.updateMetadata('updated_at', '2026-02-19');

    const data = archiveDb.getArchiveData();

    assert.ok(data.version);
    assert.ok(data.updated_at);
    assert.ok(Array.isArray(data.tickets));
    assert.equal(data.tickets.length, 2);

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ==================== Database Persistence ====================

test('Persistence: data persists across opens', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'persistent.db');

  try {
    // First open - write data
    await archiveDb.open(dbPath);
    archiveDb.insertTicket({ id: 'PERSIST-001', title: 'Persistent' });
    archiveDb.close();

    // Second open - verify data
    await archiveDb.open(dbPath);
    const ticket = archiveDb.readTicketById('PERSIST-001');
    assert.ok(ticket);
    assert.equal(ticket.title, 'Persistent');

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('Persistence: multiple inserts are persisted', async () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'multi.db');

  try {
    await archiveDb.open(dbPath);

    for (let i = 1; i <= 5; i++) {
      archiveDb.insertTicket({ id: `MULTI-${i}`, title: `Ticket ${i}` });
    }

    archiveDb.close();

    // Reopen and verify all 5 are there
    await archiveDb.open(dbPath);
    const allTickets = archiveDb.readAllTickets();
    assert.equal(allTickets.length, 5);

    archiveDb.close();
  } finally {
    cleanupTempDir(tempDir);
  }
});
