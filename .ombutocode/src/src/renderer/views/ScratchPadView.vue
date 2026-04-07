<template>
  <div class="view-container">
    <header class="title-bar">
      <div class="title-copy">
        <p class="folder-path">docs / ScratchPad /</p>
        <h1 class="file-name">{{ activeNote ? activeNote.replace('.txt', '') : 'Scratch Pad' }}</h1>
      </div>
      <div class="title-actions">
        <button v-if="!activeNote" class="tool-btn" @click="startCreate">
          <span class="mdi mdi-plus"></span> New Note
        </button>
        <template v-if="activeNote">
          <span v-if="saved" class="saved-indicator">Saved</span>
          <button class="save-btn" @click="onSave" :disabled="saving || !dirty">
            {{ saving ? 'Saving...' : 'Save' }}
          </button>
          <button class="tool-btn delete-tool-btn" @click="onDelete" title="Delete note">
            <span class="mdi mdi-delete"></span>
          </button>
          <button class="cancel-btn" @click="closeNote">Back</button>
        </template>
      </div>
    </header>

    <div v-if="loading" class="state-card"><p>Loading...</p></div>

    <!-- Note list -->
    <div v-else-if="!activeNote" class="list-container">
      <!-- Create input -->
      <div v-if="showCreate" class="create-row">
        <input
          :ref="el => { if (el) el.focus() }"
          v-model="newName"
          class="name-input"
          placeholder="Note name"
          @keyup.enter="createNote"
          @keyup.escape="showCreate = false"
        />
        <button class="save-btn" @click="createNote" :disabled="!newName.trim()">Create</button>
        <button class="cancel-btn" @click="showCreate = false">Cancel</button>
      </div>

      <div v-if="notes.length === 0 && !showCreate" class="empty">
        No notes yet. Click "New Note" to create one.
      </div>

      <div v-else class="notes-list">
        <div v-for="n in notes" :key="n.path" class="note-card" @click="openNote(n)">
          <span class="mdi mdi-note-text note-icon"></span>
          <span class="note-name">{{ n.name.replace('.txt', '') }}</span>
          <button class="icon-btn delete-icon" title="Delete" @click.stop="deleteNote(n)">
            <span class="mdi mdi-delete"></span>
          </button>
        </div>
      </div>
    </div>

    <!-- Note editor -->
    <div v-else class="editor-container">
      <textarea
        ref="editorEl"
        v-model="noteContent"
        class="note-editor"
        @input="dirty = true; saved = false"
      ></textarea>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue';

const DIR = 'ScratchPad';

export default {
  name: 'ScratchPadView',
  setup() {
    const loading = ref(true);
    const notes = ref([]);
    const activeNote = ref(null);
    const noteContent = ref('');
    const dirty = ref(false);
    const saving = ref(false);
    const saved = ref(false);
    const showCreate = ref(false);
    const newName = ref('');
    const editorEl = ref(null);

    let originalContent = '';
    let savedTimeout = null;
    let activePath = '';

    async function loadNotes() {
      loading.value = true;
      try {
        const tree = await window.electron.ipcRenderer.invoke('filetree:scan');
        const spFolder = tree.children?.find(c => c.name === 'ScratchPad');
        notes.value = (spFolder?.children || []).filter(f => f.type === 'file' && f.name.endsWith('.txt'));
      } catch (e) { notes.value = []; }
      finally { loading.value = false; }
    }

    function startCreate() {
      showCreate.value = true;
      newName.value = '';
    }

    async function createNote() {
      if (!newName.value.trim()) return;
      const safeName = newName.value.trim().replace(/[<>:"/\\|?*]/g, '_');
      const path = DIR + '/' + safeName + '.txt';
      try {
        await window.electron.ipcRenderer.invoke('filetree:writeFile', path, '');
        showCreate.value = false;
        newName.value = '';
        activePath = path;
        activeNote.value = safeName + '.txt';
        noteContent.value = '';
        originalContent = '';
        dirty.value = false;
      } catch (e) { console.error(e); }
    }

    async function openNote(n) {
      activePath = n.path;
      activeNote.value = n.name;
      try {
        noteContent.value = await window.electron.ipcRenderer.invoke('filetree:readFile', n.path);
        originalContent = noteContent.value;
        dirty.value = false;
        saved.value = false;
      } catch (e) {
        noteContent.value = '';
        originalContent = '';
      }
    }

    function closeNote() {
      activeNote.value = null;
      activePath = '';
      dirty.value = false;
      saved.value = false;
      loadNotes();
    }

    async function onSave() {
      saving.value = true;
      try {
        await window.electron.ipcRenderer.invoke('filetree:writeFile', activePath, noteContent.value);
        originalContent = noteContent.value;
        dirty.value = false;
        saved.value = true;
        if (savedTimeout) clearTimeout(savedTimeout);
        savedTimeout = setTimeout(() => { saved.value = false; }, 2000);
      } catch (e) { console.error(e); }
      finally { saving.value = false; }
    }

    async function onDelete() {
      try {
        await window.electron.ipcRenderer.invoke('filetree:deleteFile', activePath);
        closeNote();
      } catch (e) { console.error(e); }
    }

    async function deleteNote(n) {
      try {
        await window.electron.ipcRenderer.invoke('filetree:deleteFile', n.path);
        notes.value = notes.value.filter(x => x.path !== n.path);
      } catch (e) { console.error(e); }
    }

    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && activeNote.value) {
        e.preventDefault();
        if (dirty.value && !saving.value) onSave();
      }
    }

    onMounted(() => { loadNotes(); window.addEventListener('keydown', onKeyDown); });
    onUnmounted(() => { if (savedTimeout) clearTimeout(savedTimeout); window.removeEventListener('keydown', onKeyDown); });

    return {
      loading, notes, activeNote, noteContent, dirty, saving, saved,
      showCreate, newName, editorEl,
      startCreate, createNote, openNote, closeNote,
      onSave, onDelete, deleteNote,
    };
  },
};
</script>

<style scoped>
.view-container { display: flex; flex-direction: column; height: 100%; }

.title-bar { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1.25rem; background: var(--card-bg); border-bottom: 1px solid var(--border-color); flex-shrink: 0; gap: 0.75rem; }
.title-copy { min-width: 0; }
.folder-path { color: var(--text-muted); font-size: 0.8rem; margin: 0 0 0.15rem; }
.file-name { color: var(--text-color); font-size: 1.25rem; margin: 0; }
.title-actions { display: flex; align-items: center; gap: 0.5rem; }

.tool-btn { display: flex; align-items: center; gap: 0.25rem; background: none; border: 1px solid var(--border-color); border-radius: var(--border-radius); color: var(--text-color); cursor: pointer; font-size: 0.8rem; padding: 0.35rem 0.6rem; transition: var(--transition); }
.tool-btn:hover { border-color: var(--primary-color); color: var(--primary-color); }
.delete-tool-btn:hover { border-color: #ef4444; color: #ef4444; }
.saved-indicator { color: #16a34a; font-size: 0.8rem; font-weight: 500; }
.save-btn { background: #16a34a; border: none; border-radius: var(--border-radius); color: #fff; cursor: pointer; font-size: 0.85rem; font-weight: 600; padding: 0.4rem 1rem; }
.save-btn:hover:not(:disabled) { background: #15803d; }
.save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.cancel-btn { background: transparent; border: 1px solid var(--border-color); border-radius: var(--border-radius); color: var(--text-color); cursor: pointer; font-size: 0.85rem; padding: 0.4rem 0.9rem; }
.cancel-btn:hover { border-color: var(--text-muted); }

.state-card { padding: 2rem; color: var(--text-muted); }

/* List */
.list-container { flex: 1; overflow: auto; padding: 1rem 1.25rem; }
.create-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; }
.name-input { padding: 0.4rem 0.6rem; border: 1px solid var(--border-color); border-radius: var(--border-radius); background: var(--card-bg); color: var(--text-color); font-size: 0.9rem; outline: none; flex: 1; max-width: 300px; }
.name-input:focus { border-color: var(--primary-color); }
.empty { color: var(--text-muted); }

.notes-list { display: flex; flex-direction: column; gap: 0.4rem; }
.note-card { display: flex; align-items: center; gap: 0.5rem; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--border-radius); padding: 0.6rem 0.9rem; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s; }
.note-card:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
.note-icon { font-size: 1.1rem; color: var(--primary-color); flex-shrink: 0; }
.note-name { flex: 1; font-size: 0.9rem; color: var(--text-color); }
.icon-btn { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; background: none; border: none; border-radius: 3px; color: var(--text-muted); cursor: pointer; }
.icon-btn:hover { color: var(--text-color); background: rgba(255,255,255,0.08); }
.delete-icon:hover { color: #ef4444; }

/* Editor */
.editor-container { flex: 1; display: flex; padding: 0; }
.note-editor {
  flex: 1;
  background: var(--card-bg);
  color: var(--text-color);
  border: none;
  padding: 1rem 1.25rem;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.9rem;
  line-height: 1.6;
  resize: none;
  outline: none;
}
</style>
