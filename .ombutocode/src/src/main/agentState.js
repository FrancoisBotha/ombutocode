'use strict';

const fs = require('fs');
const path = require('path');

// Fields older builds wrote for rolling-window usage limits and per-tool
// pauses. Neither concept exists any more; they are dropped on load so they
// disappear from disk on the next save.
const LEGACY_TOOL_FIELDS = ['window_start', 'runs_in_window', 'paused', 'pause_reason', 'pause_until'];

/**
 * Persists scheduler/agent state to .ombutocode/codingagent-state.json:
 * whether the scheduler was running, and per-tool accumulated cost.
 *
 * @param {Object} deps
 * @param {string} deps.projectRoot - repo root path
 * @returns {{ recordCost: Function, loadState: Function, saveState: Function }}
 */
function createAgentStateStore(deps) {
  const { projectRoot } = deps;
  const stateFilePath = path.join(projectRoot, '.ombutocode', 'codingagent-state.json');

  function stripLegacyFields(state) {
    const tools = state?.windows && typeof state.windows === 'object' ? state.windows : {};
    for (const toolState of Object.values(tools)) {
      if (!toolState || typeof toolState !== 'object') continue;
      for (const key of LEGACY_TOOL_FIELDS) delete toolState[key];
    }
    return state;
  }

  function loadState() {
    try {
      if (fs.existsSync(stateFilePath)) {
        const raw = fs.readFileSync(stateFilePath, 'utf-8');
        return stripLegacyFields(JSON.parse(raw));
      }
    } catch (e) {
      console.warn('[AgentState] Error loading state:', e.message);
    }

    return {
      scheduler_running: true,
      windows: {},
      run_history: []
    };
  }

  function saveState(state) {
    try {
      const dir = path.dirname(stateFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (e) {
      console.error('[AgentState] Error saving state:', e.message);
    }
  }

  /**
   * Add a run's cost to a tool's running total.
   */
  function recordCost(toolId, cost) {
    const state = loadState();
    if (!state.windows || typeof state.windows !== 'object') state.windows = {};
    if (!state.windows[toolId]) {
      state.windows[toolId] = { total_cost: cost };
    } else {
      state.windows[toolId].total_cost = (Number(state.windows[toolId].total_cost) || 0) + cost;
    }
    saveState(state);
  }

  return {
    recordCost,
    loadState,
    saveState
  };
}

module.exports = { createAgentStateStore };
