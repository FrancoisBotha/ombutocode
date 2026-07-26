const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const view = fs.readFileSync(
  path.join(__dirname, '../src/renderer/components/BacklogTable.vue'),
  'utf-8'
);
const store = fs.readFileSync(
  path.join(__dirname, '../src/renderer/stores/backlogStore.js'),
  'utf-8'
);

test('every backlog mutation reloads through the loading flag', () => {
  // This is the precondition for the bug: promote/delete/add all call
  // loadBacklog(), which flips `loading`.
  assert.match(store, /async function loadBacklog\(\)[\s\S]*?_loading\.value = true/);
  assert.match(store, /async function updateTicketStatus[\s\S]*?await loadBacklog\(\)/);
  assert.match(store, /async function promoteToTodo[\s\S]*?await updateTicketStatus\(ticketId, 'todo'\)/);
});

test('a refresh does not unmount the table container', () => {
  // Gating the container on raw `loading` destroys the element Tabulator owns
  // every time a ticket is promoted, and the table never comes back.
  assert.ok(
    !/v-if="loading"/.test(view),
    'the table container must not be gated on the raw loading flag'
  );
  assert.ok(view.includes('v-if="showInitialLoading"'), 'only the first load shows the loading state');
  assert.ok(
    /showInitialLoading = computed\(\(\) => loading\.value && !tableReady\.value\)/.test(view),
    'showInitialLoading should be loading AND not-yet-built'
  );
  assert.ok(/tableReady\.value = true/.test(view), 'building the table should mark it ready');
});

test('a detached table instance is rebuilt rather than written into', () => {
  assert.ok(view.includes('function discardDetachedTable()'), 'detached instances are detected');
  assert.ok(
    /element && element\.isConnected/.test(view),
    'detection should test whether the element is still in the document'
  );
  // Both the initial build and the data watcher must go through the guard.
  const initAt = view.indexOf('function initTabulator()');
  assert.ok(
    view.slice(initAt, initAt + 200).includes('discardDetachedTable()'),
    'initTabulator should drop a stale instance before bailing out on it'
  );
  const watchAt = view.indexOf('watch(backlogTickets');
  const watchBody = view.slice(watchAt, watchAt + 800);
  assert.ok(watchBody.includes('discardDetachedTable()'), 'the data watcher should check for detachment');
  assert.ok(watchBody.includes('initTabulator()'), 'and rebuild when it finds one');
});
