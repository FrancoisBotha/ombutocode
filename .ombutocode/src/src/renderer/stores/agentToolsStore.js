import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

const DEFAULT_TOOLS = [
  {
    id: 'claude',
    name: 'Claude',
    command: '/usr/local/bin/claude',
    rollingWindowHours: 5,
    maxConcurrentRuns: 1,
    cooldownMinutes: 5,
    enabled: true,
    budgetLimit: 50.0,
    models: [
      {
        id: 'opus-4.6',
        name: 'Opus 4.6',
        modelId: 'claude-opus-4-6',
        ratePerHour: 2,
        costPerRun: 0.5,
        enabled: true
      },
      {
        id: 'haiku-4.5',
        name: 'Haiku 4.5',
        modelId: 'claude-haiku-4-5-20251001',
        ratePerHour: 3,
        costPerRun: 0.05,
        enabled: true
      }
    ]
  },
  {
    id: 'codex',
    name: 'Codex',
    command: '/usr/local/bin/codex',
    rollingWindowHours: 5,
    maxConcurrentRuns: 1,
    cooldownMinutes: 5,
    enabled: true,
    budgetLimit: 50.0,
    models: [
      {
        id: 'gpt-5',
        name: 'GPT-5',
        modelId: 'gpt-5',
        ratePerHour: 2,
        costPerRun: 0.2,
        enabled: true
      }
    ]
  },
  {
    id: 'kimi',
    name: 'Kimi',
    command: '/usr/local/bin/kimi',
    rollingWindowHours: 5,
    maxConcurrentRuns: 1,
    cooldownMinutes: 5,
    enabled: false,
    budgetLimit: 50.0,
    models: [
      {
        id: 'k2',
        name: 'K2',
        modelId: 'kimi-k2',
        ratePerHour: 1,
        costPerRun: 0.08,
        enabled: true
      }
    ]
  }
];

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

// Convert YAML snake_case tool to JS camelCase
function fromYaml(tool) {
  return {
    id: String(tool.id || ''),
    name: String(tool.name || '').trim(),
    command: String(tool.command || '').trim(),
    rollingWindowHours: normalizeNumber(tool.rolling_window_hours, 1),
    maxConcurrentRuns: normalizeNumber(tool.max_concurrent, 1),
    cooldownMinutes: normalizeNumber(tool.cooldown_minutes, 0),
    enabled: tool.enabled !== false,
    budgetLimit: normalizeNumber(tool.budget_limit, 0),
    models: Array.isArray(tool.models) ? tool.models.map(fromYamlModel) : []
  };
}

function fromYamlModel(model) {
  return {
    id: String(model.id || ''),
    name: String(model.name || '').trim(),
    modelId: String(model.model_id || '').trim(),
    ratePerHour: normalizeNumber(model.rate_per_hour, 0),
    costPerRun: normalizeNumber(model.cost_per_run, 0),
    enabled: model.enabled !== false
  };
}

// Convert JS camelCase tool to YAML snake_case
function toYaml(tool) {
  return {
    id: tool.id,
    name: tool.name,
    command: tool.command,
    rolling_window_hours: tool.rollingWindowHours,
    max_concurrent: tool.maxConcurrentRuns,
    cooldown_minutes: tool.cooldownMinutes,
    enabled: tool.enabled,
    budget_limit: tool.budgetLimit,
    models: (tool.models || []).map(toYamlModel)
  };
}

function toYamlModel(model) {
  return {
    id: model.id,
    name: model.name,
    model_id: model.modelId,
    rate_per_hour: model.ratePerHour,
    cost_per_run: model.costPerRun,
    enabled: model.enabled
  };
}

function createToolId(name) {
  const slug = String(name || 'tool')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'tool'}-${Date.now().toString(36)}`;
}

function createModelId(name) {
  const slug = String(name || 'model')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'model'}-${Date.now().toString(36)}`;
}

export const useAgentToolsStore = defineStore('agent-tools', () => {
  const _tools = ref(DEFAULT_TOOLS.map((tool) => ({ ...tool, models: tool.models.map((m) => ({ ...m })) })));
  const _loading = ref(false);
  const _error = ref(null);

  const tools = computed(() => _tools.value);
  const loading = computed(() => _loading.value);
  const error = computed(() => _error.value);

  async function loadAgents() {
    _loading.value = true;
    _error.value = null;
    try {
      const data = await window.electron.ipcRenderer.invoke('agents:read');
      if (data && Array.isArray(data.tools) && data.tools.length > 0) {
        _tools.value = data.tools.map(fromYaml);
      }
    } catch (e) {
      _error.value = e.message;
      console.error('Failed to load agents:', e);
    } finally {
      _loading.value = false;
    }
  }

  async function saveAgents() {
    _error.value = null;
    try {
      await window.electron.ipcRenderer.invoke('agents:write', {
        version: 1,
        tools: _tools.value.map(toYaml)
      });
    } catch (e) {
      _error.value = e.message;
      console.error('Failed to save agents:', e);
    }
  }

  function addTool(toolDraft) {
    const name = String(toolDraft?.name || '').trim();
    const command = String(toolDraft?.command || '').trim();
    if (!name || !command) {
      throw new Error('Name and command are required');
    }

    const newTool = {
      id: createToolId(name),
      name,
      command,
      rollingWindowHours: Math.max(1, normalizeNumber(toolDraft.rollingWindowHours, 1)),
      maxConcurrentRuns: Math.max(1, normalizeNumber(toolDraft.maxConcurrentRuns, 1)),
      cooldownMinutes: Math.max(0, normalizeNumber(toolDraft.cooldownMinutes, 0)),
      enabled: !!toolDraft.enabled,
      budgetLimit: Math.max(0, normalizeNumber(toolDraft.budgetLimit, 0)),
      models: []
    };

    _tools.value = [..._tools.value, newTool];
    saveAgents();
    return newTool;
  }

  function updateTool(toolId, updates) {
    const index = _tools.value.findIndex((tool) => tool.id === toolId);
    if (index === -1) return null;

    const current = _tools.value[index];
    const next = {
      ...current,
      name: String(updates?.name ?? current.name).trim(),
      command: String(updates?.command ?? current.command).trim(),
      rollingWindowHours: Math.max(1, normalizeNumber(updates?.rollingWindowHours ?? current.rollingWindowHours, 1)),
      maxConcurrentRuns: Math.max(1, normalizeNumber(updates?.maxConcurrentRuns ?? current.maxConcurrentRuns, 1)),
      cooldownMinutes: Math.max(0, normalizeNumber(updates?.cooldownMinutes ?? current.cooldownMinutes, 0)),
      enabled: updates?.enabled === undefined ? current.enabled : !!updates.enabled,
      budgetLimit: Math.max(0, normalizeNumber(updates?.budgetLimit ?? current.budgetLimit, 0)),
      models: Array.isArray(updates?.models) ? updates.models : current.models
    };

    if (!next.name || !next.command) {
      throw new Error('Name and command are required');
    }

    _tools.value.splice(index, 1, next);
    _tools.value = [..._tools.value];
    saveAgents();
    return next;
  }

  function deleteTool(toolId) {
    const before = _tools.value.length;
    _tools.value = _tools.value.filter((tool) => tool.id !== toolId);
    if (_tools.value.length === before) return false;
    saveAgents();
    return true;
  }

  function toggleToolEnabled(toolId) {
    const tool = _tools.value.find((entry) => entry.id === toolId);
    if (!tool) return null;
    return updateTool(toolId, { enabled: !tool.enabled });
  }

  function addModel(toolId, modelDraft) {
    const tool = _tools.value.find((entry) => entry.id === toolId);
    if (!tool) return null;

    const name = String(modelDraft?.name || '').trim();
    const modelId = String(modelDraft?.modelId || '').trim();
    if (!name || !modelId) {
      throw new Error('Model name and identifier are required');
    }

    const newModel = {
      id: createModelId(name),
      name,
      modelId,
      ratePerHour: Math.max(0, normalizeNumber(modelDraft?.ratePerHour, 0)),
      costPerRun: Math.max(0, normalizeNumber(modelDraft?.costPerRun, 0)),
      enabled: modelDraft?.enabled === undefined ? true : !!modelDraft.enabled
    };

    const nextModels = [...(tool.models || []), newModel];
    updateTool(toolId, { models: nextModels });
    return newModel;
  }

  function updateModel(toolId, modelId, updates) {
    const tool = _tools.value.find((entry) => entry.id === toolId);
    if (!tool) return null;

    const index = (tool.models || []).findIndex((model) => model.id === modelId);
    if (index === -1) return null;

    const current = tool.models[index];
    const nextModel = {
      ...current,
      name: String(updates?.name ?? current.name).trim(),
      modelId: String(updates?.modelId ?? current.modelId).trim(),
      ratePerHour: Math.max(0, normalizeNumber(updates?.ratePerHour ?? current.ratePerHour, 0)),
      costPerRun: Math.max(0, normalizeNumber(updates?.costPerRun ?? current.costPerRun, 0)),
      enabled: updates?.enabled === undefined ? current.enabled : !!updates.enabled
    };

    if (!nextModel.name || !nextModel.modelId) {
      throw new Error('Model name and identifier are required');
    }

    const nextModels = [...tool.models];
    nextModels.splice(index, 1, nextModel);
    updateTool(toolId, { models: nextModels });
    return nextModel;
  }

  function deleteModel(toolId, modelId) {
    const tool = _tools.value.find((entry) => entry.id === toolId);
    if (!tool) return false;
    const before = tool.models.length;
    const nextModels = tool.models.filter((model) => model.id !== modelId);
    if (nextModels.length === before) return false;
    updateTool(toolId, { models: nextModels });
    return true;
  }

  function toggleModelEnabled(toolId, modelId) {
    const tool = _tools.value.find((entry) => entry.id === toolId);
    const model = tool?.models?.find((entry) => entry.id === modelId);
    if (!model) return null;
    return updateModel(toolId, modelId, { enabled: !model.enabled });
  }

  return {
    tools,
    loading,
    error,
    loadAgents,
    saveAgents,
    addTool,
    updateTool,
    deleteTool,
    toggleToolEnabled,
    addModel,
    updateModel,
    deleteModel,
    toggleModelEnabled
  };
});
