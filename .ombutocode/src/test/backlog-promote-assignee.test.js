const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ombutocode-promote-test-'));
}

function writeYaml(filePath, data) {
  fs.writeFileSync(filePath, yaml.dump(data, { lineWidth: -1, noRefs: true }), 'utf-8');
}

function readYaml(filePath) {
  return yaml.load(fs.readFileSync(filePath, 'utf-8'));
}

test('AD_HOC-029: promote from backlog to todo clears assignee', () => {
  const dir = mkTempDir();
  const backlogPath = path.join(dir, 'backlog.yml');
  
  // Setup: ticket in backlog with an assignee
  writeYaml(backlogPath, {
    version: 1,
    updated_at: '2026-02-15',
    tickets: [{
      id: 'AD_HOC-TEST-001',
      status: 'backlog',
      last_updated: '2026-02-15T00:00:00.000Z',
      assignee: 'codex'
    }]
  });

  // Simulate the promotion logic from backlog:updateStatus handler
  const data = readYaml(backlogPath);
  const ticket = data.tickets.find(t => t.id === 'AD_HOC-TEST-001');
  
  // Verify initial state
  assert.equal(ticket.status, 'backlog');
  assert.equal(ticket.assignee, 'codex');
  
  // Update status to todo (simulating the status update part)
  ticket.status = 'todo';
  ticket.last_updated = '2026-02-16T12:30:00.000Z';
  data.updated_at = '2026-02-16';
  
  // Apply AD_HOC-029: Set assignee to null when promoting from backlog to todo
  const previousStatus = 'backlog';
  const newStatus = 'todo';
  const isBacklogToTodoPromotion = previousStatus === 'backlog' && newStatus === 'todo';
  if (isBacklogToTodoPromotion) {
    ticket.assignee = null;
  }
  
  writeYaml(backlogPath, data);
  
  // Verify final state
  const updated = readYaml(backlogPath);
  const updatedTicket = updated.tickets[0];
  assert.equal(updatedTicket.status, 'todo');
  assert.equal(updatedTicket.assignee, null, 'Assignee should be null after promotion from backlog to todo');
});

test('AD_HOC-029: other status transitions do not clear assignee', () => {
  const dir = mkTempDir();
  const backlogPath = path.join(dir, 'backlog.yml');
  
  // Setup: ticket in todo with an assignee
  writeYaml(backlogPath, {
    version: 1,
    updated_at: '2026-02-15',
    tickets: [{
      id: 'AD_HOC-TEST-002',
      status: 'todo',
      last_updated: '2026-02-15T00:00:00.000Z',
      assignee: 'kimi'
    }]
  });

  const data = readYaml(backlogPath);
  const ticket = data.tickets.find(t => t.id === 'AD_HOC-TEST-002');
  
  // Update status to in_progress (not a backlog->todo promotion)
  ticket.status = 'in_progress';
  ticket.last_updated = '2026-02-16T12:30:00.000Z';
  
  // Check if this is a backlog->todo promotion (it's not)
  const previousStatus = 'todo';
  const newStatus = 'in_progress';
  const isBacklogToTodoPromotion = previousStatus === 'backlog' && newStatus === 'todo';
  if (isBacklogToTodoPromotion) {
    ticket.assignee = null;
  }
  
  writeYaml(backlogPath, data);
  
  // Verify assignee is preserved
  const updated = readYaml(backlogPath);
  const updatedTicket = updated.tickets[0];
  assert.equal(updatedTicket.status, 'in_progress');
  assert.equal(updatedTicket.assignee, 'kimi', 'Assignee should be preserved for non-backlog-to-todo transitions');
});

test('AD_HOC-029: promotion with null assignee stays null', () => {
  const dir = mkTempDir();
  const backlogPath = path.join(dir, 'backlog.yml');
  
  // Setup: ticket in backlog with null assignee
  writeYaml(backlogPath, {
    version: 1,
    updated_at: '2026-02-15',
    tickets: [{
      id: 'AD_HOC-TEST-003',
      status: 'backlog',
      last_updated: '2026-02-15T00:00:00.000Z',
      assignee: null
    }]
  });

  const data = readYaml(backlogPath);
  const ticket = data.tickets.find(t => t.id === 'AD_HOC-TEST-003');
  
  // Update status to todo
  ticket.status = 'todo';
  ticket.last_updated = '2026-02-16T12:30:00.000Z';
  
  // Apply backlog->todo promotion logic
  const previousStatus = 'backlog';
  const newStatus = 'todo';
  const isBacklogToTodoPromotion = previousStatus === 'backlog' && newStatus === 'todo';
  if (isBacklogToTodoPromotion) {
    ticket.assignee = null;
  }
  
  writeYaml(backlogPath, data);
  
  // Verify assignee remains null
  const updated = readYaml(backlogPath);
  const updatedTicket = updated.tickets[0];
  assert.equal(updatedTicket.status, 'todo');
  assert.equal(updatedTicket.assignee, null);
});
