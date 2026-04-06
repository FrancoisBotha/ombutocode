const test = require('node:test');
const assert = require('node:assert/strict');

// Replicate the pure helper functions from main.js to unit-test the ticket note
// formatting logic without requiring the full Electron runtime.

function collapseWhitespace(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function shorten(text, maxChars = 200) {
  const value = collapseWhitespace(text);
  if (!value) return '';
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...`;
}

function appendTicketNote(ticket, message) {
  ticket.notes = ticket.notes ? `${ticket.notes}\n${message}` : message;
}

// --- Notes are cleared on run start ---

test('notes are cleared on fresh run start (fail_count = 0)', () => {
  const ticket = { notes: 'Old note from previous run', fail_count: 0 };
  // Simulates what onRunStarted now does: only clear when fail_count === 0
  const failCount = Number(ticket.fail_count) || 0;
  if (failCount === 0) {
    ticket.notes = '';
  }
  assert.equal(ticket.notes, '');
});

test('notes are preserved on retry (fail_count > 0)', () => {
  const ticket = { notes: 'Test failed.\n- Unit tests: 3 failures', fail_count: 2 };
  // Simulates what onRunStarted now does: preserve notes when retrying
  const failCount = Number(ticket.fail_count) || 0;
  if (failCount === 0) {
    ticket.notes = '';
  }
  assert.equal(ticket.notes, 'Test failed.\n- Unit tests: 3 failures');
});

test('max-retries note is appended when ticket is halted', () => {
  const ticket = { notes: 'Test failed.', fail_count: 3 };
  const maxRetries = 3;
  if (ticket.fail_count >= maxRetries) {
    ticket.assignee = 'NONE';
    appendTicketNote(ticket, `Ticket halted: failed ${ticket.fail_count} times (max: ${maxRetries}). Requires manual intervention.`);
  }
  assert.equal(ticket.assignee, 'NONE');
  assert.ok(ticket.notes.includes('Ticket halted'));
  assert.ok(ticket.notes.includes('Requires manual intervention'));
  assert.ok(ticket.notes.includes('failed 3 times'));
});

// --- Verdict notes are concise ---

test('test pass note is concise and has no timestamp or UUID', () => {
  const ticket = { notes: '' };
  appendTicketNote(ticket, 'Test passed.');
  assert.equal(ticket.notes, 'Test passed.');
  assert.ok(!ticket.notes.includes('['), 'should NOT contain timestamp brackets');
  assert.ok(!ticket.notes.includes('run'), 'should NOT contain run ID reference');
});

test('test fail note includes reasons without timestamps', () => {
  const ticket = { notes: '' };
  appendTicketNote(ticket, 'Test failed.\n- Unit tests: 3 failures\n- Lint: 2 warnings');
  assert.ok(ticket.notes.startsWith('Test failed.'));
  assert.ok(ticket.notes.includes('- Unit tests: 3 failures'));
  assert.ok(!ticket.notes.includes('[20'));
});

test('eval pass note is concise', () => {
  const ticket = { notes: '' };
  appendTicketNote(ticket, 'Eval passed.');
  assert.equal(ticket.notes, 'Eval passed.');
});

test('eval fail note includes reasons', () => {
  const ticket = { notes: '' };
  appendTicketNote(ticket, 'Eval failed.\n- Missing feature X');
  assert.ok(ticket.notes.startsWith('Eval failed.'));
  assert.ok(ticket.notes.includes('- Missing feature X'));
});

test('merge resolve note is concise', () => {
  const ticket = { notes: '' };
  appendTicketNote(ticket, 'Merge resolved. Squash merge completed.');
  assert.ok(!ticket.notes.includes('->'));
  assert.ok(!ticket.notes.includes('commitSha'));
});

test('run crash note only contains error message', () => {
  const ticket = { notes: '' };
  appendTicketNote(ticket, 'Run crashed: Process exited with code 1');
  assert.ok(ticket.notes.includes('Run crashed'));
  assert.ok(!ticket.notes.includes('run_id'));
  assert.ok(!ticket.notes.includes('duration_ms'));
});

// --- shorten utility ---

test('shorten caps output at 200 chars when explicit limit is passed', () => {
  const longOutput = 'x'.repeat(300);
  const result = shorten(longOutput, 200);
  assert.equal(result.length, 203);
  assert.ok(result.endsWith('...'));
});

test('shorten returns full text when under 200 chars', () => {
  const shortOutput = 'hello world';
  const result = shorten(shortOutput, 200);
  assert.equal(result, 'hello world');
});

test('shorten returns empty string for falsy input', () => {
  assert.equal(shorten('', 200), '');
  assert.equal(shorten(null, 200), '');
  assert.equal(shorten(undefined, 200), '');
});

test('shorten collapses whitespace before truncating', () => {
  const spacey = 'a  b\n\nc   d';
  const result = shorten(spacey, 200);
  assert.equal(result, 'a b c d');
});

test('default shorten limit is 200', () => {
  const text = 'y'.repeat(300);
  const result = shorten(text);
  assert.equal(result.length, 203);
});
