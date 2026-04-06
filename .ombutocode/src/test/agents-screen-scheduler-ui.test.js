const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('board list hides scheduler auto toggle while agents view is active', () => {
  const boardListPath = path.join(__dirname, '../src/renderer/components/BoardList.vue');
  const boardListContent = fs.readFileSync(boardListPath, 'utf-8');

  assert.ok(
    boardListContent.includes("const showAutoToggle = computed(() => props.activeView !== 'agents');"),
    'BoardList should compute auto-toggle visibility from active view'
  );
  assert.ok(
    boardListContent.includes('<div v-if="showAutoToggle" class="auto-toggle-wrap">'),
    'Expanded sidebar auto toggle should be hidden on Agents view'
  );
  assert.ok(
    boardListContent.includes('<div v-if="showAutoToggle" class="collapsed-auto-wrap">'),
    'Collapsed sidebar auto toggle should be hidden on Agents view'
  );
});
