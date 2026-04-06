const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('eval column only shows Evaluating when an eval run is actively running', () => {
  const kanbanColumnPath = path.join(__dirname, '../src/renderer/components/KanbanColumn.vue');
  const content = fs.readFileSync(kanbanColumnPath, 'utf-8');

  assert.ok(
    content.includes("const isEvalRunInProgress = (task) => task?.status === 'eval' && task?.agent?.state === 'running';"),
    'KanbanColumn should derive evaluating state from active eval runs'
  );
  assert.ok(
    content.includes("if (props.columnId === 'eval' && isEvalRunInProgress(task))"),
    'KanbanColumn should gate Evaluating label to eval tickets with active run'
  );
  assert.ok(
    !content.includes("columnId === 'eval' && task.agent.state === 'completed' ? 'Evaluating' : task.agent.state"),
    'KanbanColumn should not treat completed state as Evaluating'
  );
});
