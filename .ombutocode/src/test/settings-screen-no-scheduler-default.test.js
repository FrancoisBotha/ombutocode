const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('settings screen no longer renders scheduler default controls', () => {
  const settingsViewPath = path.join(__dirname, '../src/renderer/components/SettingsView.vue');
  const content = fs.readFileSync(settingsViewPath, 'utf-8');

  assert.equal(content.includes('<h2>Scheduler</h2>'), false);
  assert.equal(content.includes('Default Startup State'), false);
  assert.equal(content.includes('updateSchedulerDefault'), false);
});

test('settings store no longer exposes scheduler default setting', () => {
  const settingsStorePath = path.join(__dirname, '../src/renderer/stores/settingsStore.js');
  const content = fs.readFileSync(settingsStorePath, 'utf-8');

  assert.equal(content.includes('scheduler_default_running'), false);
  assert.equal(content.includes('setSchedulerDefaultRunning'), false);
});

test('main settings handlers ignore legacy scheduler default setting', () => {
  const mainPath = path.join(__dirname, '../main.js');
  const content = fs.readFileSync(mainPath, 'utf-8');

  assert.equal(content.includes("settingsStore.delete('scheduler_default_running');"), true);
  assert.equal(content.includes('scheduler_default_running: settingsStore.get'), false);
  assert.equal(content.includes("if ('scheduler_default_running' in payload)"), false);
});
