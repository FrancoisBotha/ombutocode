const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const settingsView = fs.readFileSync(
  path.join(__dirname, '../src/renderer/components/SettingsView.vue'),
  'utf-8'
);

test('settings has a Models tab after Coding Agents', () => {
  assert.ok(
    settingsView.includes("settingsTab === 'models'"),
    'SettingsView should have a models tab panel'
  );
  assert.ok(
    settingsView.indexOf("settingsTab = 'agents'") < settingsView.indexOf("settingsTab = 'models'"),
    'the Models tab button should come after Coding Agents'
  );
});

test('models tab maintains models through the agent tools store', () => {
  for (const fn of ['addModel', 'saveModelField', 'toggleModel', 'removeModel']) {
    assert.ok(settingsView.includes(`${fn}(`), `Models tab should expose ${fn}`);
  }
  for (const action of ['agentToolsStore.addModel', 'agentToolsStore.updateModel', 'agentToolsStore.deleteModel', 'agentToolsStore.toggleModelEnabled']) {
    assert.ok(settingsView.includes(action), `Models tab should call ${action}`);
  }
  // Every store mutation persists the whole tool list back to the YAML file.
  assert.ok(
    settingsView.includes('codingagents.yml'),
    'Models tab should tell the user where the list is stored'
  );
});

test('models tab warns that model selection is Claude-only today', () => {
  assert.ok(
    /Codex and Kimi/.test(settingsView),
    'Models tab should name the agents without model selection'
  );
  assert.ok(
    settingsView.includes("MODEL_SELECTION_AGENTS = ['claude']"),
    'only Claude should be flagged as supporting model selection'
  );
  assert.ok(
    settingsView.includes('agentSupportsModelSelection'),
    'per-agent rows should flag unsupported model selection'
  );
});

test('only the claude command templates pass a model identifier', () => {
  const templates = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../codingagent-templates.json'), 'utf-8')
  );
  for (const [name, tpl] of Object.entries(templates)) {
    const passesModel = JSON.stringify(tpl.args || []).includes('{{modelId}}');
    if (name.startsWith('claude')) {
      assert.ok(passesModel, `${name} should pass --model {{modelId}}`);
    } else {
      // Documents today's behaviour — the Models tab warning depends on it.
      assert.ok(!passesModel, `${name} does not pass a model; update the Models tab note if it now does`);
    }
  }
});
