const assert = require('node:assert');
const test = require('node:test');
const path = require('node:path');
const fs = require('node:fs');
const yaml = require('js-yaml');
const os = require('node:os');

const { hasResolvedDependencies, normalizeDependencyId } = require('../src/main/backlogOperations');

/**
 * Test dependency blocking for agent start handlers
 */

test('normalizeDependencyId handles various formats', () => {
  assert.equal(normalizeDependencyId('TICKET-123'), 'TICKET-123');
  assert.equal(normalizeDependencyId('[TICKET-123]'), 'TICKET-123');
  assert.equal(normalizeDependencyId('  TICKET-123  '), 'TICKET-123');
  assert.equal(normalizeDependencyId('[  TICKET-123  ]'), 'TICKET-123');
  assert.equal(normalizeDependencyId(''), null);
  assert.equal(normalizeDependencyId(null), null);
  assert.equal(normalizeDependencyId(undefined), null);
});

test('hasResolvedDependencies blocks start when dependencies are in todo', () => {
  const ticket = {
    id: 'FEAT-100',
    status: 'todo',
    dependencies: ['FEAT-001', 'FEAT-002']
  };

  const ticketStatusById = new Map([
    ['FEAT-100', 'todo'],
    ['FEAT-001', 'todo'],
    ['FEAT-002', 'todo']
  ]);

  assert.equal(hasResolvedDependencies(ticket, ticketStatusById), false);
});

test('hasResolvedDependencies blocks start when dependencies are in_progress', () => {
  const ticket = {
    id: 'FEAT-100',
    status: 'todo',
    dependencies: ['FEAT-001']
  };

  const ticketStatusById = new Map([
    ['FEAT-100', 'todo'],
    ['FEAT-001', 'in_progress']
  ]);

  assert.equal(hasResolvedDependencies(ticket, ticketStatusById), false);
});

test('hasResolvedDependencies allows start when dependencies are review', () => {
  const ticket = {
    id: 'FEAT-100',
    status: 'todo',
    dependencies: ['FEAT-001', 'FEAT-002']
  };

  const ticketStatusById = new Map([
    ['FEAT-100', 'todo'],
    ['FEAT-001', 'review'],
    ['FEAT-002', 'review']
  ]);

  assert.equal(hasResolvedDependencies(ticket, ticketStatusById), true);
});

test('hasResolvedDependencies allows start when dependencies are done', () => {
  const ticket = {
    id: 'FEAT-100',
    status: 'todo',
    dependencies: ['FEAT-001', 'FEAT-002']
  };

  const ticketStatusById = new Map([
    ['FEAT-100', 'todo'],
    ['FEAT-001', 'done'],
    ['FEAT-002', 'done']
  ]);

  assert.equal(hasResolvedDependencies(ticket, ticketStatusById), true);
});

test('hasResolvedDependencies allows mixed review/done dependencies', () => {
  const ticket = {
    id: 'FEAT-100',
    status: 'todo',
    dependencies: ['FEAT-001', 'FEAT-002']
  };

  const ticketStatusById = new Map([
    ['FEAT-100', 'todo'],
    ['FEAT-001', 'review'],
    ['FEAT-002', 'done']
  ]);

  assert.equal(hasResolvedDependencies(ticket, ticketStatusById), true);
});

test('hasResolvedDependencies allows start when no dependencies', () => {
  const ticket = {
    id: 'FEAT-100',
    status: 'todo',
    dependencies: []
  };

  const ticketStatusById = new Map([
    ['FEAT-100', 'todo']
  ]);

  assert.equal(hasResolvedDependencies(ticket, ticketStatusById), true);
});

test('hasResolvedDependencies returns true with null/undefined dependencies', () => {
  const ticket1 = {
    id: 'FEAT-100',
    status: 'todo',
    dependencies: null
  };

  const ticket2 = {
    id: 'FEAT-101',
    status: 'todo'
    // no dependencies field
  };

  const ticketStatusById = new Map([
    ['FEAT-100', 'todo'],
    ['FEAT-101', 'todo']
  ]);

  assert.equal(hasResolvedDependencies(ticket1, ticketStatusById), true);
  assert.equal(hasResolvedDependencies(ticket2, ticketStatusById), true);
});

test('hasResolvedDependencies handles empty Map gracefully', () => {
  const ticket = {
    id: 'FEAT-100',
    status: 'todo',
    dependencies: ['FEAT-001']
  };

  const ticketStatusById = new Map();

  // When dependency is not found in map, it's treated as unresolved
  assert.equal(hasResolvedDependencies(ticket, ticketStatusById), false);
});

test('hasResolvedDependencies handles invalid Map/null argument', () => {
  const ticket = {
    id: 'FEAT-100',
    status: 'todo',
    dependencies: ['FEAT-001']
  };

  // Should treat null/invalid map as no dependencies present
  assert.equal(hasResolvedDependencies(ticket, null), true);
  assert.equal(hasResolvedDependencies(ticket, undefined), true);
  assert.equal(hasResolvedDependencies(ticket, {}), true);
});
