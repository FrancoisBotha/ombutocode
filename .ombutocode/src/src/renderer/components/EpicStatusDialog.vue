<template>
  <div class="es-overlay" @click.self="$emit('close')">
    <div class="es-modal">
      <div class="es-header">
        <div class="es-title-group">
          <span class="mdi mdi-flag-outline es-icon"></span>
          <div>
            <h2 class="es-title">Update epic status</h2>
            <p class="es-subtitle">{{ epic.title || epic.fileName }}</p>
          </div>
        </div>
        <button class="es-close" title="Close" @click="$emit('close')">
          <span class="mdi mdi-close"></span>
        </button>
      </div>

      <div class="es-body">
        <label class="es-label" for="es-status">Status</label>
        <select id="es-status" class="es-select" v-model="draft" :disabled="saving">
          <option v-for="s in options" :key="s" :value="s">{{ s }}</option>
        </select>
        <p class="es-hint">
          Lifecycle: NEW → TICKETS → BUILDING → DONE. DONE is assigned by the
          owner, not automatically.
        </p>
        <p v-if="error" class="es-error">
          <span class="mdi mdi-alert-circle-outline"></span> {{ error }}
        </p>
      </div>

      <div class="es-footer">
        <button class="es-btn" :disabled="saving" @click="$emit('close')">Cancel</button>
        <button
          class="es-btn es-btn-primary"
          :disabled="saving || draft === (epic.status || '')"
          @click="save"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed } from 'vue';
import { useEpicStore } from '@/stores/epicStore';

// Epic lifecycle statuses (see CLAUDE.md): NEW → TICKETS → BUILDING → DONE
const EPIC_STATUSES = ['NEW', 'TICKETS', 'BUILDING', 'DONE'];

export default {
  name: 'EpicStatusDialog',
  props: {
    epic: { type: Object, required: true },
  },
  emits: ['close', 'saved'],
  setup(props, { emit }) {
    const epicStore = useEpicStore();
    const draft = ref(props.epic.status || '');
    const saving = ref(false);
    const error = ref('');

    // Offer the canonical lifecycle, plus whatever the file actually says when
    // that isn't one of them (legacy lowercase values, 'implemented', ...) so
    // opening the dialog can never silently rewrite an unrecognised status.
    const options = computed(() => {
      const current = props.epic.status || '';
      return current && !EPIC_STATUSES.includes(current)
        ? [current, ...EPIC_STATUSES]
        : EPIC_STATUSES;
    });

    async function save() {
      if (draft.value === (props.epic.status || '')) return;
      saving.value = true;
      error.value = '';
      try {
        await epicStore.updateEpicStatus(props.epic, draft.value);
        emit('saved', draft.value);
        emit('close');
      } catch (e) {
        error.value = e?.message || 'Failed to update the epic status.';
      } finally {
        saving.value = false;
      }
    }

    return { draft, options, saving, error, save };
  },
};
</script>

<style scoped>
.es-overlay {
  position: fixed;
  inset: 0;
  background: rgba(8, 14, 24, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 1400;
}

.es-modal {
  width: 90vw;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  background: var(--card-bg, #fff);
  color: var(--text-color, #2c3e50);
  border: 1px solid var(--border-color, #e1e4e8);
  border-radius: 8px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}

.es-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border-color, #e1e4e8);
}
.es-title-group { display: flex; align-items: flex-start; gap: 0.6rem; min-width: 0; }
.es-icon { font-size: 1.3rem; color: #6dd4a0; margin-top: 0.1rem; }
.es-title { margin: 0; font-size: 1.02rem; }
.es-subtitle {
  margin: 0.15rem 0 0;
  font-size: 0.8rem;
  color: var(--text-muted, #6b778c);
  word-break: break-word;
}
.es-close {
  background: transparent;
  border: none;
  color: var(--text-muted, #6b778c);
  cursor: pointer;
  font-size: 1.1rem;
  padding: 0.2rem;
  border-radius: 4px;
  flex-shrink: 0;
}
.es-close:hover { background: var(--secondary-color, #f1f2f4); color: var(--text-color, #2c3e50); }

.es-body { padding: 1rem 1.25rem; }

.es-label {
  display: block;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted, #6b778c);
  margin-bottom: 0.35rem;
}
.es-select {
  width: 100%;
  padding: 0.45rem 0.55rem;
  border: 1px solid var(--border-color, #e1e4e8);
  border-radius: 5px;
  background: var(--bg-color, #fff);
  color: var(--text-color, #2c3e50);
  font-size: 0.88rem;
  cursor: pointer;
  outline: none;
}
.es-select:focus { border-color: #6dd4a0; }
.es-hint {
  margin: 0.6rem 0 0;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--text-muted, #6b778c);
}
.es-error {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0.6rem 0 0;
  font-size: 0.8rem;
  color: #e06060;
}

.es-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-top: 1px solid var(--border-color, #e1e4e8);
}
.es-btn {
  background: var(--secondary-color, #f1f2f4);
  color: var(--text-color, #2c3e50);
  border: 1px solid var(--border-color, #e1e4e8);
  border-radius: 6px;
  padding: 0.4rem 1rem;
  font-size: 0.85rem;
  cursor: pointer;
}
.es-btn:hover:not(:disabled) { background: var(--border-color, #e1e4e8); }
.es-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.es-btn-primary {
  background: #6dd4a0;
  border-color: #6dd4a0;
  color: #0A1220;
  font-weight: 500;
}
.es-btn-primary:hover:not(:disabled) { background: #86efac; border-color: #86efac; }
</style>
