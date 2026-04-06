const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('automation view is wired into app navigation and sidebar', () => {
  const appPath = path.join(__dirname, '../src/renderer/App.vue');
  const boardListPath = path.join(__dirname, '../src/renderer/components/BoardList.vue');
  const automationViewPath = path.join(__dirname, '../src/renderer/components/AutomationView.vue');

  const appContent = fs.readFileSync(appPath, 'utf-8');
  const boardListContent = fs.readFileSync(boardListPath, 'utf-8');
  const automationViewContent = fs.readFileSync(automationViewPath, 'utf-8');

  assert.ok(
    appContent.includes("import AutomationView from '@/components/AutomationView.vue';"),
    'App should import AutomationView'
  );
  assert.ok(
    appContent.includes("<AutomationView v-else-if=\"activeView === 'automation'\" />"),
    'App should render AutomationView for the automation route/view'
  );

  assert.ok(
    boardListContent.includes("@click=\"$emit('change-view', 'automation')\""),
    'BoardList should emit change-view for automation'
  );
  assert.ok(
    boardListContent.includes('<span class="board-name">Automation</span>'),
    'BoardList should show an Automation menu label'
  );

  assert.ok(
    automationViewContent.includes("invoke('automation:agent-status')"),
    'AutomationView should query agent status'
  );
  assert.ok(
    automationViewContent.includes("invoke('automation:active-runs', { includeQueued: true })"),
    'AutomationView should query active runs'
  );
  assert.ok(
    automationViewContent.includes('Branch: {{ formatBranch(run.branch) }}'),
    'AutomationView active executions should show branch names'
  );
  assert.ok(
    automationViewContent.includes("invoke('automation:eval-queue', { limit: 50 })"),
    'AutomationView should query eval queue'
  );
  assert.ok(
    automationViewContent.includes("invoke('automation:unpause-agent', { toolId })"),
    'AutomationView should invoke automation unpause channel'
  );
  assert.ok(
    automationViewContent.includes('Unpause'),
    'AutomationView should render an unpause control for paused agents'
  );
  assert.ok(
    !automationViewContent.includes("invoke('scheduler:status')"),
    'AutomationView should not query scheduler status'
  );
});
