import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useLogsStore = defineStore('logs', () => {
  const _logs = ref([]);
  const _loading = ref(false);
  const _error = ref(null);
  const _total = ref(0);
  const selectedLogId = ref(null);

  // Filter state
  const _eventTypes = ref([]);
  const _ticketIds = ref([]);

  const logs = computed(() => _logs.value);
  const total = computed(() => _total.value);
  const loading = computed(() => _loading.value);
  const error = computed(() => _error.value);

  const selectedLog = computed(() =>
    _logs.value.find(l => l.id === selectedLogId.value) || null
  );

  const eventTypes = computed(() => _eventTypes.value);
  const ticketIds = computed(() => _ticketIds.value);

  async function loadLogs(params = {}) {
    _loading.value = true;
    _error.value = null;
    try {
      const data = await window.electron.ipcRenderer.invoke('logs:read', params);
      if (data.success !== false) {
        _logs.value = data.logs || [];
        _total.value = data.total || 0;
      } else {
        _error.value = data.error || 'Failed to load logs';
      }
    } catch (e) {
      _error.value = e.message;
    } finally {
      _loading.value = false;
    }
  }

  async function searchLogs(params = {}) {
    _loading.value = true;
    _error.value = null;
    try {
      const data = await window.electron.ipcRenderer.invoke('logs:search', params);
      if (data.success !== false) {
        _logs.value = data.logs || [];
        _total.value = data.total || 0;
      } else {
        _error.value = data.error || 'Search failed';
      }
    } catch (e) {
      _error.value = e.message;
    } finally {
      _loading.value = false;
    }
  }

  async function loadFilterOptions() {
    try {
      const [typesResult, idsResult] = await Promise.all([
        window.electron.ipcRenderer.invoke('logs:getDistinctEventTypes'),
        window.electron.ipcRenderer.invoke('logs:getDistinctTicketIds')
      ]);
      if (typesResult.success !== false) {
        _eventTypes.value = typesResult.types || [];
      }
      if (idsResult.success !== false) {
        _ticketIds.value = idsResult.ids || [];
      }
    } catch (e) {
      console.error('Failed to load log filter options:', e);
    }
  }

  function selectLog(logId) {
    selectedLogId.value = logId;
  }

  return {
    logs,
    total,
    loading,
    error,
    selectedLog,
    selectedLogId,
    eventTypes,
    ticketIds,
    loadLogs,
    searchLogs,
    loadFilterOptions,
    selectLog
  };
});
