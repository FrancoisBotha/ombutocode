'use strict';

/**
 * codingagents.yml helpers for the CLI: model id resolution and assignee
 * validation.
 *
 * `resolveModelId` mirrors the function of the same name in main.js (which
 * cannot be required from Node without Electron). Keep the two in step until
 * main.js is refactored to import this one.
 */

/**
 * Split `tool[:model]` into its parts. Returns null for an empty value.
 */
function parseAssigneeSpec(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const idx = raw.indexOf(':');
  if (idx < 0) return { tool: raw.toLowerCase(), model: null };
  const tool = raw.slice(0, idx).trim().toLowerCase();
  const model = raw.slice(idx + 1).trim();
  return { tool, model: model || null };
}

function findTool(config, toolId) {
  const wanted = String(toolId || '').trim().toLowerCase();
  return (config?.tools || []).find((t) => String(t?.id || '').toLowerCase() === wanted) || null;
}

/**
 * Validate a parsed assignee against the agents config.
 * Returns `{ ok: true, assignee: { tool, model? } }` or
 * `{ ok: false, error, validTools, validModels }`.
 */
function validateAssignee(config, spec) {
  const tools = Array.isArray(config?.tools) ? config.tools : [];
  const validTools = tools.map((t) => t.id);
  if (!spec || !spec.tool) {
    return { ok: false, error: 'Assignee is required.', validTools, validModels: [] };
  }

  const tool = findTool(config, spec.tool);
  if (!tool) {
    return {
      ok: false,
      error: `Unknown agent tool "${spec.tool}". Valid tools: ${validTools.join(', ') || '(none configured)'}.`,
      validTools,
      validModels: []
    };
  }
  if (tool.enabled === false) {
    return { ok: false, error: `Agent tool "${tool.id}" is disabled in codingagents.yml.`, validTools, validModels: [] };
  }

  const models = Array.isArray(tool.models) ? tool.models : [];
  const validModels = models.filter((m) => m.enabled !== false).map((m) => m.id);
  if (!spec.model) {
    return { ok: true, assignee: { tool: tool.id }, tool, model: null };
  }

  const model = models.find((m) => m.id === spec.model);
  if (!model) {
    return {
      ok: false,
      error: `Unknown model "${spec.model}" for tool "${tool.id}". Valid model ids: ${validModels.join(', ') || '(none)'}.`,
      validTools,
      validModels
    };
  }
  if (model.enabled === false) {
    return {
      ok: false,
      error: `Model "${model.id}" for tool "${tool.id}" is disabled. Valid model ids: ${validModels.join(', ') || '(none)'}.`,
      validTools,
      validModels
    };
  }

  return { ok: true, assignee: { tool: tool.id, model: model.id }, tool, model };
}

function resolveDefaultModelId(config, toolId) {
  const tool = (config?.tools || []).find((t) => t.id === toolId && t.enabled);
  const model = (tool?.models || []).find((m) => m.enabled);
  return model?.model_id || '';
}

/**
 * Resolve the CLI `model_id` for a tool + codingagents.yml model `id`.
 * If the preferred id matches an enabled model, its `model_id` is returned;
 * otherwise the first enabled model's `model_id` (may be '').
 */
function resolveModelId(config, toolId, preferredModelId) {
  if (!preferredModelId) return resolveDefaultModelId(config, toolId);
  const tool = (config?.tools || []).find((t) => t.id === toolId && t.enabled);
  if (!tool) return '';
  const match = (tool.models || []).find((m) => m.enabled && m.id === preferredModelId);
  if (match) return match.model_id || '';
  return resolveDefaultModelId(config, toolId);
}

/**
 * Decide which planning agent/model a stage runs with: explicit flags win,
 * then the eval defaults from settings (env OMBUTOCODE_EVAL_DEFAULT_AGENT
 * already overrides the store), then codex.
 *
 * Returns `{ agent, model, modelId }` — `model` is the yml id, `modelId` the
 * CLI id substituted into the template.
 */
function resolvePlanningAgent({ config, settingsStore, agent = null, model = null }) {
  const selectedAgent = String(agent || settingsStore.get('eval_default_agent', null) || 'codex').trim().toLowerCase();
  const selectedModel = model || (agent ? null : settingsStore.get('eval_default_model', null)) || null;
  const tool = findTool(config, selectedAgent);
  if (!tool) {
    return {
      ok: false,
      error: `Planning agent "${selectedAgent}" is not in codingagents.yml. Valid tools: ${(config?.tools || []).map((t) => t.id).join(', ')}.`
    };
  }
  if (selectedModel) {
    const check = validateAssignee(config, { tool: selectedAgent, model: selectedModel });
    if (!check.ok) return { ok: false, error: check.error };
  }
  return {
    ok: true,
    agent: tool.id,
    model: selectedModel || null,
    modelId: resolveModelId(config, tool.id, selectedModel) || ''
  };
}

module.exports = {
  parseAssigneeSpec,
  validateAssignee,
  resolveDefaultModelId,
  resolveModelId,
  resolvePlanningAgent
};
