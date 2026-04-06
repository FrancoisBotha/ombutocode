import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

function createDefaultSchedulerState() {
  return {
    status: 'stopped',
    pauseReason: null,
    pollIntervalMs: 30000,
    queue: {
      totalTodo: 0,
      readyCount: 0,
      nextTickets: []
    },
    activeRuns: []
  };
}

export const useAgentStore = defineStore('agent', () => {
  const _schedulerState = ref(createDefaultSchedulerState());
  const _costData = ref({
    today: 0,
    week: 0,
    total: 0,
    perTool: {},
    perModel: {}
  });
  const _loading = ref(false);
  const _error = ref(null);

  const schedulerState = computed(() => _schedulerState.value);
  const costData = computed(() => _costData.value);
  const loading = computed(() => _loading.value);
  const error = computed(() => _error.value);

  function normalizeSchedulerState(payload) {
    if (!payload || typeof payload !== 'object') {
      return createDefaultSchedulerState();
    }

    const queue = payload.queue && typeof payload.queue === 'object' ? payload.queue : {};
    return {
      status: typeof payload.status === 'string' ? payload.status : 'stopped',
      pauseReason: payload.pauseReason || null,
      pollIntervalMs: Number(payload.pollIntervalMs) || 30000,
      queue: {
        totalTodo: Number(queue.totalTodo) || 0,
        readyCount: Number(queue.readyCount) || 0,
        nextTickets: Array.isArray(queue.nextTickets) ? queue.nextTickets : []
      },
      activeRuns: Array.isArray(payload.activeRuns) ? payload.activeRuns : []
    };
  }

  async function getSchedulerStatus() {
    _loading.value = true;
    _error.value = null;
    try {
      const status = await window.electron.ipcRenderer.invoke('scheduler:status');
      _schedulerState.value = normalizeSchedulerState(status);
      return _schedulerState.value;
    } catch (error) {
      _error.value = error?.message || 'Failed to fetch scheduler status';
      throw error;
    } finally {
      _loading.value = false;
    }
  }

  async function startScheduler() {
    _loading.value = true;
    _error.value = null;
    try {
      const status = await window.electron.ipcRenderer.invoke('scheduler:start');
      _schedulerState.value = normalizeSchedulerState(status);
      return _schedulerState.value;
    } catch (error) {
      _error.value = error?.message || 'Failed to start scheduler';
      throw error;
    } finally {
      _loading.value = false;
    }
  }

  async function stopScheduler() {
    _loading.value = true;
    _error.value = null;
    try {
      const status = await window.electron.ipcRenderer.invoke('scheduler:stop');
      _schedulerState.value = normalizeSchedulerState(status);
      return _schedulerState.value;
    } catch (error) {
      _error.value = error?.message || 'Failed to stop scheduler';
      throw error;
    } finally {
      _loading.value = false;
    }
  }

  async function deleteQueueTicket(ticketId) {
    _loading.value = true;
    _error.value = null;
    try {
      const result = await window.electron.ipcRenderer.invoke('scheduler:deleteQueueTicket', { ticketId });
      if (!result?.success) {
        const message = result?.error?.message || 'Failed to delete queue ticket';
        const error = new Error(message);
        error.code = result?.error?.code || 'DELETE_QUEUE_TICKET_FAILED';
        throw error;
      }
      const status = await window.electron.ipcRenderer.invoke('scheduler:status');
      _schedulerState.value = normalizeSchedulerState(status);
      return result;
    } catch (error) {
      _error.value = error?.message || 'Failed to delete queue ticket';
      throw error;
    } finally {
      _loading.value = false;
    }
  }

  async function getCostData() {
    _loading.value = true;
    _error.value = null;
    try {
      const agentState = await window.electron.ipcRenderer.invoke('agents:state');
      calculateCostSummary(agentState);
      return _costData.value;
    } catch (error) {
      _error.value = error?.message || 'Failed to fetch cost data';
      // Return default if error
      _costData.value = {
        today: 0,
        week: 0,
        total: 0,
        perTool: {},
        perModel: {}
      };
      throw error;
    } finally {
      _loading.value = false;
    }
  }

  function calculateCostSummary(agentState) {
    if (!agentState || typeof agentState !== 'object') {
      _costData.value = { today: 0, week: 0, total: 0, perTool: {}, perModel: {} };
      return;
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday of current week

    let totalCost = 0;
    let todayCost = 0;
    let weekCost = 0;
    const perTool = {};
    const perModel = {};

    // Sum up costs from all tool windows
    const windows = agentState.windows || {};
    for (const [toolId, windowData] of Object.entries(windows)) {
      const toolTotalCost = windowData?.total_cost || 0;
      totalCost += toolTotalCost;
      perTool[toolId] = toolTotalCost;

      // For simplicity, approximate today/week as portion of total
      // In a production system, would track costs with timestamps
      if (toolTotalCost > 0) {
        todayCost += toolTotalCost * 0.3; // Estimate 30% from today
        weekCost += toolTotalCost * 0.7; // Estimate 70% from this week
      }
    }

    _costData.value = {
      today: Math.max(0, todayCost),
      week: Math.max(0, weekCost),
      total: totalCost,
      perTool,
      perModel
    };
  }

  return {
    schedulerState,
    costData,
    loading,
    error,
    getSchedulerStatus,
    startScheduler,
    stopScheduler,
    deleteQueueTicket,
    getCostData
  };
});
