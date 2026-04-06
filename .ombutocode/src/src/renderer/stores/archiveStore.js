import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useArchiveStore = defineStore('archive', () => {
  const _tickets = ref([]);
  const _loading = ref(false);
  const _error = ref(null);
  const selectedTicketId = ref(null);

  const archiveTickets = computed(() => _tickets.value);

  const selectedTicket = computed(() =>
    _tickets.value.find(t => t.id === selectedTicketId.value) || null
  );

  async function loadArchive() {
    _loading.value = true;
    _error.value = null;
    try {
      const data = await window.electron.ipcRenderer.invoke('archive:read');
      _tickets.value = data.tickets || [];
    } catch (e) {
      _error.value = e.message;
    } finally {
      _loading.value = false;
    }
  }

  function selectTicket(ticketId) {
    selectedTicketId.value = ticketId;
  }

  return {
    tickets: _tickets,
    archiveTickets,
    selectedTicket,
    selectedTicketId,
    loading: _loading,
    error: _error,
    loadArchive,
    selectTicket
  };
});
