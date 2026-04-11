import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useEpicStore = defineStore('feature', () => {
  const _epics = ref([]);
  const _loading = ref(false);
  const _error = ref(null);
  const selectedEpicId = ref(null);

  // Feature evaluation state
  const _evalRunId = ref(null);
  const _evalState = ref(null); // 'checking' | 'running' | 'pass' | 'fail' | 'error'
  const _evalError = ref(null);
  const _evalOutput = ref(null);
  let _evalPollTimer = null;

  const epics = computed(() => _epics.value);

  const selectedEpic = computed(() =>
    _epics.value.find((feature) => feature.id === selectedEpicId.value) || null
  );

  const evalState = computed(() => _evalState.value);
  const evalError = computed(() => _evalError.value);
  const evalOutput = computed(() => _evalOutput.value);

  async function loadEpics() {
    _loading.value = true;
    _error.value = null;
    try {
      const data = await window.electron.ipcRenderer.invoke('epics:read');
      _epics.value = Array.isArray(data?.epics) ? data.epics : [];
    } catch (e) {
      _error.value = e.message;
    } finally {
      _loading.value = false;
    }
  }

  async function completeEpic(feature) {
    if (!feature?.fileName) {
      throw new Error('Feature file is required');
    }

    _error.value = null;
    try {
      await window.electron.ipcRenderer.invoke('epics:updateStatus', {
        fileName: feature.fileName,
        status: 'implemented'
      });
      await loadEpics();
      selectedEpicId.value = feature.id;
    } catch (e) {
      _error.value = e.message;
      throw e;
    }
  }

  async function startEpic(feature) {
    if (!feature?.fileName) {
      throw new Error('Feature file is required');
    }

    _error.value = null;
    try {
      const result = await window.electron.ipcRenderer.invoke('epics:start', {
        fileName: feature.fileName
      });
      await loadEpics();
      selectedEpicId.value = feature.id;
      return result;
    } catch (e) {
      _error.value = e.message;
      throw e;
    }
  }

  async function evaluateEpic(feature) {
    if (!feature?.fileName) {
      throw new Error('Feature file is required');
    }

    resetEvalState();
    _evalState.value = 'checking';
    _evalError.value = null;

    try {
      const result = await window.electron.ipcRenderer.invoke('epics:evaluate', {
        fileName: feature.fileName
      });

      _evalRunId.value = result.runId;
      _evalState.value = 'running';

      // Start polling
      _startPolling();
    } catch (e) {
      _evalState.value = 'error';
      _evalError.value = e.message;
    }
  }

  function _startPolling() {
    _stopPolling();
    _evalPollTimer = setInterval(async () => {
      if (!_evalRunId.value) {
        _stopPolling();
        return;
      }
      try {
        const status = await window.electron.ipcRenderer.invoke('epics:evalStatus', {
          runId: _evalRunId.value
        });
        if (!status || status.state === 'completed' || status.state === 'failed') {
          _stopPolling();
          // Final state will be set by the epics:evalComplete event
          // If we haven't received it yet and the run is done, check state
          if (status?.state === 'failed' && _evalState.value === 'running') {
            _evalState.value = 'error';
            _evalError.value = status.error || 'Agent process failed';
          }
        }
      } catch {
        // Polling error — keep trying
      }
    }, 3000);
  }

  function _stopPolling() {
    if (_evalPollTimer) {
      clearInterval(_evalPollTimer);
      _evalPollTimer = null;
    }
  }

  function handleEvalComplete({ verdict, stdout }) {
    _stopPolling();
    if (verdict === 'PASS') {
      _evalState.value = 'pass';
    } else if (verdict === 'FAIL') {
      _evalState.value = 'fail';
    } else {
      _evalState.value = 'error';
      _evalError.value = 'Could not parse evaluation result';
    }
    _evalOutput.value = stdout || '';
  }

  function resetEvalState() {
    _stopPolling();
    _evalRunId.value = null;
    _evalState.value = null;
    _evalError.value = null;
    _evalOutput.value = null;
  }

  function selectEpic(featureId) {
    selectedEpicId.value = featureId;
  }

  return {
    epics,
    selectedEpic,
    selectedEpicId,
    loading: _loading,
    error: _error,
    evalState,
    evalError,
    evalOutput,
    loadEpics,
    completeEpic,
    startEpic,
    evaluateEpic,
    handleEvalComplete,
    resetEvalState,
    selectEpic
  };
});
