<template>
  <div class="view-container">
    <div class="view-header">
      <div>
        <h1>Class Diagrams</h1>
        <p class="text-muted">UML class diagrams saved in docs/Class Diagrams/</p>
      </div>
      <div v-if="!showNewInput">
        <button class="new-btn" @click="showNewInput = true">
          <span class="mdi mdi-plus"></span> New Diagram
        </button>
      </div>
      <div v-else class="new-input-row">
        <input
          :ref="el => { if (el) { el.focus(); } }"
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
    <div v-else-if="diagrams.length === 0" class="empty">No class diagrams yet. Click "New Diagram" to create one.</div>

    <div v-else class="diagram-list">
      <div v-for="d in diagrams" :key="d.path" class="diagram-card" @click="openDiagram(d)">
        <span class="mdi mdi-shape-outline card-icon"></span>
        <span class="card-name">{{ d.name.replace('.mmd', '') }}</span>
        <div class="card-actions" @click.stop>
          <button class="icon-btn delete-icon" title="Delete" @click="deleteDiagram(d)">
            <span class="mdi mdi-delete"></span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';

const DEFAULT_TEMPLATE = `class "ClassName" @200,150
  attr "+ id: int"
  attr "+ name: String"
  op "+ getName(): String"
  op "+ setName(n: String): void"
`;

export default {
  name: 'ClassDiagramsView',
  setup() {
    const router = useRouter();
    const diagrams = ref([]);
    const loading = ref(true);
    const showNewInput = ref(false);
    const newName = ref('');

    async function loadDiagrams() {
      try {
        diagrams.value = await window.electron.ipcRenderer.invoke('filetree:scanClassDiagrams');
      } catch (e) { console.error(e); }
      finally { loading.value = false; }
    }

    async function onCreate() {
      if (!newName.value.trim()) return;
      const safeName = newName.value.trim().replace(/[<>:"/\\|?*]/g, '_');
      const filePath = 'Class Diagrams/' + safeName + '.mmd';
      try {
        await window.electron.ipcRenderer.invoke('filetree:writeFile', filePath, DEFAULT_TEMPLATE);
        showNewInput.value = false;
        newName.value = '';
        router.push('/class-diagram/edit/' + encodeURIComponent(filePath));
      } catch (e) { console.error(e); }
    }

    function openDiagram(d) {
      router.push('/class-diagram/edit/' + encodeURIComponent(d.path));
    }

    async function deleteDiagram(d) {
      try {
        await window.electron.ipcRenderer.invoke('filetree:deleteFile', d.path);
        diagrams.value = diagrams.value.filter(x => x.path !== d.path);
      } catch (e) { console.error(e); }
    }

    onMounted(loadDiagrams);
    return { diagrams, loading, showNewInput, newName, onCreate, openDiagram, deleteDiagram };
  },
};
</script>

<style scoped>
.view-container { max-width: 1200px; padding: 1rem; }
.view-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; }
.view-header h1 { margin: 0 0 0.25rem; color: var(--text-color); }
.new-btn { display: flex; align-items: center; gap: 0.35rem; background: var(--primary-color); border: none; border-radius: var(--border-radius); color: #fff; cursor: pointer; font-size: 0.9rem; padding: 0.55rem 1.2rem; white-space: nowrap; transition: var(--transition); }
.new-btn:hover { background: var(--primary-hover); }
.new-input-row { display: flex; align-items: center; gap: 0.5rem; }
.name-input { padding: 0.4rem 0.6rem; border: 1px solid var(--border-color); border-radius: var(--border-radius); background: var(--card-bg); color: var(--text-color); font-size: 0.9rem; outline: none; }
.name-input:focus { border-color: var(--primary-color); }
.cancel-btn { background: transparent; border: 1px solid var(--border-color); border-radius: var(--border-radius); color: var(--text-color); cursor: pointer; font-size: 0.9rem; padding: 0.5rem 0.9rem; }
.loading, .empty { color: var(--text-muted); margin-top: 1rem; }
.diagram-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 0.75rem; }
.diagram-card { display: flex; align-items: center; gap: 0.5rem; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--border-radius); padding: 0.7rem 0.75rem; cursor: pointer; box-shadow: var(--box-shadow); transition: transform 0.15s ease, box-shadow 0.15s ease; }
.diagram-card:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
.card-icon { font-size: 1.2rem; color: var(--primary-color); flex-shrink: 0; }
.card-name { flex: 1; font-size: 0.9rem; color: var(--text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card-actions { flex-shrink: 0; }
.icon-btn { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; background: none; border: none; border-radius: 3px; color: var(--text-muted); cursor: pointer; }
.icon-btn:hover { color: var(--text-color); background: rgba(255,255,255,0.08); }
.delete-icon:hover { color: #ef4444; }
</style>
