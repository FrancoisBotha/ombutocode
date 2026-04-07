import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useArtifactStore = defineStore('artifact', () => {
  const artifactList = ref([]);
  const currentArtifact = ref(null);
  const filters = ref({ type: null, status: null, search: '' });
  const loading = ref(false);

  const filteredList = computed(() => {
    let list = artifactList.value;
    if (filters.value.type) {
      list = list.filter((a) => a.type === filters.value.type);
    }
    if (filters.value.status) {
      list = list.filter((a) => a.status === filters.value.status);
    }
    if (filters.value.search) {
      const term = filters.value.search.toLowerCase();
      list = list.filter((a) => {
        const title = (a.title || '').toLowerCase();
        const id = (a.id || '').toLowerCase();
        return title.includes(term) || id.includes(term);
      });
    }
    return list;
  });

  async function fetchAll(queryFilters) {
    loading.value = true;
    try {
      artifactList.value = await window.electron.ipcRenderer.invoke('artifact:list', queryFilters);
    } finally {
      loading.value = false;
    }
  }

  async function fetchOne(id) {
    loading.value = true;
    try {
      currentArtifact.value = await window.electron.ipcRenderer.invoke('artifact:get', id);
    } finally {
      loading.value = false;
    }
    return currentArtifact.value;
  }

  async function create(payload) {
    loading.value = true;
    try {
      const newArtifact = await window.electron.ipcRenderer.invoke('artifact:create', payload);
      await fetchAll();
      return newArtifact;
    } finally {
      loading.value = false;
    }
  }

  async function update(id, payload) {
    loading.value = true;
    try {
      const updated = await window.electron.ipcRenderer.invoke('artifact:update', { id, ...payload });
      await fetchAll();
      return updated;
    } finally {
      loading.value = false;
    }
  }

  async function archive(id) {
    loading.value = true;
    try {
      const result = await window.electron.ipcRenderer.invoke('artifact:archive', id);
      await fetchAll();
      return result;
    } finally {
      loading.value = false;
    }
  }

  async function fetchNextId(type) {
    return await window.electron.ipcRenderer.invoke('artifact:nextId', type);
  }

  // Listen for file-watcher events and refresh the list
  window.electron.ipcRenderer.on('watcher:fileChanged', () => {
    fetchAll();
  });

  return {
    artifactList,
    currentArtifact,
    filters,
    loading,
    filteredList,
    fetchAll,
    fetchOne,
    create,
    update,
    archive,
    fetchNextId,
  };
});
