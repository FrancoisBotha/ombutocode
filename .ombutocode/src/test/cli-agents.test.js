const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseAssigneeSpec,
  validateAssignee,
  resolveModelId,
  resolvePlanningAgent
} = require('../src/cli/agents');

const fakeYml = {
  version: 1,
  tools: [
    {
      id: 'claude', name: 'Claude', enabled: true,
      models: [
        { id: 'opus-4.7', model_id: 'claude-opus-4-7', enabled: true },
        { id: 'sonnet-4.6', model_id: 'claude-sonnet-4-6', enabled: true },
        { id: 'old', model_id: 'claude-old', enabled: false }
      ]
    },
    {
      id: 'codex', name: 'Codex', enabled: true,
      models: [{ id: 'gpt-5.4', model_id: 'gpt-5.4', enabled: true }]
    },
    { id: 'kimi', name: 'Kimi', enabled: false, models: [{ id: 'k2', model_id: 'kimi-k2', enabled: true }] }
  ]
};

test('parseAssigneeSpec splits tool and model', () => {
  assert.deepEqual(parseAssigneeSpec('claude:opus-4.7'), { tool: 'claude', model: 'opus-4.7' });
  assert.deepEqual(parseAssigneeSpec('Codex'), { tool: 'codex', model: null });
  assert.deepEqual(parseAssigneeSpec('claude:'), { tool: 'claude', model: null });
  assert.equal(parseAssigneeSpec(''), null);
});

test('validateAssignee accepts tool[:model] that exists in the yml and builds the ticket object', () => {
  const withModel = validateAssignee(fakeYml, parseAssigneeSpec('claude:opus-4.7'));
  assert.equal(withModel.ok, true);
  assert.deepEqual(withModel.assignee, { tool: 'claude', model: 'opus-4.7' });

  const toolOnly = validateAssignee(fakeYml, parseAssigneeSpec('codex'));
  assert.equal(toolOnly.ok, true);
  assert.deepEqual(toolOnly.assignee, { tool: 'codex' });
});

test('validateAssignee rejects unknown tools, unknown/disabled models and disabled tools, listing valid ids', () => {
  const badTool = validateAssignee(fakeYml, parseAssigneeSpec('gemini'));
  assert.equal(badTool.ok, false);
  assert.match(badTool.error, /Valid tools: claude, codex, kimi/);

  const badModel = validateAssignee(fakeYml, parseAssigneeSpec('claude:opus-9'));
  assert.equal(badModel.ok, false);
  assert.match(badModel.error, /Valid model ids: opus-4\.7, sonnet-4\.6/);
  assert.deepEqual(badModel.validModels, ['opus-4.7', 'sonnet-4.6']);

  const disabledModel = validateAssignee(fakeYml, parseAssigneeSpec('claude:old'));
  assert.equal(disabledModel.ok, false);
  assert.match(disabledModel.error, /disabled/);

  const disabledTool = validateAssignee(fakeYml, parseAssigneeSpec('kimi:k2'));
  assert.equal(disabledTool.ok, false);
  assert.match(disabledTool.error, /disabled/);
});

test('resolveModelId maps the yml id to the CLI model_id like main.js', () => {
  assert.equal(resolveModelId(fakeYml, 'claude', 'sonnet-4.6'), 'claude-sonnet-4-6');
  // unknown preferred id falls back to the first enabled model
  assert.equal(resolveModelId(fakeYml, 'claude', 'nope'), 'claude-opus-4-7');
  assert.equal(resolveModelId(fakeYml, 'claude', null), 'claude-opus-4-7');
  assert.equal(resolveModelId(fakeYml, 'kimi', 'k2'), '');
});

test('resolvePlanningAgent prefers flags, then eval defaults from settings, then codex', () => {
  const store = (data) => ({ get: (k, d) => (k in data ? data[k] : d) });

  const explicit = resolvePlanningAgent({ config: fakeYml, settingsStore: store({ eval_default_agent: 'codex' }), agent: 'claude', model: 'sonnet-4.6' });
  assert.deepEqual(explicit, { ok: true, agent: 'claude', model: 'sonnet-4.6', modelId: 'claude-sonnet-4-6' });

  const fromSettings = resolvePlanningAgent({ config: fakeYml, settingsStore: store({ eval_default_agent: 'claude', eval_default_model: 'opus-4.7' }) });
  assert.deepEqual(fromSettings, { ok: true, agent: 'claude', model: 'opus-4.7', modelId: 'claude-opus-4-7' });

  // An explicit --agent ignores the settings' default model (it belongs to another tool).
  const agentOnly = resolvePlanningAgent({ config: fakeYml, settingsStore: store({ eval_default_agent: 'claude', eval_default_model: 'opus-4.7' }), agent: 'codex' });
  assert.deepEqual(agentOnly, { ok: true, agent: 'codex', model: null, modelId: 'gpt-5.4' });

  const fallback = resolvePlanningAgent({ config: fakeYml, settingsStore: store({}) });
  assert.equal(fallback.agent, 'codex');

  const invalid = resolvePlanningAgent({ config: fakeYml, settingsStore: store({}), agent: 'claude', model: 'nope' });
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /Valid model ids/);
});
