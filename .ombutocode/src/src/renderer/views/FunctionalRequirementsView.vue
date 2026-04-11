<template>
  <div class="view-container">
    <header class="title-bar">
      <div class="title-copy">
        <p class="folder-path">docs / Functional Requirements /</p>
        <h1 class="file-name">Functional Requirements</h1>
      </div>
      <div class="title-actions">
        <button class="tool-btn" @click="addRow" title="Add Functional Requirement">
          <span class="mdi mdi-plus"></span> Add FR
        </button>
        <button class="tool-btn" @click="exportToExcel" title="Export to Excel">
          <span class="mdi mdi-file-export-outline"></span> Export
        </button>
        <button class="tool-btn" @click="importFromExcel" title="Import from Excel">
          <span class="mdi mdi-file-import-outline"></span> Import
        </button>
        <div class="spacer"></div>
        <span v-if="saved" class="saved-indicator">Saved</span>
        <button class="save-btn" @click="onSave" :disabled="saving || !dirty">
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
      </div>
    </header>

    <div v-if="loading" class="state-card"><p>Loading...</p></div>

    <div v-else class="table-container">
      <table class="fr-table">
        <thead>
          <tr>
            <th class="col-id">ID</th>
            <th class="col-subsystem">Sub-System</th>
            <th class="col-desc">Description</th>
            <th class="col-status">Status</th>
            <th class="col-epic">Epic</th>
            <th class="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="rows.length === 0">
            <td colspan="6" class="empty-row">No functional requirements yet. Click "Add FR" to create one.</td>
          </tr>
          <tr
            v-for="(row, i) in rows"
            :key="row.id"
            :class="{ 'editing-row': editingIdx === i }"
          >
            <td class="col-id"><span class="id-badge">{{ row.id }}</span></td>

            <td class="col-subsystem">
              <template v-if="editingIdx === i">
                <select v-model="editRow.subsystem" class="cell-select">
                  <option value="">-- None --</option>
                  <option v-for="ss in subsystems" :key="ss" :value="ss">{{ ss }}</option>
                </select>
              </template>
              <span v-else class="cell-text" @dblclick="startEdit(i)">{{ row.subsystem || '—' }}</span>
            </td>

            <td class="col-desc">
              <template v-if="editingIdx === i">
                <input v-model="editRow.description" class="cell-input" placeholder="Description" />
              </template>
              <span v-else class="cell-text" @dblclick="startEdit(i)">{{ row.description || '—' }}</span>
            </td>

            <td class="col-status">
              <template v-if="editingIdx === i">
                <select v-model="editRow.status" class="cell-select">
                  <option v-for="s in STATUSES" :key="s" :value="s">{{ s }}</option>
                </select>
              </template>
              <span v-else class="cell-text status-badge" :class="'status-' + row.status.toLowerCase().replace(/\s+/g, '-')" @dblclick="startEdit(i)">{{ row.status }}</span>
            </td>

            <td class="col-epic">
              <span class="cell-text epic-ref">{{ row.epic || '—' }}</span>
            </td>

            <td class="col-actions">
              <template v-if="editingIdx === i">
                <button class="row-btn" title="Save" @click="commitEdit"><span class="mdi mdi-check"></span></button>
                <button class="row-btn" title="Cancel" @click="cancelEdit"><span class="mdi mdi-close"></span></button>
              </template>
              <template v-else>
                <button class="row-btn" title="Edit" @click="startEdit(i)"><span class="mdi mdi-pencil"></span></button>
                <button class="row-btn delete-btn" title="Delete" @click="deleteRow(i)"><span class="mdi mdi-delete"></span></button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

  </div>
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue';

const FILE_PATH = 'Functional Requirements/FunctionalRequirements.md';
const STRUCTURE_PATH = 'Structure/ProjectStructure.md';
const STATUSES = ['Draft', 'Proposed', 'Approved', 'Implemented', 'Verified', 'Deprecated'];

function parseTable(content) {
  const rows = [];
  const lines = content.split('\n');
  let inTable = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed.split('|').map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length);
    if (cells.length < 4) continue;
    if (cells[0] === 'ID') { inTable = true; continue; }
    if (cells[0].match(/^-+$/)) continue;
    if (inTable) rows.push({ id: cells[0], subsystem: cells[1], description: cells[2], status: cells[3] || 'Draft', epic: cells[4] || '' });
  }
  return rows;
}

function serializeTable(rows) {
  let md = '# Functional Requirements\n\n';
  md += '| ID | Sub-System | Description | Status | Epic |\n';
  md += '|----|------------|-------------|--------|------|\n';
  for (const r of rows) md += `| ${r.id} | ${r.subsystem} | ${r.description} | ${r.status} | ${r.epic || ''} |\n`;
  return md;
}

function nextId(rows) {
  let max = 0;
  for (const r of rows) { const m = r.id.match(/^FR-(\d+)$/); if (m) { const n = parseInt(m[1]); if (n > max) max = n; } }
  return 'FR-' + String(max + 1).padStart(3, '0');
}

function parseSubsystems(content) {
  const subs = [];
  for (const line of content.split('\n')) { const m = line.trim().match(/^-\s+name:\s*"?([^"]*)"?\s*$/); if (m) subs.push(m[1]); }
  return subs;
}

export default {
  name: 'FunctionalRequirementsView',
  setup() {
    const loading = ref(true);
    const saving = ref(false);
    const saved = ref(false);
    const dirty = ref(false);
    const rows = ref([]);
    const subsystems = ref([]);
    const editingIdx = ref(null);
    const editRow = ref({ id: '', subsystem: '', description: '', status: 'Draft' });
    let originalContent = '';
    let savedTimeout = null;

    async function loadFile() {
      loading.value = true;
      try { const content = await window.electron.ipcRenderer.invoke('filetree:readFile', FILE_PATH); originalContent = content; rows.value = parseTable(content); } catch (e) { rows.value = []; }
      try { const sc = await window.electron.ipcRenderer.invoke('filetree:readFile', STRUCTURE_PATH); subsystems.value = parseSubsystems(sc); } catch (e) { subsystems.value = []; }
      loading.value = false;
    }

    function addRow() { const id = nextId(rows.value); rows.value.push({ id, subsystem: '', description: '', status: 'Draft' }); dirty.value = true; saved.value = false; startEdit(rows.value.length - 1); }
    function startEdit(i) { editingIdx.value = i; editRow.value = { ...rows.value[i] }; }
    function commitEdit() { if (editingIdx.value === null) return; rows.value[editingIdx.value] = { ...editRow.value }; editingIdx.value = null; dirty.value = true; saved.value = false; }
    function cancelEdit() { editingIdx.value = null; }
    function deleteRow(i) { rows.value.splice(i, 1); dirty.value = true; saved.value = false; }

    async function onSave() {
      if (editingIdx.value !== null) commitEdit();
      saving.value = true;
      try { const content = serializeTable(rows.value); await window.electron.ipcRenderer.invoke('filetree:writeFile', FILE_PATH, content); originalContent = content; dirty.value = false; saved.value = true; if (savedTimeout) clearTimeout(savedTimeout); savedTimeout = setTimeout(() => { saved.value = false; }, 2000); }
      catch (e) { console.error('Failed to save:', e); }
      finally { saving.value = false; }
    }

    async function exportToExcel() {
      if (editingIdx.value !== null) commitEdit();
      try {
        const plainRows = JSON.parse(JSON.stringify(rows.value));
        const result = await window.electron.ipcRenderer.invoke('excel:exportRequirements', { rows: plainRows, title: 'Functional Requirements' });
        console.log('Export result:', result);
      } catch (e) { console.error('Export failed:', e); }
    }

    async function importFromExcel() {
      try {
        const result = await window.electron.ipcRenderer.invoke('excel:importRequirements');
        if (!result.success || !result.rows.length) return;
        rows.value = result.rows;
        dirty.value = true; saved.value = false;
      } catch (e) { console.error('Import failed:', e); }
    }

    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (dirty.value && !saving.value) onSave(); }
      if (e.key === 'Enter' && editingIdx.value !== null) commitEdit();
      if (e.key === 'Escape' && editingIdx.value !== null) cancelEdit();
    }

    onMounted(() => { loadFile(); window.addEventListener('keydown', onKeyDown); });
    onUnmounted(() => { if (savedTimeout) clearTimeout(savedTimeout); window.removeEventListener('keydown', onKeyDown); });

    return { loading, saving, saved, dirty, rows, subsystems, STATUSES, editingIdx, editRow, addRow, startEdit, commitEdit, cancelEdit, deleteRow, onSave, exportToExcel, importFromExcel };
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
.spacer { width: 1px; height: 24px; background: var(--border-color); margin: 0 0.2rem; }
.tool-btn { display: flex; align-items: center; gap: 0.25rem; background: none; border: 1px solid var(--border-color); border-radius: var(--border-radius); color: var(--text-color); cursor: pointer; font-size: 0.8rem; padding: 0.35rem 0.6rem; transition: var(--transition); }
.tool-btn:hover { border-color: var(--primary-color); color: var(--primary-color); }
.saved-indicator { color: #16a34a; font-size: 0.8rem; font-weight: 500; }
.save-btn { background: #16a34a; border: none; border-radius: var(--border-radius); color: #fff; cursor: pointer; font-size: 0.85rem; font-weight: 600; padding: 0.4rem 1rem; transition: var(--transition); }
.save-btn:hover:not(:disabled) { background: #15803d; }
.save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.state-card { padding: 2rem; color: var(--text-muted); }

/* Table */
.table-container { flex: 1; overflow: auto; padding: 1rem 1.25rem; }
.fr-table { width: 100%; border-collapse: collapse; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--border-radius); }
.fr-table th, .fr-table td { padding: 0.55rem 0.75rem; text-align: left; border-bottom: 1px solid var(--border-color); font-size: 0.85rem; }
.fr-table th { background: rgba(255,255,255,0.03); color: var(--text-muted); font-weight: 600; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; position: sticky; top: 0; z-index: 1; }
.fr-table tbody tr:hover { background: rgba(74,144,226,0.04); }
.editing-row { background: rgba(74,144,226,0.08) !important; }

.col-id { width: 80px; }
.col-subsystem { width: 180px; }
.col-status { width: 120px; }
.col-actions { width: 70px; text-align: right; }

.id-badge { font-family: monospace; font-size: 0.8rem; color: var(--primary-color); font-weight: 600; }
.cell-text { cursor: pointer; color: var(--text-color); }
.cell-input, .cell-select { width: 100%; padding: 0.3rem 0.5rem; border: 1px solid var(--primary-color); border-radius: 3px; background: var(--card-bg); color: var(--text-color); font-size: 0.85rem; outline: none; }
.cell-select { cursor: pointer; }
.empty-row { color: var(--text-muted); text-align: center; padding: 2rem !important; }

/* Status badges */
.status-badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 10px; font-size: 0.75rem; font-weight: 600; }
.status-draft { background: rgba(156,163,175,0.2); color: #9ca3af; }
.status-proposed { background: rgba(59,130,246,0.15); color: #60a5fa; }
.status-approved { background: rgba(16,185,129,0.15); color: #34d399; }
.status-implemented { background: rgba(139,92,246,0.15); color: #a78bfa; }
.status-verified { background: rgba(22,163,74,0.2); color: #4ade80; }
.status-deprecated { background: rgba(239,68,68,0.15); color: #f87171; }

/* Row buttons */
.row-btn { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; background: none; border: none; border-radius: 3px; color: var(--text-muted); cursor: pointer; transition: var(--transition); }
.row-btn:hover { color: var(--text-color); background: rgba(255,255,255,0.08); }
.delete-btn:hover { color: #ef4444; }
</style>
