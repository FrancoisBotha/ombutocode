<template>
  <div class="view-container">
    <div class="view-header">
      <div>
        <h1>Use Case Diagrams</h1>
        <p class="text-muted">UML use case diagrams saved in docs/Use Case Diagrams/</p>
      </div>
      <div v-if="!showNewInput">
        <button class="new-btn" @click="showNewInput = true">
          <span class="mdi mdi-plus"></span> New Diagram
        </button>
      </div>
      <div v-else class="new-input-row">
        <input
          ref="newNameInput"
          v-model="newName"
          class="name-input"
          placeholder="Diagram name"
          @keyup.enter="onCreate"
          @keyup.escape="showNewInput = false"
        />
        <button class="new-btn" @click="onCreate" :disabled="!newName.trim()">Create</button>
        <button class="cancel-btn" @click="showNewInput = false">Cancel</button>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading diagrams...</div>
    <div v-else-if="diagrams.length === 0" class="empty">
      No diagrams yet. Click "New Diagram" to create one.
    </div>

    <div v-else class="diagram-list">
      <div
        v-for="d in diagrams"
        :key="d.path"
        class="diagram-card"
        @click="openDiagram(d)"
      >
        <span class="mdi mdi-vector-polygon card-icon"></span>

        <!-- Normal display -->
        <span v-if="renamingPath !== d.path" class="card-name">
          {{ d.name.replace('.mmd', '') }}
        </span>

        <!-- Rename input -->
        <input
          v-if="renamingPath === d.path"
          :ref="el => { if (el) renameInputEl = el }"
          v-model="renameValue"
          class="name-input rename-input"
          @click.stop
          @keyup.enter.stop="confirmRename(d)"
          @keyup.escape.stop="cancelRename"
        />

        <div class="card-actions" @click.stop>
          <template v-if="renamingPath === d.path">
            <button class="icon-btn" title="Confirm" @click="confirmRename(d)">
              <span class="mdi mdi-check"></span>
            </button>
            <button class="icon-btn" title="Cancel" @click="cancelRename">
              <span class="mdi mdi-close"></span>
            </button>
          </template>
          <template v-else>
            <button class="icon-btn" title="Rename" @click="startRename(d)">
              <span class="mdi mdi-pencil"></span>
            </button>
            <button class="icon-btn delete-icon" title="Delete" @click="deleteDiagram(d)">
              <span class="mdi mdi-delete"></span>
            </button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, nextTick, onMounted } from 'vue';
import { useRouter } from 'vue-router';

const DEFAULT_TEMPLATE = `actor User

usecase "Use Case 1"
usecase "Use Case 2"

User --> "Use Case 1"
User --> "Use Case 2"
`;

export default {
  name: 'UseCaseDiagramsView',
  setup() {
    const router = useRouter();
    const diagrams = ref([]);
    const loading = ref(true);
    const showNewInput = ref(false);
    const newName = ref('');
    const newNameInput = ref(null);
    const renamingPath = ref(null);
    const renameValue = ref('');
    let renameInputEl = null;

    async function loadDiagrams() {
      try {
        diagrams.value = await window.electron.ipcRenderer.invoke('filetree:scanUseCaseDiagrams');
      } catch (e) {
        console.error('Failed to load diagrams:', e);
      } finally {
        loading.value = false;
      }
    }

    async function onCreate() {
      if (!newName.value.trim()) return;
      const safeName = newName.value.trim().replace(/[<>:"/\\|?*]/g, '_');
      const filePath = 'Use Case Diagrams/' + safeName + '.mmd';
      try {
        await window.electron.ipcRenderer.invoke('filetree:writeFile', filePath, DEFAULT_TEMPLATE);
        showNewInput.value = false;
        newName.value = '';
        if (window.__planNavigate) {
          window.__planNavigate('plan-use-case-diagram-editor', filePath);
        } else {
          router.push('/use-case-diagram/edit/' + encodeURIComponent(filePath));
        }
      } catch (e) {
        console.error('Failed to create diagram:', e);
      }
    }

    function openDiagram(d) {
      if (renamingPath.value) return;
      if (window.__planNavigate) {
        window.__planNavigate('plan-use-case-diagram-editor', d.path);
      } else {
        router.push('/use-case-diagram/edit/' + encodeURIComponent(d.path));
      }
    }

    async function deleteDiagram(d) {
      try {
        await window.electron.ipcRenderer.invoke('filetree:deleteFile', d.path);
        diagrams.value = diagrams.value.filter(x => x.path !== d.path);
      } catch (e) {
        console.error('Failed to delete diagram:', e);
      }
    }

    function startRename(d) {
      renamingPath.value = d.path;
      renameValue.value = d.name.replace('.mmd', '');
      nextTick(() => {
        if (renameInputEl) {
          renameInputEl.focus();
          renameInputEl.select();
        }
      });
    }

    function cancelRename() {
      renamingPath.value = null;
      renameValue.value = '';
    }

    async function confirmRename(d) {
      if (!renamingPath.value) return;
      const safeName = renameValue.value.trim().replace(/[<>:"/\\|?*]/g, '_');
      if (!safeName) {
        cancelRename();
        return;
      }
      const newPath = 'Use Case Diagrams/' + safeName + '.mmd';
      if (newPath === d.path) {
        cancelRename();
        return;
      }
      try {
        await window.electron.ipcRenderer.invoke('filetree:renameFile', d.path, newPath);
        renamingPath.value = null;
        renameValue.value = '';
        await loadDiagrams();
      } catch (e) {
        console.error('Failed to rename diagram:', e);
        cancelRename();
      }
    }

    onMounted(loadDiagrams);

    return {
      diagrams, loading, showNewInput, newName, newNameInput,
      renamingPath, renameValue,
      get renameInputEl() { return renameInputEl; },
      set renameInputEl(v) { renameInputEl = v; },
      onCreate, openDiagram, deleteDiagram,
      startRename, cancelRename, confirmRename,
    };
  },
};
</script>

<style scoped>
.view-container {
  max-width: 1200px;
  padding: 1rem;
}

.view-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.view-header h1 {
  margin: 0 0 0.25rem;
  color: var(--text-color);
}

.new-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: var(--primary-color);
  border: none;
  border-radius: var(--border-radius);
  color: #fff;
  cursor: pointer;
  font-size: 0.9rem;
  padding: 0.55rem 1.2rem;
  white-space: nowrap;
  transition: var(--transition);
}

.new-btn:hover {
  background: var(--primary-hover);
}

.new-input-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.name-input {
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  background: var(--card-bg);
  color: var(--text-color);
  font-size: 0.9rem;
  outline: none;
}

.name-input:focus {
  border-color: var(--primary-color);
}

.cancel-btn {
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  color: var(--text-color);
  cursor: pointer;
  font-size: 0.9rem;
  padding: 0.5rem 0.9rem;
  transition: var(--transition);
}

.cancel-btn:hover {
  border-color: var(--text-muted);
}

.loading, .empty {
  color: var(--text-muted);
  margin-top: 1rem;
}

.diagram-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0.75rem;
}

.diagram-card {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 0.7rem 0.75rem;
  cursor: pointer;
  box-shadow: var(--box-shadow);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.diagram-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.card-icon {
  font-size: 1.2rem;
  color: var(--primary-color);
  flex-shrink: 0;
}

.card-name {
  flex: 1;
  min-width: 0;
  font-size: 0.9rem;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rename-input {
  flex: 1;
  min-width: 0;
  border-color: var(--primary-color);
}

.card-actions {
  display: flex;
  gap: 0.15rem;
  flex-shrink: 0;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  background: none;
  border: none;
  border-radius: 3px;
  color: var(--text-muted);
  cursor: pointer;
  transition: var(--transition);
}

.icon-btn:hover {
  color: var(--text-color);
  background: rgba(255, 255, 255, 0.08);
}

.delete-icon:hover {
  color: #ef4444;
}
</style>
