const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf-8');

test('bootstrap prototype view is wired into app navigation and sidebar', () => {
  const appContent = read('../src/renderer/App.vue');
  const boardListContent = read('../src/renderer/components/BoardList.vue');

  assert.ok(
    appContent.includes("import PlanBootstrapPrototypeView from '@/components/PlanBootstrapPrototypeView.vue';"),
    'App should import PlanBootstrapPrototypeView'
  );
  assert.ok(
    appContent.includes("activeView === 'plan-bootstrap-prototype'"),
    'App should render the view for the plan-bootstrap-prototype route'
  );
  assert.ok(
    boardListContent.includes("{ view: 'plan-bootstrap-prototype', label: 'Bootstrap Prototype' }"),
    'BoardList Core group should list Bootstrap Prototype'
  );
  // It is the step after Initiate Stack — order matters in the Plan menu.
  assert.ok(
    boardListContent.indexOf("{ view: 'plan-initiate-stack', label: 'Initiate Stack' }")
      < boardListContent.indexOf("{ view: 'plan-bootstrap-prototype', label: 'Bootstrap Prototype' }"),
    'Bootstrap Prototype should sit after Initiate Stack'
  );
});

test('bootstrap prototype view collects architecture and prototype folder', () => {
  const viewContent = read('../src/renderer/components/PlanBootstrapPrototypeView.vue');

  assert.ok(
    viewContent.includes("invoke('filetree:scan')"),
    'view should scan the doc tree to populate the architecture dropdown'
  );
  assert.ok(
    viewContent.includes("invoke('dialog:selectDirectory'"),
    'view should offer a filesystem folder picker for the prototype'
  );
  assert.ok(
    viewContent.includes(':disabled="!defaultAgent || !selectedArch || !prototypePath"'),
    'launch should require an agent, an architecture document, and a prototype folder'
  );
  assert.ok(
    /TRUE TO THE PROTOTYPE AS POSSIBLE/.test(viewContent),
    'prompt should carry the fidelity instruction'
  );
  assert.ok(
    /BUILD AND RUN the application/.test(viewContent),
    'prompt should require the agent to build and run the app for verification'
  );
  assert.ok(
    /INTERACTIVE session/.test(viewContent),
    'prompt should declare the session interactive'
  );
  assert.ok(
    viewContent.includes("invoke('agent:spawnInteractive'"),
    'view should spawn an interactive agent session'
  );
});

test('bootstrap prototype folder picker channel is exposed to the renderer', () => {
  const preloadContent = read('../preload.js');
  const mainContent = read('../main.js');

  assert.ok(
    preloadContent.includes("'dialog:selectDirectory'"),
    'preload whitelist should include the directory picker channel'
  );
  assert.ok(
    mainContent.includes("ipcMain.handle('dialog:selectDirectory'"),
    'main should handle the directory picker channel'
  );
  assert.ok(
    mainContent.includes("properties: ['openDirectory']"),
    'directory picker should open in directory mode'
  );
});

test('bootstrap prototype skill template ships with the bootstrapping skills', () => {
  const skill = read('../../templates/skills/Bootstrapping/Bootstrap Prototype.md');

  assert.ok(/^---\r?\nsystem: true\r?\n---/.test(skill), 'skill should be marked system');
  assert.ok(/# Bootstrap Prototype/.test(skill), 'skill should be titled Bootstrap Prototype');
  assert.ok(
    /Never modify anything inside the prototype folder/.test(skill),
    'skill should mark the prototype folder read-only'
  );
  assert.ok(
    /docs\/Architecture\/prototype-port\.md/.test(skill),
    'skill should require a port record'
  );
});
