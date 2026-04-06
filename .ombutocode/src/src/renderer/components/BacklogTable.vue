<template>
  <div ref="backlogViewRef" class="backlog-view" :class="{ 'is-resizing': isResizing }">
    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteModal" class="modal-overlay" @click.self="cancelDelete">
      <div class="modal modal-delete">
        <div class="modal-header">
          <span class="mdi mdi-delete-circle modal-icon"></span>
          <h3>Delete Ticket</h3>
        </div>
        <div class="modal-body">
          <p>Are you sure you want to delete this ticket?</p>
          <div class="ticket-info">
            <span class="ticket-id">{{ ticketToDelete?.id }}</span>
            <span class="ticket-title">{{ ticketToDelete?.title }}</span>
          </div>
          <p class="warning-text">This action cannot be undone.</p>
        </div>
        <div class="modal-actions">
          <button ref="cancelButtonRef" class="btn btn-secondary" @click="cancelDelete">
            Cancel
          </button>
          <button class="btn btn-danger" @click="confirmDelete">
            Delete
          </button>
        </div>
      </div>
    </div>

    <!-- Add Ticket Modal -->
    <div v-if="showAddTicketModal" class="modal-overlay" @click.self="cancelAddTicket">
      <div class="modal modal-add-ticket">
        <div class="modal-header">
          <span class="mdi mdi-plus-circle modal-icon modal-icon-primary"></span>
          <h3>Add Ticket</h3>
        </div>
        <div class="modal-body">
          <p class="add-ticket-helper">Describe the ad-hoc task to create.</p>
          <textarea
            ref="addTicketTextareaRef"
            v-model="addTicketPrompt"
            class="add-ticket-input"
            rows="6"
            placeholder="Example: Add export option for review tickets to CSV with date filter."
          ></textarea>
          <p v-if="addTicketShellMessage" class="add-ticket-message">{{ addTicketShellMessage }}</p>
        </div>
        <div class="modal-actions">
          <button
            ref="cancelAddTicketButtonRef"
            class="btn btn-secondary"
            :disabled="addTicketSubmitting"
            @click="cancelAddTicket"
          >
            Cancel
          </button>
          <button
            class="btn btn-primary"
            :disabled="addTicketSubmitting || !addTicketPrompt.trim()"
            @click="createTicketFromPrompt"
          >
            {{ addTicketSubmitting ? 'Creating...' : 'Create' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="loading" class="backlog-loading">
      Loading backlog...
    </div>

    <div v-else-if="error" class="backlog-error">
      <span class="mdi mdi-alert-circle"></span> {{ error }}
    </div>

    <template v-else>
      <div class="backlog-table-container">
        <div class="backlog-header">
          <h2 class="backlog-heading">Backlog</h2>
          <button class="btn btn-primary btn-add-ticket" @click="openAddTicketModal">
            <span class="mdi mdi-plus"></span>
            Add Ticket
          </button>
        </div>

        <div v-if="backlogTickets.length === 0" class="backlog-empty">
          <span class="mdi mdi-clipboard-text-outline"></span>
          <p>No backlog items found</p>
        </div>

        <table v-else class="backlog-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Dependencies</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(ticket, index) in backlogTickets"
              :key="ticket.id"
              :class="{ 'is-selected': ticket.id === selectedTicketId }"
              tabindex="0"
              @click="selectTicket(ticket.id)"
              @keydown.up.prevent="selectPrevious(index)"
              @keydown.down.prevent="selectNext(index)"
            >
              <td class="col-id">{{ ticket.id }}</td>
              <td class="col-title">{{ ticket.title }}</td>
              <td class="col-deps">{{ ticket.dependencies && ticket.dependencies.length ? ticket.dependencies.join(', ') : '—' }}</td>
              <td class="col-actions">
                <button class="btn-promote-sm" @click.stop="promote(ticket.id)" title="Promote to TODO">
                  <span class="mdi mdi-arrow-up-bold"></span>
                </button>
                <button class="btn-delete-sm" @click.stop="deleteTicketHandler(ticket.id, ticket.title)" title="Delete ticket">
                  <span class="mdi mdi-delete"></span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        v-if="selectedTicket"
        class="resize-handle"
        role="separator"
        aria-orientation="vertical"
        tabindex="0"
        title="Drag to resize detail panel"
        @pointerdown="startResize"
      ></div>

      <div v-if="selectedTicket" class="backlog-detail-container" :style="detailPanelStyle">
        <BacklogDetail :ticket="selectedTicket" />
      </div>
    </template>
  </div>
</template>

<script>
import { computed, onMounted, onUnmounted, nextTick, ref, watch } from 'vue';
import { useBacklogStore } from '@/stores/backlogStore';
import BacklogDetail from '@/components/BacklogDetail.vue';

const RESIZE_HANDLE_WIDTH = 10;
const MIN_TABLE_WIDTH = 420;
const MIN_DETAIL_WIDTH = 280;
const MAX_DETAIL_WIDTH = 760;

export default {
  name: 'BacklogTable',
  components: {
    BacklogDetail
  },
  setup() {
    const backlogStore = useBacklogStore();
    const backlogViewRef = ref(null);
    const detailWidth = ref(420);
    const isResizing = ref(false);
    const dragStartX = ref(0);
    const dragStartWidth = ref(detailWidth.value);
    const showDeleteModal = ref(false);
    const ticketToDelete = ref(null);
    const cancelButtonRef = ref(null);
    const showAddTicketModal = ref(false);
    const addTicketPrompt = ref('');
    const addTicketShellMessage = ref('');
    const addTicketSubmitting = ref(false);
    const addTicketTextareaRef = ref(null);
    const cancelAddTicketButtonRef = ref(null);

    const backlogTickets = computed(() => backlogStore.backlogTickets);
    const selectedTicketId = computed(() => backlogStore.selectedTicketId);
    const selectedTicket = computed(() => backlogStore.selectedTicket);
    const loading = computed(() => backlogStore.loading);
    const error = computed(() => backlogStore.error);
    const detailPanelStyle = computed(() => ({
      width: `${detailWidth.value}px`
    }));

    onMounted(async () => {
      await backlogStore.loadBacklog();
      if (backlogTickets.value.length > 0 && !selectedTicketId.value) {
        backlogStore.selectTicket(backlogTickets.value[0].id);
      }
      detailWidth.value = clampDetailWidth(detailWidth.value);
      window.addEventListener('resize', handleWindowResize);
    });

    onUnmounted(() => {
      window.removeEventListener('resize', handleWindowResize);
      stopResize();
    });

    function selectTicket(ticketId) {
      backlogStore.selectTicket(ticketId);
    }

    function selectPrevious(currentIndex) {
      if (currentIndex > 0) {
        const prevTicket = backlogTickets.value[currentIndex - 1];
        backlogStore.selectTicket(prevTicket.id);
        nextTick(() => focusRow(currentIndex - 1));
      }
    }

    function selectNext(currentIndex) {
      if (currentIndex < backlogTickets.value.length - 1) {
        const nextTicket = backlogTickets.value[currentIndex + 1];
        backlogStore.selectTicket(nextTicket.id);
        nextTick(() => focusRow(currentIndex + 1));
      }
    }

    function focusRow(index) {
      const rows = document.querySelectorAll('.backlog-table tbody tr');
      if (rows[index]) {
        rows[index].focus();
      }
    }

    async function promote(ticketId) {
      try {
        await backlogStore.promoteToTodo(ticketId);
      } catch (e) {
        console.error('Failed to promote ticket:', e);
      }
    }

    function deleteTicketHandler(ticketId, ticketTitle) {
      ticketToDelete.value = { id: ticketId, title: ticketTitle };
      showDeleteModal.value = true;
    }

    function cancelDelete() {
      showDeleteModal.value = false;
      ticketToDelete.value = null;
    }

    function openAddTicketModal() {
      showAddTicketModal.value = true;
      addTicketShellMessage.value = '';
    }

    function cancelAddTicket(force = false) {
      if (!force && addTicketSubmitting.value) return;
      showAddTicketModal.value = false;
      addTicketPrompt.value = '';
      addTicketShellMessage.value = '';
    }

    async function createTicketFromPrompt() {
      if (addTicketSubmitting.value) return;

      const promptText = addTicketPrompt.value.trim();
      if (!promptText) {
        addTicketShellMessage.value = 'Please describe the ad-hoc task before creating.';
        return;
      }

      addTicketSubmitting.value = true;
      addTicketShellMessage.value = '';

      try {
        const result = await backlogStore.createAdHocFromPrompt(promptText);
        await backlogStore.loadBacklog();
        const createdTicketId = result?.data?.ticketId || null;
        if (createdTicketId) {
          backlogStore.selectTicket(createdTicketId);
          // Auto-close modal on successful ticket creation
          cancelAddTicket(true);
        } else {
          // Ticket creation returned success but no ticketId - keep modal open with error
          addTicketShellMessage.value = 'Ticket creation succeeded but no ticket ID was returned. Please refresh to verify.';
        }
      } catch (e) {
        addTicketShellMessage.value = e?.message || 'Failed to create ad-hoc ticket. Please try again.';
      } finally {
        addTicketSubmitting.value = false;
      }
    }

    async function confirmDelete() {
      if (!ticketToDelete.value) return;

      const ticketId = ticketToDelete.value.id;
      cancelDelete(); // Close modal first

      try {
        await backlogStore.deleteTicket(ticketId);
      } catch (e) {
        alert(`Failed to delete ticket: ${e.message}`);
      }
    }

    // Focus the cancel button when modal opens for safe default
    watch(showDeleteModal, (newVal) => {
      if (newVal) {
        nextTick(() => {
          cancelButtonRef.value?.focus();
        });
      }
    });

    watch(showAddTicketModal, (newVal) => {
      if (newVal) {
        nextTick(() => {
          addTicketTextareaRef.value?.focus();
        });
        return;
      }
      nextTick(() => {
        cancelAddTicketButtonRef.value?.blur();
      });
    });

    // Clear selection when backlog becomes empty (e.g., after promoting last ticket)
    watch(backlogTickets, (newTickets) => {
      if (newTickets.length === 0 && selectedTicketId.value) {
        backlogStore.selectTicket(null);
      }
    });

    function getContainerWidth() {
      return backlogViewRef.value?.clientWidth || window.innerWidth;
    }

    function getMaxDetailWidth() {
      const maxFromContainer = getContainerWidth() - MIN_TABLE_WIDTH - RESIZE_HANDLE_WIDTH;
      return Math.max(MIN_DETAIL_WIDTH, Math.min(MAX_DETAIL_WIDTH, maxFromContainer));
    }

    function clampDetailWidth(width) {
      const min = MIN_DETAIL_WIDTH;
      const max = getMaxDetailWidth();
      return Math.min(Math.max(width, min), max);
    }

    function handleWindowResize() {
      detailWidth.value = clampDetailWidth(detailWidth.value);
    }

    function startResize(event) {
      if (!selectedTicket.value) return;
      isResizing.value = true;
      dragStartX.value = event.clientX;
      dragStartWidth.value = detailWidth.value;
      event.preventDefault();
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', stopResize);
      window.addEventListener('pointercancel', stopResize);
    }

    function handlePointerMove(event) {
      if (!isResizing.value) return;
      const deltaX = event.clientX - dragStartX.value;
      detailWidth.value = clampDetailWidth(dragStartWidth.value - deltaX);
    }

    function stopResize() {
      if (!isResizing.value) return;
      isResizing.value = false;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
    }

    return {
      backlogTickets,
      selectedTicketId,
      selectedTicket,
      loading,
      error,
      detailPanelStyle,
      backlogViewRef,
      isResizing,
      selectTicket,
      selectPrevious,
      selectNext,
      promote,
      deleteTicketHandler,
      showDeleteModal,
      ticketToDelete,
      cancelButtonRef,
      cancelDelete,
      confirmDelete,
      showAddTicketModal,
      addTicketPrompt,
      addTicketShellMessage,
      addTicketSubmitting,
      addTicketTextareaRef,
      cancelAddTicketButtonRef,
      openAddTicketModal,
      cancelAddTicket,
      createTicketFromPrompt,
      startResize
    };
  }
};
</script>

<style scoped>
.backlog-view {
  display: flex;
  flex: 1 1 auto;
  overflow: hidden;
  background-color: #f5f7fa;
}

.backlog-view.is-resizing,
.backlog-view.is-resizing * {
  user-select: none;
  cursor: col-resize;
}

.backlog-loading,
.backlog-error,
.backlog-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: #6b778c;
  font-size: 0.95rem;
}

.backlog-error {
  color: #e74c3c;
}

.backlog-empty .mdi {
  font-size: 3rem;
  margin-bottom: 0.75rem;
  color: #c1c7d0;
}

.backlog-empty p {
  margin: 0;
}

.backlog-table-container {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  min-width: 0;
}

.backlog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.backlog-heading {
  margin: 0;
  font-size: 1.1rem;
  color: #2c3e50;
}

.btn-add-ticket {
  padding: 0.45rem 0.9rem;
}

.resize-handle {
  flex: 0 0 10px;
  cursor: col-resize;
  position: relative;
  background-color: #f5f7fa;
}

.resize-handle::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background-color: #d6dbe3;
}

.resize-handle:hover::before {
  background-color: #4a90e2;
}

.backlog-detail-container {
  flex: 0 0 auto;
  min-width: 0;
  max-width: 100%;
  height: 100%;
}

.backlog-table {
  width: 100%;
  border-collapse: collapse;
  background-color: #ffffff;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.backlog-table thead {
  background-color: #f8f9fa;
  border-bottom: 2px solid #e1e4e8;
}

.backlog-table th {
  padding: 0.75rem 1rem;
  text-align: left;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b778c;
}

.backlog-table td {
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  color: #2c3e50;
  border-bottom: 1px solid #f1f2f4;
}

.backlog-table tbody tr {
  cursor: pointer;
  transition: background-color 0.15s;
  outline: none;
}

.backlog-table tbody tr:hover {
  background-color: #f8f9fa;
}

.backlog-table tbody tr.is-selected {
  background-color: #e1e7ff;
}

.backlog-table tbody tr:focus {
  box-shadow: inset 0 0 0 2px #4a90e2;
}

.col-id {
  font-family: monospace;
  font-size: 0.8rem;
  white-space: nowrap;
  width: 120px;
}

.col-title {
  min-width: 200px;
}

.col-deps {
  color: #6b778c;
  font-size: 0.8rem;
  white-space: nowrap;
  width: 150px;
}

.col-actions {
  width: 80px;
  text-align: center;
  display: flex;
  flex-direction: row;
  gap: 4px;
  justify-content: center;
}

.btn-promote-sm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background-color: transparent;
  color: #6b778c;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-promote-sm:hover {
  background-color: #4a90e2;
  color: white;
}

.btn-delete-sm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background-color: transparent;
  color: #6b778c;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-delete-sm:hover {
  background-color: #e74c3c;
  color: white;
}

/* Delete Confirmation Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  width: 90%;
  max-width: 420px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.modal-delete {
  border-top: 4px solid #e74c3c;
}

.modal-add-ticket {
  border-top: 4px solid #4a90e2;
  max-width: 560px;
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.modal-icon {
  font-size: 1.5rem;
  color: #e74c3c;
}

.modal-icon-primary {
  color: #4a90e2;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #2c3e50;
}

.modal-body {
  margin-bottom: 1.5rem;
}

.modal-body p {
  margin: 0 0 1rem 0;
  color: #555;
  font-size: 0.95rem;
}

.add-ticket-helper {
  margin-bottom: 0.75rem;
}

.add-ticket-input {
  width: 100%;
  border: 1px solid #d1d9e0;
  border-radius: 6px;
  padding: 0.65rem 0.7rem;
  font-size: 0.92rem;
  line-height: 1.4;
  resize: vertical;
  min-height: 8.25rem;
}

.add-ticket-input:focus {
  outline: 2px solid #4a90e2;
  outline-offset: 1px;
}

.add-ticket-message {
  margin-top: 0.7rem;
  margin-bottom: 0;
  font-size: 0.82rem;
  color: #6b778c;
}

.ticket-info {
  background-color: #f8f9fa;
  border-radius: 6px;
  padding: 1rem;
  margin-bottom: 1rem;
  border-left: 3px solid #4a90e2;
}

.ticket-id {
  display: block;
  font-family: monospace;
  font-size: 0.85rem;
  color: #6b778c;
  margin-bottom: 0.25rem;
}

.ticket-title {
  display: block;
  font-size: 1rem;
  font-weight: 500;
  color: #2c3e50;
  line-height: 1.4;
}

.warning-text {
  color: #e74c3c;
  font-size: 0.875rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.warning-text::before {
  content: '\F05D0';
  font-family: 'Material Design Icons';
  font-size: 1rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.btn {
  padding: 0.5rem 1.25rem;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.btn-secondary {
  background-color: #f0f0f0;
  color: #555;
}

.btn-secondary:hover {
  background-color: #e0e0e0;
}

.btn-secondary:focus {
  outline: 2px solid #4a90e2;
  outline-offset: 2px;
}

.btn-danger {
  background-color: #e74c3c;
  color: white;
}

.btn-danger:hover {
  background-color: #c0392b;
}

.btn-danger:focus {
  outline: 2px solid #e74c3c;
  outline-offset: 2px;
}

.btn-primary {
  background-color: #4a90e2;
  color: white;
}

.btn-primary:hover {
  background-color: #357abd;
}

.btn-primary:focus {
  outline: 2px solid #4a90e2;
  outline-offset: 2px;
}
</style>
