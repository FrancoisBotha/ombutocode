const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('automation view renders evaluation queue section with data binding', () => {
  const automationViewPath = path.join(__dirname, '../src/renderer/components/AutomationView.vue');
  const automationViewContent = fs.readFileSync(automationViewPath, 'utf-8');

  // Check for evaluation queue section header
  assert.ok(
    automationViewContent.includes('Evaluation Queue'),
    'AutomationView should display Evaluation Queue section header'
  );

  // Check for IPC invocation for eval queue
  assert.ok(
    automationViewContent.includes("invoke('automation:eval-queue', { limit: 50 })"),
    'AutomationView should call automation:eval-queue endpoint'
  );

  // Check for reactive evalQueue data
  assert.ok(
    automationViewContent.includes('evalQueue'),
    'AutomationView should have evalQueue reactive data'
  );

  // Check for populated queue rendering (list display)
  assert.ok(
    automationViewContent.includes('v-if="evalQueue.tickets && evalQueue.tickets.length > 0"'),
    'AutomationView should conditionally render queue based on ticket count'
  );

  // Check for empty state handling
  assert.ok(
    automationViewContent.includes('evalQueueEmptyMessage'),
    'AutomationView should have computed empty state message'
  );

  // Check for ticket properties displayed
  assert.ok(
    automationViewContent.includes('ticket.id') && automationViewContent.includes('ticket.title'),
    'AutomationView should display ticket id and title'
  );

  // Check for ready/blocked status badges
  assert.ok(
    automationViewContent.includes('ticket.ready') && automationViewContent.includes('ready-badge'),
    'AutomationView should show ready status badge'
  );
  assert.ok(
    automationViewContent.includes('ticket.blockedByDependencies') && automationViewContent.includes('blocked-badge'),
    'AutomationView should show blocked status badge'
  );
});

test('automation view handles empty evaluation queue with explicit message', () => {
  const automationViewPath = path.join(__dirname, '../src/renderer/components/AutomationView.vue');
  const automationViewContent = fs.readFileSync(automationViewPath, 'utf-8');

  // Check for empty state message display
  assert.ok(
    automationViewContent.includes('v-else class="empty-state"'),
    'AutomationView should show empty-state class when queue is empty'
  );

  // Verify empty message references active count for context
  assert.ok(
    automationViewContent.includes('evalQueue.value.activeCount') || automationViewContent.includes('evalQueue.activeCount'),
    'Empty message should reference activeCount for context'
  );

  // Verify default empty message
  assert.ok(
    automationViewContent.includes('No evaluation tickets in queue'),
    'AutomationView should have default empty queue message'
  );
});

test('automation view shows eval queue summary counts', () => {
  const automationViewPath = path.join(__dirname, '../src/renderer/components/AutomationView.vue');
  const automationViewContent = fs.readFileSync(automationViewPath, 'utf-8');

  // Check for total tickets count display in header
  assert.ok(
    automationViewContent.includes('evalQueue.totalTickets'),
    'AutomationView should display totalTickets count in queue header'
  );

  // Check for ready status indicator
  assert.ok(
    automationViewContent.includes('ticket.estimatedPickupAt'),
    'AutomationView should display estimated pickup time for ready tickets'
  );
});
