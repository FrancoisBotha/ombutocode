const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('kanban detail modal uses structured eval_summary and removes legacy note parsing', () => {
  const kanbanColumnPath = path.join(__dirname, '../src/renderer/components/KanbanColumn.vue');
  const content = fs.readFileSync(kanbanColumnPath, 'utf-8');

  assert.ok(
    content.includes('Evaluation Summary:'),
    'Kanban detail modal should render an Evaluation Summary section'
  );
  assert.ok(
    content.includes('const getEvalSummary = (task) => {'),
    'Kanban should define eval_summary helper accessors'
  );
  assert.ok(
    content.includes("const isEvalFailure = (task) => getEvalVerdict(task) === 'FAIL';"),
    'Kanban todo badge should be driven by eval_summary verdict'
  );
  assert.ok(
    !content.includes('hasEvalFailureContext'),
    'Kanban should remove legacy notes-based eval failure context matching'
  );
  assert.ok(
    !content.includes('extractEvalFailureReason'),
    'Kanban should remove legacy notes-based eval failure reason extraction'
  );
});
