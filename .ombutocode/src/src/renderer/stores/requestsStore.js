import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useRequestsStore = defineStore('requests', () => {
  const _requests = ref([]);
  const _loading = ref(false);
  const _error = ref(null);
  const selectedRequestId = ref(null);

  const requests = computed(() => _requests.value);

  const selectedRequest = computed(() =>
    _requests.value.find(r => r.id === selectedRequestId.value) || null
  );

  async function loadRequests() {
    _loading.value = true;
    _error.value = null;
    try {
      const result = await window.electron.ipcRenderer.invoke('requests:read');
      if (result && result.success) {
        _requests.value = result.data.requests || [];
      } else {
        _error.value = (result && result.error) || 'Failed to load requests';
      }
    } catch (e) {
      _error.value = e.message;
    } finally {
      _loading.value = false;
    }
  }

  async function createRequest(params) {
    _loading.value = true;
    _error.value = null;
    try {
      const result = await window.electron.ipcRenderer.invoke('requests:create', params);
      if (result && result.success) {
        _requests.value = [result.data, ..._requests.value];
        return result.data;
      } else {
        _error.value = (result && result.error) || 'Failed to create request';
        return null;
      }
    } catch (e) {
      _error.value = e.message;
      return null;
    } finally {
      _loading.value = false;
    }
  }

  async function updateRequest(id, updates) {
    _loading.value = true;
    _error.value = null;
    try {
      const result = await window.electron.ipcRenderer.invoke('requests:update', { id, updates });
      if (result && result.success) {
        const idx = _requests.value.findIndex(r => r.id === id);
        if (idx !== -1) {
          _requests.value[idx] = result.data;
        }
        return result.data;
      } else {
        _error.value = (result && result.error) || 'Failed to update request';
        return null;
      }
    } catch (e) {
      _error.value = e.message;
      return null;
    } finally {
      _loading.value = false;
    }
  }

  async function deleteRequest(id) {
    _loading.value = true;
    _error.value = null;
    try {
      const result = await window.electron.ipcRenderer.invoke('requests:delete', { id });
      if (result && result.success) {
        _requests.value = _requests.value.filter(r => r.id !== id);
        if (selectedRequestId.value === id) {
          selectedRequestId.value = null;
        }
        return true;
      } else {
        _error.value = (result && result.error) || 'Failed to delete request';
        return false;
      }
    } catch (e) {
      _error.value = e.message;
      return false;
    } finally {
      _loading.value = false;
    }
  }

  async function markRequestDone(id) {
    _loading.value = true;
    _error.value = null;
    try {
      const result = await window.electron.ipcRenderer.invoke('requests:markDone', { id });
      if (result && result.success) {
        const idx = _requests.value.findIndex(r => r.id === id);
        if (idx !== -1) {
          _requests.value[idx] = result.data;
        }
        return result.data;
      } else {
        _error.value = (result && result.error) || 'Failed to mark request as done';
        return null;
      }
    } catch (e) {
      _error.value = e.message;
      return null;
    } finally {
      _loading.value = false;
    }
  }

  async function searchRequests(params) {
    _loading.value = true;
    _error.value = null;
    try {
      const result = await window.electron.ipcRenderer.invoke('requests:search', params);
      if (result && result.success) {
        _requests.value = result.data.requests || [];
        return result.data;
      } else {
        _error.value = (result && result.error) || 'Failed to search requests';
        return null;
      }
    } catch (e) {
      _error.value = e.message;
      return null;
    } finally {
      _loading.value = false;
    }
  }

  async function markRequestDone(id) {
    _loading.value = true;
    _error.value = null;
    try {
      const result = await window.electron.ipcRenderer.invoke('requests:markDone', { id });
      if (result && result.success) {
        const idx = _requests.value.findIndex(r => r.id === id);
        if (idx !== -1) {
          _requests.value[idx] = result.data;
        }
        return result.data;
      } else {
        _error.value = (result && result.error) || 'Failed to mark request as done';
        return null;
      }
    } catch (e) {
      _error.value = e.message;
      return null;
    } finally {
      _loading.value = false;
    }
  }

  function selectRequest(requestId) {
    selectedRequestId.value = requestId;
  }

  return {
    requests,
    selectedRequest,
    selectedRequestId,
    loading: _loading,
    error: _error,
    loadRequests,
    createRequest,
    updateRequest,
    deleteRequest,
    markRequestDone,
    searchRequests,
    markRequestDone,
    selectRequest
  };
});
