<template>
  <div ref="requestsViewRef" class="requests-view" :class="{ 'is-resizing': isResizing }">

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteModal" class="modal-overlay" @click.self="cancelDelete">
      <div class="modal modal-delete">
        <div class="modal-header">
          <span class="mdi mdi-delete-circle modal-icon"></span>
          <h3>Delete Request</h3>
        </div>
        <div class="modal-body">
          <p>Are you sure you want to delete this request?</p>
          <div class="request-info">
            <span class="request-id">{{ requestToDelete?.id }}</span>
            <span class="request-title">{{ requestToDelete?.title }}</span>
          </div>
          <p class="warning-text">This action cannot be undone.</p>
        </div>
        <div class="modal-actions">
          <button ref="cancelDeleteButtonRef" class="btn btn-secondary" @click="cancelDelete">
            Cancel
          </button>
          <button class="btn btn-danger" @click="confirmDelete">
            Delete
          </button>
        </div>
      </div>
    </div>

    <!-- Add Request Modal -->
    <div v-if="showAddModal" class="modal-overlay" @click.self="cancelAdd">
      <div class="modal modal-add">
        <div class="modal-header">
          <span class="mdi mdi-plus-circle modal-icon modal-icon-primary"></span>
          <h3>Add Request</h3>
        </div>
        <div class="modal-body">
          <div class="form-field">
            <label class="form-label" for="add-title">Title <span class="required">*</span></label>
            <input
              id="add-title"
              ref="addTitleRef"
              v-model="addForm.title"
              class="form-input"
              type="text"
              placeholder="Short descriptive title"
              maxlength="200"
            />
          </div>
          <div class="form-field">
            <label class="form-label" for="add-description">Description</label>
            <textarea
              id="add-description"
              v-model="addForm.description"
              class="form-textarea"
              rows="5"
              placeholder="Detailed description of the feature idea (optional)"
            ></textarea>
          </div>
          <p v-if="addError" class="form-error">{{ addError }}</p>
        </div>
        <div class="modal-actions">
          <button
            class="btn btn-secondary"
            :disabled="addSubmitting"
            @click="cancelAdd"
          >
            Cancel
          </button>
          <button
            class="btn btn-primary"
            :disabled="addSubmitting || !addForm.title.trim()"
            @click="submitAdd"
          >
            {{ addSubmitting ? 'Creating...' : 'Create' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Edit Request Modal -->
    <div v-if="showEditModal" class="modal-overlay" @click.self="cancelEdit">
      <div class="modal modal-add">
        <div class="modal-header">
          <span class="mdi mdi-pencil modal-icon modal-icon-primary"></span>
          <h3>Edit Request</h3>
        </div>
        <div class="modal-body">
          <div class="form-field">
            <label class="form-label" for="edit-title">Title <span class="required">*</span></label>
            <input
              id="edit-title"
              ref="editTitleRef"
              v-model="editForm.title"
              class="form-input"
              type="text"
              placeholder="Short descriptive title"
              maxlength="200"
            />
          </div>
          <div class="form-field">
            <label class="form-label" for="edit-description">Description</label>
            <textarea
              id="edit-description"
              v-model="editForm.description"
              class="form-textarea"
              rows="5"
              placeholder="Detailed description of the feature idea (optional)"
            ></textarea>
          </div>
          <p v-if="editError" class="form-error">{{ editError }}</p>
        </div>
        <div class="modal-actions">
          <button
            class="btn btn-secondary"
            :disabled="editSubmitting"
            @click="cancelEdit"
          >
            Cancel
          </button>
          <button
            class="btn btn-primary"
            :disabled="editSubmitting || !editForm.title.trim()"
            @click="submitEdit"
          >
            {{ editSubmitting ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="requests-loading">
      Loading requests...
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="requests-error">
      <span class="mdi mdi-alert-circle"></span> {{ error }}
    </div>

    <template v-else>
      <div class="requests-table-container">
        <div class="requests-header">
          <h2 class="requests-heading">Requests</h2>
          <button class="btn btn-primary btn-add-request" @click="openAddModal">
            <span class="mdi mdi-plus"></span>
            Add Request
          </button>
        </div>

        <div v-if="requests.length === 0" class="requests-empty">
          <span class="mdi mdi-message-text-outline"></span>
          <p>No requests found. Create your first request!</p>
        </div>

        <table v-else class="requests-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(request, index) in requests"
              :key="request.id"
              :class="{ 'is-selected': request.id === selectedRequestId, 'is-done': request.status === 'done' }"
              tabindex="0"
              @click="selectRequest(request.id)"
              @keydown.up.prevent="selectPrevious(index)"
              @keydown.down.prevent="selectNext(index)"
            >
              <td class="col-id">{{ request.id }}</td>
              <td class="col-title">{{ request.title }}</td>
              <td class="col-status">
                <span class="status-badge" :class="`status-${request.status}`">{{ request.status }}</span>
              </td>
              <td class="col-date">{{ formatDate(request.created_at) }}</td>
              <td class="col-actions">
                <div class="actions-row">
                  <button
                    v-if="request.status !== 'done'"
                    class="btn-action-sm btn-done-sm"
                    title="Mark as done"
                    @click.stop="markDoneHandler(request)"
                  >
                    <span class="mdi mdi-check"></span>
                  </button>
                  <button
                    class="btn-action-sm btn-edit-sm"
                    title="Edit request"
                    @click.stop="openEditModal(request)"
                  >
                    <span class="mdi mdi-pencil"></span>
                  </button>
                  <button
                    class="btn-action-sm btn-delete-sm"
                    title="Delete request"
                    @click.stop="deleteRequestHandler(request)"
                  >
                    <span class="mdi mdi-delete"></span>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        v-if="selectedRequest"
        class="resize-handle"
        role="separator"
        aria-orientation="vertical"
        tabindex="0"
        title="Drag to resize detail panel"
        @pointerdown="startResize"
      ></div>

      <div v-if="selectedRequest" class="requests-detail-container" :style="detailPanelStyle">
        <RequestDetail :request="selectedRequest" @markDone="markDoneHandler" />
      </div>
    </template>
  </div>
</template>

<script>
import { computed, onMounted, onUnmounted, nextTick, ref, watch } from 'vue';
import { useRequestsStore } from '@/stores/requestsStore';
import RequestDetail from './RequestDetail.vue';

const RESIZE_HANDLE_WIDTH = 10;
const MIN_TABLE_WIDTH = 420;
const MIN_DETAIL_WIDTH = 280;
const MAX_DETAIL_WIDTH = 760;
const DEFAULT_DETAIL_WIDTH = 420;

export default {
  name: 'RequestsTable',
  components: { RequestDetail },
  setup() {
    const requestsStore = useRequestsStore();
    const requestsViewRef = ref(null);
    const detailWidth = ref(DEFAULT_DETAIL_WIDTH);
    const isResizing = ref(false);
    const dragStartX = ref(0);
    const dragStartWidth = ref(detailWidth.value);

    // Delete modal state
    const showDeleteModal = ref(false);
    const requestToDelete = ref(null);
    const cancelDeleteButtonRef = ref(null);

    // Add modal state
    const showAddModal = ref(false);
    const addForm = ref({ title: '', description: '' });
    const addSubmitting = ref(false);
    const addError = ref('');
    const addTitleRef = ref(null);

    // Edit modal state
    const showEditModal = ref(false);
    const editForm = ref({ title: '', description: '' });
    const editingRequestId = ref(null);
    const editSubmitting = ref(false);
    const editError = ref('');
    const editTitleRef = ref(null);

    const requests = computed(() => requestsStore.requests);
    const selectedRequestId = computed(() => requestsStore.selectedRequestId);
    const selectedRequest = computed(() => requestsStore.selectedRequest);
    const loading = computed(() => requestsStore.loading);
    const error = computed(() => requestsStore.error);

    const detailPanelStyle = computed(() => ({
      width: `${detailWidth.value}px`
    }));

    onMounted(async () => {
      await requestsStore.loadRequests();
      if (requests.value.length > 0 && !selectedRequestId.value) {
        requestsStore.selectRequest(requests.value[0].id);
      }
      detailWidth.value = clampDetailWidth(detailWidth.value);
      window.addEventListener('resize', handleWindowResize);
    });

    onUnmounted(() => {
      window.removeEventListener('resize', handleWindowResize);
      stopResize();
    });

    function selectRequest(requestId) {
      requestsStore.selectRequest(requestId);
    }

    function selectPrevious(currentIndex) {
      if (currentIndex > 0) {
        const prev = requests.value[currentIndex - 1];
        requestsStore.selectRequest(prev.id);
        nextTick(() => focusRow(currentIndex - 1));
      }
    }

    function selectNext(currentIndex) {
      if (currentIndex < requests.value.length - 1) {
        const next = requests.value[currentIndex + 1];
        requestsStore.selectRequest(next.id);
        nextTick(() => focusRow(currentIndex + 1));
      }
    }

    function focusRow(index) {
      const rows = document.querySelectorAll('.requests-table tbody tr');
      if (rows[index]) {
        rows[index].focus();
      }
    }

    // Mark as Done
    async function markDoneHandler(request) {
      try {
        await requestsStore.markRequestDone(request.id);
      } catch (e) {
        console.error('[Requests] Mark as done failed:', e);
      }
    }

    // Delete
    function deleteRequestHandler(request) {
      requestToDelete.value = { id: request.id, title: request.title };
      showDeleteModal.value = true;
    }

    function cancelDelete() {
      showDeleteModal.value = false;
      requestToDelete.value = null;
    }

    async function confirmDelete() {
      if (!requestToDelete.value) return;
      const id = requestToDelete.value.id;
      cancelDelete();
      try {
        await requestsStore.deleteRequest(id);
      } catch (e) {
        console.error('[Requests] Delete failed:', e);
      }
    }

    // Add
    function openAddModal() {
      addForm.value = { title: '', description: '' };
      addError.value = '';
      showAddModal.value = true;
    }

    function cancelAdd() {
      if (addSubmitting.value) return;
      showAddModal.value = false;
    }

    async function submitAdd() {
      if (addSubmitting.value) return;
      const title = addForm.value.title.trim();
      if (!title) {
        addError.value = 'Title is required.';
        return;
      }
      addSubmitting.value = true;
      addError.value = '';
      try {
        const created = await requestsStore.createRequest({
          title,
          description: addForm.value.description.trim()
        });
        if (created) {
          showAddModal.value = false;
          requestsStore.selectRequest(created.id);
        } else {
          addError.value = requestsStore.error || 'Failed to create request.';
        }
      } catch (e) {
        addError.value = e.message || 'Failed to create request.';
      } finally {
        addSubmitting.value = false;
      }
    }

    // Edit
    function openEditModal(request) {
      editingRequestId.value = request.id;
      editForm.value = { title: request.title, description: request.description || '' };
      editError.value = '';
      showEditModal.value = true;
    }

    function cancelEdit() {
      if (editSubmitting.value) return;
      showEditModal.value = false;
    }

    async function submitEdit() {
      if (editSubmitting.value) return;
      const title = editForm.value.title.trim();
      if (!title) {
        editError.value = 'Title is required.';
        return;
      }
      editSubmitting.value = true;
      editError.value = '';
      try {
        const updated = await requestsStore.updateRequest(editingRequestId.value, {
          title,
          description: editForm.value.description.trim()
        });
        if (updated) {
          showEditModal.value = false;
        } else {
          editError.value = requestsStore.error || 'Failed to update request.';
        }
      } catch (e) {
        editError.value = e.message || 'Failed to update request.';
      } finally {
        editSubmitting.value = false;
      }
    }

    // Format helpers
    function formatDate(iso) {
      if (!iso) return '—';
      try {
        return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      } catch {
        return iso;
      }
    }

    // Resize
    function getContainerWidth() {
      return requestsViewRef.value?.clientWidth || window.innerWidth;
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
      if (!selectedRequest.value) return;
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

    // Focus management
    watch(showDeleteModal, (newVal) => {
      if (newVal) {
        nextTick(() => cancelDeleteButtonRef.value?.focus());
      }
    });

    watch(showAddModal, (newVal) => {
      if (newVal) {
        nextTick(() => addTitleRef.value?.focus());
      }
    });

    watch(showEditModal, (newVal) => {
      if (newVal) {
        nextTick(() => editTitleRef.value?.focus());
      }
    });

    // Clear selection when list becomes empty
    watch(requests, (newRequests) => {
      if (newRequests.length === 0 && selectedRequestId.value) {
        requestsStore.selectRequest(null);
      }
    });

    return {
      requests,
      selectedRequestId,
      selectedRequest,
      loading,
      error,
      detailPanelStyle,
      requestsViewRef,
      isResizing,
      selectRequest,
      selectPrevious,
      selectNext,
      formatDate,
      // Mark as Done
      markDoneHandler,
      // Delete
      showDeleteModal,
      requestToDelete,
      cancelDeleteButtonRef,
      deleteRequestHandler,
      cancelDelete,
      confirmDelete,
      // Add
      showAddModal,
      addForm,
      addSubmitting,
      addError,
      addTitleRef,
      openAddModal,
      cancelAdd,
      submitAdd,
      // Edit
      showEditModal,
      editForm,
      editSubmitting,
      editError,
      editTitleRef,
      openEditModal,
      cancelEdit,
      submitEdit,
      // Resize
      startResize
    };
  }
};
</script>

<style scoped>
.requests-view {
  display: flex;
  flex: 1 1 auto;
  overflow: hidden;
  background-color: #f5f7fa;
}

.requests-view.is-resizing,
.requests-view.is-resizing * {
  user-select: none;
  cursor: col-resize;
}

.requests-loading,
.requests-error,
.requests-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: #6b778c;
  font-size: 0.95rem;
}

.requests-error {
  color: #e74c3c;
}

.requests-empty .mdi {
  font-size: 3rem;
  margin-bottom: 0.75rem;
  color: #c1c7d0;
}

.requests-empty p {
  margin: 0;
}

.requests-table-container {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  min-width: 0;
}

.requests-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.requests-heading {
  margin: 0;
  font-size: 1.1rem;
  color: #2c3e50;
}

.btn-add-request {
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

.requests-detail-container {
  flex: 0 0 auto;
  min-width: 0;
  max-width: 100%;
  height: 100%;
  overflow-y: auto;
  background: #fff;
  border-left: 1px solid #e1e4e8;
}

.requests-table {
  width: 100%;
  border-collapse: collapse;
  background-color: #ffffff;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.requests-table thead {
  background-color: #f8f9fa;
  border-bottom: 2px solid #e1e4e8;
}

.requests-table th {
  padding: 0.75rem 1rem;
  text-align: left;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b778c;
}

.requests-table td {
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  color: #2c3e50;
  border-bottom: 1px solid #f1f2f4;
}

.requests-table tbody tr {
  cursor: pointer;
  transition: background-color 0.15s;
  outline: none;
}

.requests-table tbody tr:hover {
  background-color: #f8f9fa;
}

.requests-table tbody tr.is-selected {
  background-color: #e1e7ff;
}

.requests-table tbody tr:focus {
  box-shadow: inset 0 0 0 2px #4a90e2;
}

.col-id {
  font-family: monospace;
  font-size: 0.8rem;
  white-space: nowrap;
  width: 100px;
}

.col-title {
  min-width: 200px;
}

.col-status {
  width: 90px;
}

.col-date {
  white-space: nowrap;
  color: #6b778c;
  font-size: 0.8rem;
  width: 130px;
}

.col-actions {
  width: 100px;
}

.actions-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}

/* Status badges */
.status-badge {
  display: inline-block;
  padding: 0.2rem 0.55rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: capitalize;
}

.status-new {
  background-color: #e3f2fd;
  color: #1976d2;
}

.status-linked {
  background-color: #e8f5e9;
  color: #2e7d32;
}

.status-done {
  background-color: #f5f5f5;
  color: #757575;
}

/* Done row styling */
.requests-table tbody tr.is-done {
  background-color: #fafafa;
}

.requests-table tbody tr.is-done:hover {
  background-color: #f5f5f5;
}

.requests-table tbody tr.is-done .col-title {
  color: #9e9e9e;
  text-decoration: line-through;
}

/* Action buttons */
.btn-action-sm {
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

.btn-edit-sm:hover {
  background-color: #4a90e2;
  color: white;
}

.btn-delete-sm {
  margin-left: 0;
}

.btn-delete-sm:hover {
  background-color: #e74c3c;
  color: white;
}

.btn-done-sm {
  margin-left: 0;
}

.btn-done-sm:hover {
  background-color: #2e7d32;
  color: white;
}

/* Modals */
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
  max-width: 480px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.modal-delete {
  border-top: 4px solid #e74c3c;
}

.modal-add {
  border-top: 4px solid #4a90e2;
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

.form-field {
  margin-bottom: 1rem;
}

.form-label {
  display: block;
  font-size: 0.85rem;
  font-weight: 500;
  color: #2c3e50;
  margin-bottom: 0.35rem;
}

.required {
  color: #e74c3c;
}

.form-input {
  width: 100%;
  border: 1px solid #d1d9e0;
  border-radius: 6px;
  padding: 0.55rem 0.7rem;
  font-size: 0.9rem;
  box-sizing: border-box;
}

.form-input:focus {
  outline: 2px solid #4a90e2;
  outline-offset: 1px;
}

.form-textarea {
  width: 100%;
  border: 1px solid #d1d9e0;
  border-radius: 6px;
  padding: 0.55rem 0.7rem;
  font-size: 0.9rem;
  line-height: 1.4;
  resize: vertical;
  min-height: 7rem;
  box-sizing: border-box;
}

.form-textarea:focus {
  outline: 2px solid #4a90e2;
  outline-offset: 1px;
}

.form-error {
  margin-top: 0.5rem;
  margin-bottom: 0;
  font-size: 0.85rem;
  color: #e74c3c;
}

.request-info {
  background-color: #f8f9fa;
  border-radius: 6px;
  padding: 1rem;
  margin-bottom: 1rem;
  border-left: 3px solid #4a90e2;
}

.request-id {
  display: block;
  font-family: monospace;
  font-size: 0.85rem;
  color: #6b778c;
  margin-bottom: 0.25rem;
}

.request-title {
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

/* Buttons */
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

.btn-secondary:hover:not(:disabled) {
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

.btn-primary:hover:not(:disabled) {
  background-color: #357abd;
}

.btn-primary:focus {
  outline: 2px solid #4a90e2;
  outline-offset: 2px;
}
</style>
