const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');

const {
  readBacklog,
  updateBacklogTicketStatus,
  deleteBacklogTicket,
  moveBacklogTicketToArchive,
  hasResolvedDependencies,
  normalizeDependencyId
} = require('../src/main/backlogOperations');

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ombutocode-backlog-ops-'));
}

function writeYaml(filePath, data) {
  fs.writeFileSync(filePath, yaml.dump(data, { lineWidth: -1, noRefs: true }), 'utf-8');
}

function readYaml(filePath) {
  return yaml.load(fs.readFileSync(filePath, 'utf-8'));
}

test('updateBacklogTicketStatus updates status and timestamps', () => {
  const dir = mkTempDir();
  const backlogPath = path.join(dir, 'backlog.yml');
  writeYaml(backlogPath, {
    version: 1,
    updated_at: '2026-02-15',
    tickets: [{ id: 'AD_HOC-100', status: 'backlog', last_updated: '2026-02-15T00:00:00.000Z' }]
  });

  const result = updateBacklogTicketStatus({
    backlogPath,
    ticketId: 'AD_HOC-100',
    newStatus: 'todo',
    now: () => '2026-02-16T12:30:00.000Z'
  });

  assert.equal(result.success, true);
  const updated = readYaml(backlogPath);
  assert.equal(updated.updated_at, '2026-02-16');
  assert.equal(updated.tickets[0].status, 'todo');
  assert.equal(updated.tickets[0].last_updated, '2026-02-16T12:30:00.000Z');
});

test('deleteBacklogTicket removes tickets by id regardless of status', () => {
  const dir = mkTempDir();
  const backlogPath = path.join(dir, 'backlog.yml');
  writeYaml(backlogPath, {
    version: 1,
    updated_at: '2026-02-15',
    tickets: [
      { id: 'AD_HOC-101', status: 'backlog' },
      { id: 'AD_HOC-102', status: 'todo' }
    ]
  });

  const deleted = deleteBacklogTicket({
    backlogPath,
    ticketId: 'AD_HOC-101',
    now: () => '2026-02-16T12:31:00.000Z'
  });
  assert.equal(deleted.success, true);

  const afterDelete = readYaml(backlogPath);
  assert.equal(afterDelete.tickets.some((ticket) => ticket.id === 'AD_HOC-101'), false);
  assert.equal(afterDelete.tickets.some((ticket) => ticket.id === 'AD_HOC-102'), true);

  const deletedTodo = deleteBacklogTicket({
    backlogPath,
    ticketId: 'AD_HOC-102'
  });
  assert.equal(deletedTodo.success, true);

  const afterSecondDelete = readYaml(backlogPath);
  assert.equal(afterSecondDelete.tickets.some((ticket) => ticket.id === 'AD_HOC-102'), false);
});

test('moveBacklogTicketToArchive writes archive first and removes from backlog', () => {
  const dir = mkTempDir();
  const backlogPath = path.join(dir, 'backlog.yml');
  const archivePath = path.join(dir, 'archive.yml');
  writeYaml(backlogPath, {
    version: 1,
    updated_at: '2026-02-15',
    tickets: [{ id: 'AD_HOC-103', status: 'done', last_updated: '2026-02-15T00:00:00.000Z' }]
  });

  const result = moveBacklogTicketToArchive({
    backlogPath,
    archivePath,
    ticketId: 'AD_HOC-103',
    now: () => '2026-02-16T12:32:00.000Z'
  });
  assert.equal(result.success, true);

  const backlogAfter = readBacklog({ backlogPath });
  const archiveAfter = readYaml(archivePath);
  assert.equal(backlogAfter.tickets.length, 0);
  assert.equal(archiveAfter.tickets.length, 1);
  assert.equal(archiveAfter.tickets[0].id, 'AD_HOC-103');
  assert.equal(archiveAfter.tickets[0].status, 'archive');
  assert.equal(archiveAfter.tickets[0].last_updated, '2026-02-16T12:32:00.000Z');
});

// AD_HOC-032: Dependency blocking tests
test('normalizeDependencyId handles various formats', () => {
  assert.equal(normalizeDependencyId('TICKET-123'), 'TICKET-123');
  assert.equal(normalizeDependencyId('[TICKET-123]'), 'TICKET-123');
  assert.equal(normalizeDependencyId('  TICKET-123  '), 'TICKET-123');
  assert.equal(normalizeDependencyId('[  TICKET-123  ]'), 'TICKET-123');
  assert.equal(normalizeDependencyId(''), null);
  assert.equal(normalizeDependencyId(null), null);
  assert.equal(normalizeDependencyId(undefined), null);
});

test('hasResolvedDependencies returns true when no dependencies', () => {
  const ticket = { id: 'AD_HOC-100', dependencies: [] };
  const statusMap = new Map();
  assert.equal(hasResolvedDependencies(ticket, statusMap), true);
});

test('hasResolvedDependencies returns true when dependencies are null', () => {
  const ticket = { id: 'AD_HOC-100' };
  const statusMap = new Map();
  assert.equal(hasResolvedDependencies(ticket, statusMap), true);
});

test('hasResolvedDependencies returns true when all dependencies are review or done', () => {
  const ticket = { id: 'AD_HOC-100', dependencies: ['AD_HOC-001', 'AD_HOC-002'] };
  const statusMap = new Map([
    ['AD_HOC-001', 'review'],
    ['AD_HOC-002', 'done']
  ]);
  assert.equal(hasResolvedDependencies(ticket, statusMap), true);
});

test('hasResolvedDependencies returns false when dependency is todo', () => {
  const ticket = { id: 'AD_HOC-100', dependencies: ['AD_HOC-001'] };
  const statusMap = new Map([
    ['AD_HOC-001', 'todo']
  ]);
  assert.equal(hasResolvedDependencies(ticket, statusMap), false);
});

test('hasResolvedDependencies returns false when dependency is in_progress', () => {
  const ticket = { id: 'AD_HOC-100', dependencies: ['AD_HOC-001'] };
  const statusMap = new Map([
    ['AD_HOC-001', 'in_progress']
  ]);
  assert.equal(hasResolvedDependencies(ticket, statusMap), false);
});

test('hasResolvedDependencies returns false when one of multiple dependencies is unmet', () => {
  const ticket = { id: 'AD_HOC-100', dependencies: ['AD_HOC-001', 'AD_HOC-002'] };
  const statusMap = new Map([
    ['AD_HOC-001', 'done'],
    ['AD_HOC-002', 'in_progress']
  ]);
  assert.equal(hasResolvedDependencies(ticket, statusMap), false);
});

test('updateBacklogTicketStatus blocks transition to in_progress when dependencies are unmet', () => {
  const dir = mkTempDir();
  const backlogPath = path.join(dir, 'backlog.yml');
  writeYaml(backlogPath, {
    version: 1,
    updated_at: '2026-02-15',
    tickets: [
      { id: 'AD_HOC-100', status: 'todo', dependencies: ['AD_HOC-001'], last_updated: '2026-02-15T00:00:00.000Z' },
      { id: 'AD_HOC-001', status: 'todo', dependencies: [], last_updated: '2026-02-15T00:00:00.000Z' }
    ]
  });

  const result = updateBacklogTicketStatus({
    backlogPath,
    ticketId: 'AD_HOC-100',
    newStatus: 'in_progress',
    now: () => '2026-02-16T12:30:00.000Z'
  });

  assert.equal(result.success, false);
  assert.equal(result.error.code, 'UNRESOLVED_DEPENDENCIES');
  assert.ok(result.error.message.includes('AD_HOC-001'));
  assert.deepEqual(result.error.unresolvedDependencies, ['AD_HOC-001']);

  // Verify the ticket status was NOT changed
  const data = readYaml(backlogPath);
  const ticket = data.tickets.find(t => t.id === 'AD_HOC-100');
  assert.equal(ticket.status, 'todo');
});

test('updateBacklogTicketStatus allows transition to in_progress when dependencies are met', () => {
  const dir = mkTempDir();
  const backlogPath = path.join(dir, 'backlog.yml');
  writeYaml(backlogPath, {
    version: 1,
    updated_at: '2026-02-15',
    tickets: [
      { id: 'AD_HOC-100', status: 'todo', dependencies: ['AD_HOC-001'], last_updated: '2026-02-15T00:00:00.000Z' },
      { id: 'AD_HOC-001', status: 'done', dependencies: [], last_updated: '2026-02-15T00:00:00.000Z' }
    ]
  });

  const result = updateBacklogTicketStatus({
    backlogPath,
    ticketId: 'AD_HOC-100',
    newStatus: 'in_progress',
    now: () => '2026-02-16T12:30:00.000Z'
  });

  assert.equal(result.success, true);

  // Verify the ticket status was changed
  const data = readYaml(backlogPath);
  const ticket = data.tickets.find(t => t.id === 'AD_HOC-100');
  assert.equal(ticket.status, 'in_progress');
});

test('updateBacklogTicketStatus ignores dependency check for non-in_progress transitions', () => {
  const dir = mkTempDir();
  const backlogPath = path.join(dir, 'backlog.yml');
  writeYaml(backlogPath, {
    version: 1,
    updated_at: '2026-02-15',
    tickets: [
      { id: 'AD_HOC-100', status: 'backlog', dependencies: ['AD_HOC-001'], last_updated: '2026-02-15T00:00:00.000Z' },
      { id: 'AD_HOC-001', status: 'todo', dependencies: [], last_updated: '2026-02-15T00:00:00.000Z' }
    ]
  });

  // Should be able to move from backlog to todo even if dependency is not done
  const result = updateBacklogTicketStatus({
    backlogPath,
    ticketId: 'AD_HOC-100',
    newStatus: 'todo',
    now: () => '2026-02-16T12:30:00.000Z'
  });

  assert.equal(result.success, true);
});
