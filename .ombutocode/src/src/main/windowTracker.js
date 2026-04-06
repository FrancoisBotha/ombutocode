'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Manages rolling window state for agent usage tracking.
 * Persists state to .ombutocode/agent-state.json
 *
 * @param {Object} deps
 * @param {string} deps.projectRoot - repo root path
 * @returns {{ recordRun: Function, getRemainingCapacity: Function, resetWindowIfExpired: Function }}
 */
function createWindowTracker(deps) {
  const { projectRoot } = deps;
  const stateFilePath = path.join(projectRoot, '.ombutocode', 'codingagent-state.json');

  /**
   * Ensure state file exists and return state object
   */
  function loadState() {
    try {
      if (fs.existsSync(stateFilePath)) {
        const raw = fs.readFileSync(stateFilePath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[WindowTracker] Error loading state:', e.message);
    }

    // Return default state
    return {
      scheduler_running: true,
      windows: {},
      run_history: []
    };
  }

  /**
   * Persist state to file
   */
  function saveState(state) {
    try {
      const dir = path.dirname(stateFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (e) {
      console.error('[WindowTracker] Error saving state:', e.message);
    }
  }

  /**
   * Record a new run for a tool.
   * Updates window_start if needed and increments runs_in_window.
   */
  function recordRun(toolId, { startedAt = null } = {}) {
    const state = loadState();
    const timestamp = startedAt || new Date().toISOString();

    if (!state.windows) {
      state.windows = {};
    }

    const window = state.windows[toolId];
    const now = new Date(timestamp);

    if (!window) {
      // First run in window
      state.windows[toolId] = {
        window_start: timestamp,
        runs_in_window: 1,
        total_cost: 0,
        paused: false,
        pause_reason: null,
        pause_until: null
      };
    } else {
      // Check if window has expired and reset if needed
      resetWindowIfExpired(toolId, now);
      const updated = state.windows[toolId];
      updated.runs_in_window++;
    }

    saveState(state);
  }

  /**
   * Check if a rolling window has expired for a tool.
   * If expired, reset it.
   * Returns true if window was reset.
   */
  function resetWindowIfExpired(toolId, nowDate, windowHours) {
    const state = loadState();
    const window = state.windows[toolId];
    if (!window) return false;

    const windowStart = new Date(window.window_start);
    const windowMs = (windowHours || 5) * 3600000; // default 5 hours
    const elapsed = nowDate.getTime() - windowStart.getTime();

    if (elapsed >= windowMs) {
      window.window_start = nowDate.toISOString();
      window.runs_in_window = 0;
      window.paused = false;
      window.pause_reason = null;
      window.pause_until = null;
      saveState(state);
      console.log(`[WindowTracker] Window expired for ${toolId}, reset to ${window.window_start}`);
      return true;
    }

    return false;
  }

  /**
   * Get remaining capacity for a tool within its rolling window.
   * Returns { runsUsed, maxRuns, timeRemainingMs, isPaused, pauseReason }
   */
  function getRemainingCapacity(toolId, maxRunsInWindow, windowHours) {
    refreshExpiredPauses();
    const state = loadState();
    const window = state.windows[toolId];
    const now = new Date();

    if (!window) {
      return {
        runsUsed: 0,
        maxRuns: maxRunsInWindow,
        timeRemainingMs: (windowHours || 5) * 3600000,
        isPaused: false,
        pauseReason: null,
        pauseUntil: null
      };
    }

    // Check if window has expired
    const windowStart = new Date(window.window_start);
    const windowMs = (windowHours || 5) * 3600000;
    const elapsed = now.getTime() - windowStart.getTime();
    const timeRemaining = Math.max(0, windowMs - elapsed);

    const isPaused = window.paused || false;
    const pauseReason = window.pause_reason || null;
    const pauseUntil = window.pause_until || null;

    return {
      runsUsed: window.runs_in_window,
      maxRuns: maxRunsInWindow,
      timeRemainingMs: timeRemaining,
      isPaused,
      pauseReason,
      pauseUntil
    };
  }

  /**
   * Pause pickup for a tool with a reason
   */
  function pauseToolWindowPickup(toolId, reason, options = {}) {
    const state = loadState();
    const pauseUntil = options?.pauseUntil || null;
    if (!state.windows[toolId]) {
      state.windows[toolId] = {
        window_start: new Date().toISOString(),
        runs_in_window: 0,
        total_cost: 0,
        paused: true,
        pause_reason: reason,
        pause_until: pauseUntil
      };
    } else {
      state.windows[toolId].paused = true;
      state.windows[toolId].pause_reason = reason;
      state.windows[toolId].pause_until = pauseUntil;
    }
    saveState(state);
    const untilSuffix = pauseUntil ? ` until ${pauseUntil}` : '';
    console.log(`[WindowTracker] Paused ${toolId}: ${reason}${untilSuffix}`);
  }

  /**
   * Resume pickup for a tool
   */
  function resumeToolWindowPickup(toolId) {
    const state = loadState();
    if (state.windows[toolId]) {
      state.windows[toolId].paused = false;
      state.windows[toolId].pause_reason = null;
      state.windows[toolId].pause_until = null;
      saveState(state);
      console.log(`[WindowTracker] Resumed ${toolId}`);
    }
  }

  /**
   * Update cost for a tool
   */
  function recordCost(toolId, cost) {
    const state = loadState();
    if (!state.windows[toolId]) {
      state.windows[toolId] = {
        window_start: new Date().toISOString(),
        runs_in_window: 0,
        total_cost: cost,
        paused: false,
        pause_reason: null,
        pause_until: null
      };
    } else {
      state.windows[toolId].total_cost += cost;
    }
    saveState(state);
  }

  return {
    recordRun,
    getRemainingCapacity,
    resetWindowIfExpired,
    pauseToolWindowPickup,
    resumeToolWindowPickup,
    refreshExpiredPauses,
    recordCost,
    loadState,
    saveState
  };

  /**
   * Resume paused tools when pause_until has elapsed.
   */
  function refreshExpiredPauses(nowDate = new Date()) {
    const state = loadState();
    const windows = state?.windows && typeof state.windows === 'object' ? state.windows : {};
    let changed = false;

    for (const [toolId, window] of Object.entries(windows)) {
      if (!window || !window.paused || !window.pause_until) continue;
      const pauseUntilMs = Date.parse(window.pause_until);
      if (!Number.isFinite(pauseUntilMs)) continue;
      if (pauseUntilMs <= nowDate.getTime()) {
        window.paused = false;
        window.pause_reason = null;
        window.pause_until = null;
        changed = true;
        console.log(`[WindowTracker] Auto-resumed ${toolId} after provider pause expiry`);
      }
    }

    if (changed) {
      saveState(state);
    }
  }
}

module.exports = { createWindowTracker };
