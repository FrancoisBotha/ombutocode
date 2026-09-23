const STAGE_PREFIXES = ['implementation', 'testing', 'eval', 'merging'];
const STAGE_DEFAULTS = Object.fromEntries(STAGE_PREFIXES.flatMap(stage => [
  [`${stage}_default_agent`, null], [`${stage}_default_model`, null]
]));

function readStageAssignee(store, status) {
  const stage = { todo: 'implementation', building: 'implementation', in_progress: 'implementation', test: 'testing', eval: 'eval', merging: 'merging' }[status];
  if (!stage) return null;
  const agent = store.get(`${stage}_default_agent`, null);
  const model = store.get(`${stage}_default_model`, null);
  return agent ? (model ? { tool: agent, model } : agent) : null;
}

module.exports = { STAGE_DEFAULTS, readStageAssignee };
