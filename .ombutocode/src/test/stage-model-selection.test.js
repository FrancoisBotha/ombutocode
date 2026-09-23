const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readStageAssignee } = require('../src/main/stageSettings');
const { resolveAgentTemplateConfig, renderCommand } = require('../src/main/codingAgentRuntime');
const { createScheduler } = require('../src/main/scheduler');

const projectRoot = path.resolve(__dirname, '../../..');
const values = {
  implementation_default_agent: 'codex', implementation_default_model: 'code',
  testing_default_agent: 'claude', testing_default_model: 'test',
  eval_default_agent: 'codex', eval_default_model: 'eval',
  merging_default_agent: 'claude', merging_default_model: 'merge',
};
const store = { get: (key, fallback) => values[key] ?? fallback };

test('stage preferences retain independent agents and models', () => {
  for (const [status, tool, model] of [['todo', 'codex', 'code'], ['building', 'codex', 'code'], ['test', 'claude', 'test'], ['eval', 'codex', 'eval'], ['merging', 'claude', 'merge']]) {
    assert.deepEqual(readStageAssignee(store, status), { tool, model });
  }
  assert.equal(readStageAssignee({ get: (_, fallback) => fallback }, 'eval'), null);
});

for (const agent of ['claude', 'codex']) {
  for (const variant of [null, 'test', 'eval', 'merge_resolve']) {
    test(`${agent} ${variant || 'implementation'} sends the selected model exactly once`, () => {
      const template = resolveAgentTemplateConfig(projectRoot, agent, { templateVariant: variant });
      const command = renderCommand(template, { repoRoot: projectRoot, modelId: 'chosen-model' }, 'run');
      assert.equal(command.args.filter(arg => arg === '--model').length, 1);
      assert.equal(command.args[command.args.indexOf('--model') + 1], 'chosen-model');
      const unset = renderCommand(template, { repoRoot: projectRoot }, 'run');
      assert.ok(!unset.args.includes('--model'));
    });
  }
}

for (const [status, agent, model, variant] of [
  ['todo', 'codex', 'code', undefined], ['test', 'claude', 'test', 'test'],
  ['eval', 'codex', 'eval', 'eval'], ['merging', 'claude', 'merge', 'merge_resolve'],
]) {
  for (const enabled of [true, false]) {
    test(`scheduler ${status} honors stage model (enabled=${enabled})`, () => {
      const started = [];
      const scheduler = createScheduler({
        projectRoot,
        readBacklogData: () => ({ tickets: [{ id: 'STAGE-1', title: 'Stage', status, assignee: { tool: 'claude', model: 'other' } }] }),
        readAgentsConfig: () => ({ tools: ['claude', 'codex'].map(id => ({
          id, name: id, enabled: true, max_concurrent: 2,
          models: [{ id: model, model_id: 'api-' + model, enabled, rate_per_hour: 100 }, { id: 'other', model_id: 'wrong-model', enabled: true, rate_per_hour: 100 }],
        })) }),
        readStageAssignee: status => readStageAssignee(store, status),
        createTicketWorktree: () => ({ worktreePath: projectRoot }),
        createEvalTrialMerge: () => ({ worktreePath: projectRoot, branch: 'test-trial' }),
        cleanupEvalTrial: () => {},
        evalPostMergeCooldownMs: 0,
        agentRuntime: {
          activeRunByTicket: new Map(), runsById: new Map(),
          listRuns: () => [], getRunStatus: () => null,
          startAgent: (agent, payload, options) => { started.push({ agent, payload, options }); return { runId: 'test-run' }; },
        },
      });
      try { scheduler.start(); } finally { scheduler.stop(); }
      assert.equal(started.length, enabled ? 1 : 0);
      if (enabled) {
        assert.equal(started[0].agent, agent);
        assert.equal(started[0].payload.modelId, 'api-' + model);
        assert.equal(started[0].options.templateVariant || undefined, variant);
      }
    });
  }
}
