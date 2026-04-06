const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * Test helper to simulate the scheduler:deleteQueueTicket handler logic
 */
function createDeleteQueueTicketHandler(backlogData, writeBacklogFn) {
  return async function deleteQueueTicket(payload = {}) {
    const ticketId = payload?.ticketId;
    if (!ticketId || typeof ticketId !== 'string') {
      return { success: false, error: { code: 'INVALID_TICKET_ID', message: 'Ticket ID is required' } };
    }

    const data = backlogData;
    if (!Array.isArray(data.tickets)) {
      return { success: false, error: { code: 'INVALID_BACKLOG', message: 'Invalid backlog data' } };
    }

    const ticketIndex = data.tickets.findIndex((ticket) => ticket.id === ticketId);
    if (ticketIndex === -1) {
      return { success: false, error: { code: 'TICKET_NOT_FOUND', message: `Ticket ${ticketId} not found` } };
    }

    const ticket = data.tickets[ticketIndex];
    // Only allow deleting tickets that are in 'todo' status (scheduler queue)
    if (ticket.status !== 'todo') {
      return { success: false, error: { code: 'INVALID_STATUS', message: `Cannot delete ticket with status '${ticket.status}'. Only todo tickets can be deleted from queue.` } };
    }

    data.tickets.splice(ticketIndex, 1);
    if (writeBacklogFn) {
      writeBacklogFn(data);
    }
    return { success: true, ticketId };
  };
}

test('deleteQueueTicket removes todo ticket from backlog', async () => {
  const backlogData = {
    version: 1,
    updated_at: '2026-02-16',
    tickets: [
      { id: 'TEST-001', status: 'todo', title: 'Todo Ticket 1' },
      { id: 'TEST-002', status: 'todo', title: 'Todo Ticket 2' },
      { id: 'TEST-003', status: 'in_progress', title: 'In Progress Ticket' }
    ]
  };

  const handler = createDeleteQueueTicketHandler(backlogData);
  const result = await handler({ ticketId: 'TEST-001' });

  assert.equal(result.success, true);
  assert.equal(result.ticketId, 'TEST-001');
  assert.equal(backlogData.tickets.length, 2);
  assert.equal(backlogData.tickets.some(t => t.id === 'TEST-001'), false);
});

test('deleteQueueTicket returns not-found for non-existent ticket', async () => {
  const backlogData = {
    version: 1,
    updated_at: '2026-02-16',
    tickets: [
      { id: 'TEST-001', status: 'todo', title: 'Todo Ticket 1' }
    ]
  };

  const handler = createDeleteQueueTicketHandler(backlogData);
  const result = await handler({ ticketId: 'NONEXISTENT-999' });

  assert.equal(result.success, false);
  assert.equal(result.error.code, 'TICKET_NOT_FOUND');
  assert.match(result.error.message, /NONEXISTENT-999/);
  assert.equal(backlogData.tickets.length, 1);
});

test('deleteQueueTicket rejects deletion of non-todo tickets', async () => {
  const backlogData = {
    version: 1,
    updated_at: '2026-02-16',
    tickets: [
      { id: 'TEST-001', status: 'in_progress', title: 'In Progress Ticket' },
      { id: 'TEST-002', status: 'review', title: 'Review Ticket' },
      { id: 'TEST-003', status: 'done', title: 'Done Ticket' }
    ]
  };

  const handler = createDeleteQueueTicketHandler(backlogData);

  const inProgressResult = await handler({ ticketId: 'TEST-001' });
  assert.equal(inProgressResult.success, false);
  assert.equal(inProgressResult.error.code, 'INVALID_STATUS');

  const reviewResult = await handler({ ticketId: 'TEST-002' });
  assert.equal(reviewResult.success, false);
  assert.equal(reviewResult.error.code, 'INVALID_STATUS');

  const doneResult = await handler({ ticketId: 'TEST-003' });
  assert.equal(doneResult.success, false);
  assert.equal(doneResult.error.code, 'INVALID_STATUS');

  assert.equal(backlogData.tickets.length, 3);
});

test('deleteQueueTicket validates ticketId parameter', async () => {
  const backlogData = {
    version: 1,
    updated_at: '2026-02-16',
    tickets: [{ id: 'TEST-001', status: 'todo', title: 'Todo Ticket' }]
  };

  const handler = createDeleteQueueTicketHandler(backlogData);

  const nullResult = await handler({ ticketId: null });
  assert.equal(nullResult.success, false);
  assert.equal(nullResult.error.code, 'INVALID_TICKET_ID');

  const undefinedResult = await handler({ ticketId: undefined });
  assert.equal(undefinedResult.success, false);
  assert.equal(undefinedResult.error.code, 'INVALID_TICKET_ID');

  const emptyResult = await handler({ ticketId: '' });
  assert.equal(emptyResult.success, false);
  assert.equal(emptyResult.error.code, 'INVALID_TICKET_ID');

  const numberResult = await handler({ ticketId: 123 });
  assert.equal(numberResult.success, false);
  assert.equal(numberResult.error.code, 'INVALID_TICKET_ID');

  const missingPayloadResult = await handler();
  assert.equal(missingPayloadResult.success, false);
  assert.equal(missingPayloadResult.error.code, 'INVALID_TICKET_ID');
});

test('deleteQueueTicket handles invalid backlog data', async () => {
  const backlogData = {
    version: 1,
    updated_at: '2026-02-16'
    // Missing tickets array
  };

  const handler = createDeleteQueueTicketHandler(backlogData);
  const result = await handler({ ticketId: 'TEST-001' });

  assert.equal(result.success, false);
  assert.equal(result.error.code, 'INVALID_BACKLOG');
});

test('deleteQueueTicket calls writeBacklog after successful deletion', async () => {
  const backlogData = {
    version: 1,
    updated_at: '2026-02-16',
    tickets: [{ id: 'TEST-001', status: 'todo', title: 'Todo Ticket' }]
  };

  let writeCalled = false;
  let writtenData = null;

  const writeBacklogFn = (data) => {
    writeCalled = true;
    writtenData = data;
  };

  const handler = createDeleteQueueTicketHandler(backlogData, writeBacklogFn);
  const result = await handler({ ticketId: 'TEST-001' });

  assert.equal(result.success, true);
  assert.equal(writeCalled, true);
  assert.equal(writtenData.tickets.length, 0);
});

test('queue delete action is exposed in agent store', () => {
  const agentStorePath = path.join(__dirname, '../src/renderer/stores/agentStore.js');
  const agentStoreContent = fs.readFileSync(agentStorePath, 'utf-8');

  assert.ok(
    agentStoreContent.includes("invoke('scheduler:deleteQueueTicket'"),
    'agentStore should invoke scheduler:deleteQueueTicket'
  );
  assert.ok(
    agentStoreContent.includes('deleteQueueTicket'),
    'agentStore should export deleteQueueTicket'
  );
});
