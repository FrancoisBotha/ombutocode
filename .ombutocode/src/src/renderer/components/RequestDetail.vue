<template>
  <aside class="request-detail">
    <div class="detail-header">
      <span class="detail-id">{{ request.id }}</span>
      <span class="status-badge" :class="`status-${request.status}`">{{ request.status }}</span>
    </div>
    <h3 class="detail-title" :class="{ 'is-done': request.status === 'done' }">{{ request.title }}</h3>

    <div v-if="request.status !== 'done'" class="detail-actions">
      <button class="btn-mark-done" @click="$emit('markDone', request.id)">
        <span class="mdi mdi-check"></span>
        Mark as Done
      </button>
    </div>

    <div class="detail-section">
      <div class="detail-label">Description</div>
      <div class="detail-value detail-description">
        {{ request.description || '—' }}
      </div>
    </div>

    <div v-if="request.status === 'linked' && request.feature_ref" class="detail-section">
      <div class="detail-label">Linked Feature</div>
      <div class="detail-value detail-feature-ref">
        {{ request.feature_ref }}
      </div>
    </div>

    <div v-if="request.status === 'new'" class="detail-section detail-generate-placeholder">
      <div class="detail-label">Generate Feature</div>
      <div class="detail-value detail-placeholder-text">
        <span class="mdi mdi-robot-outline"></span>
        Agent-driven feature generation coming soon
      </div>
    </div>

    <div class="detail-meta">
      <div class="detail-meta-row">
        <span class="detail-meta-label">Created</span>
        <span class="detail-meta-value">{{ formatDateLong(request.created_at) }}</span>
      </div>
      <div class="detail-meta-row">
        <span class="detail-meta-label">Updated</span>
        <span class="detail-meta-value">{{ formatDateLong(request.updated_at) }}</span>
      </div>
    </div>
  </aside>
</template>

<script>
export default {
  name: 'RequestDetail',
  props: {
    request: {
      type: Object,
      required: true
    }
  },
  emits: ['markDone'],
  setup() {
    function formatDateLong(iso) {
      if (!iso) return '—';
      try {
        return new Date(iso).toLocaleString(undefined, {
          year: 'numeric', month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit'
        });
      } catch {
        return iso;
      }
    }

    return { formatDateLong };
  }
};
</script>

<style scoped>
.request-detail {
  padding: 1.5rem;
  overflow-y: auto;
  height: 100%;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.detail-id {
  font-family: monospace;
  font-size: 0.8rem;
  color: #6b778c;
}

.detail-title {
  margin: 0 0 1.25rem 0;
  font-size: 1rem;
  font-weight: 600;
  color: #2c3e50;
  line-height: 1.4;
}

.detail-section {
  margin-bottom: 1.25rem;
}

.detail-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #6b778c;
  margin-bottom: 0.35rem;
}

.detail-value {
  font-size: 0.875rem;
  color: #2c3e50;
  line-height: 1.5;
}

.detail-description {
  white-space: pre-wrap;
  word-break: break-word;
}

.detail-feature-ref {
  font-family: monospace;
  font-size: 0.8rem;
  color: #2e7d32;
  background: #e8f5e9;
  padding: 0.35rem 0.6rem;
  border-radius: 4px;
  word-break: break-all;
}

.detail-generate-placeholder {
  background: #f8f9fa;
  border-radius: 6px;
  padding: 0.75rem;
  border: 1px dashed #d6dbe3;
}

.detail-placeholder-text {
  color: #a0aab4;
  font-size: 0.82rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.detail-placeholder-text .mdi {
  font-size: 1.1rem;
}

.detail-meta {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid #f1f2f4;
}

.detail-meta-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}

.detail-meta-label {
  font-size: 0.75rem;
  color: #6b778c;
  flex-shrink: 0;
}

.detail-meta-value {
  font-size: 0.75rem;
  color: #2c3e50;
  text-align: right;
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

.detail-title.is-done {
  color: #9e9e9e;
  text-decoration: line-through;
}

.detail-actions {
  margin-bottom: 1.25rem;
}

.btn-mark-done {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background-color: #e8f5e9;
  color: #2e7d32;
  border: 1px solid #c8e6c9;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-mark-done:hover {
  background-color: #2e7d32;
  color: white;
  border-color: #2e7d32;
}

.btn-mark-done:focus {
  outline: 2px solid #2e7d32;
  outline-offset: 2px;
}
</style>
