<template>
  <div class="view-container">
    <header class="title-bar">
      <div class="title-copy">
        <p class="folder-path">docs / Structure /</p>
        <h1 class="file-name">Project Structure</h1>
      </div>
      <div class="title-actions">
        <div class="spacer"></div>
        <span v-if="saved" class="saved-indicator">Saved</span>
        <button class="save-btn" @click="onSave" :disabled="saving || !dirty">
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
      </div>
    </header>

    <div v-if="loading" class="state-card"><p>Loading...</p></div>

    <div v-else class="structure-tree">
      <div
        v-for="(sys, si) in systems" :key="'s' + si"
        class="tree-system"
      >
        <!-- System row -->
        <div
          class="tree-row system-row"
          :class="{ selected: isSelected('system', si) }"
          @click="select('system', si)"
        >
          <span class="mdi mdi-server tree-icon system-icon"></span>
          <template v-if="isEditing('system', si)">
            <input
              :ref="el => { if (el) editEl = el }"
              v-model="editValue"
              class="inline-input"
              @keyup.enter="commitEdit"
              @keyup.escape="cancelEdit"
              @blur="commitEdit"
              @click.stop
            />
          </template>
          <span v-else class="tree-label" @dblclick.stop="startEdit('system', si)">{{ sys.system }}</span>
          <div class="row-actions" @click.stop>
            <button class="row-btn" title="Add Sub-System" @click="addSubSystem(si)">
              <span class="mdi mdi-plus"></span> Sub-System
            </button>
            <button class="row-btn" title="Rename" @click="startEdit('system', si)">
              <span class="mdi mdi-pencil"></span>
            </button>
          </div>
        </div>

        <!-- Sub-systems -->
        <div
          v-for="(sub, ssi) in sys.subsystems" :key="'ss' + si + '-' + ssi"
          class="tree-subsystem"
          :class="{ 'drop-above': dropTarget && dropTarget.type === 'subsystem' && dropTarget.si === si && dropTarget.ssi === ssi && dropTarget.pos === 'above',
                    'drop-below': dropTarget && dropTarget.type === 'subsystem' && dropTarget.si === si && dropTarget.ssi === ssi && dropTarget.pos === 'below' }"
          @dragover.prevent="onDragOver($event, 'subsystem', si, ssi)"
          @dragleave="onDragLeave"
          @drop.prevent="onDrop($event, 'subsystem', si, ssi)"
        >
          <div
            class="tree-row subsystem-row"
            :class="{ selected: isSelected('subsystem', si, ssi) }"
            draggable="true"
            @dragstart="onDragStart($event, 'subsystem', si, ssi)"
            @dragend="onDragEnd"
            @click="select('subsystem', si, ssi)"
          >
            <span class="mdi mdi-drag drag-handle"></span>
            <span class="mdi mdi-lan tree-icon subsystem-icon"></span>
            <template v-if="isEditing('subsystem', si, ssi)">
              <input
                :ref="el => { if (el) editEl = el }"
                v-model="editValue"
                class="inline-input"
                @keyup.enter="commitEdit"
                @keyup.escape="cancelEdit"
                @blur="commitEdit"
                @click.stop
              />
            </template>
            <span v-else class="tree-label" @dblclick.stop="startEdit('subsystem', si, ssi)">{{ sub.name }}</span>
            <div class="row-actions" @click.stop>
              <button class="row-btn" title="Add Component" @click="addComponent(si, ssi)">
                <span class="mdi mdi-plus"></span> Component
              </button>
              <button class="row-btn" title="Rename" @click="startEdit('subsystem', si, ssi)">
                <span class="mdi mdi-pencil"></span>
              </button>
              <button class="row-btn delete-btn" title="Delete Sub-System" @click="deleteSubSystem(si, ssi)">
                <span class="mdi mdi-delete"></span>
              </button>
            </div>
          </div>

          <!-- Components -->
          <div
            v-for="(comp, ci) in sub.components" :key="'c' + si + '-' + ssi + '-' + ci"
            class="tree-component"
            :class="{ 'drop-above': dropTarget && dropTarget.type === 'component' && dropTarget.si === si && dropTarget.ssi === ssi && dropTarget.ci === ci && dropTarget.pos === 'above',
                      'drop-below': dropTarget && dropTarget.type === 'component' && dropTarget.si === si && dropTarget.ssi === ssi && dropTarget.ci === ci && dropTarget.pos === 'below' }"
            @dragover.prevent="onDragOver($event, 'component', si, ssi, ci)"
            @dragleave="onDragLeave"
            @drop.prevent="onDrop($event, 'component', si, ssi, ci)"
          >
            <div
              class="tree-row component-row"
              :class="{ selected: isSelected('component', si, ssi, ci) }"
              draggable="true"
              @dragstart="onDragStart($event, 'component', si, ssi, ci)"
              @dragend="onDragEnd"
              @click="select('component', si, ssi, ci)"
            >
              <span class="mdi mdi-drag drag-handle"></span>
              <span class="mdi mdi-puzzle tree-icon component-icon"></span>
              <template v-if="isEditing('component', si, ssi, ci)">
                <input
                  :ref="el => { if (el) editEl = el }"
                  v-model="editValue"
                  class="inline-input"
                  @keyup.enter="commitEdit"
                  @keyup.escape="cancelEdit"
                  @blur="commitEdit"
                  @click.stop
                />
              </template>
              <span v-else class="tree-label" @dblclick.stop="startEdit('component', si, ssi, ci)">{{ comp }}</span>
              <div class="row-actions" @click.stop>
                <button class="row-btn" title="Rename" @click="startEdit('component', si, ssi, ci)">
                  <span class="mdi mdi-pencil"></span>
                </button>
                <button class="row-btn delete-btn" title="Delete Component" @click="deleteComponent(si, ssi, ci)">
                  <span class="mdi mdi-delete"></span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Description section -->
      <div class="description-section">
        <div class="description-header">
          <h3>Description</h3>
          <button v-if="!editingDescription" class="tool-btn" @click="startEditDescription">
            <span class="mdi mdi-pencil-outline"></span> Modify
          </button>
        </div>
        <p class="description-hint">
          A free-text project description in Markdown. Use headings, lists, and links to document the architecture, conventions, or anything that helps a new contributor get oriented.
        </p>
        <div v-if="!editingDescription" class="description-body">
          <p v-if="!description" class="empty">No description yet. Click <strong>Modify</strong> to add one in Markdown.</p>
          <div v-else class="desc-rendered markdown-body" v-html="renderedDescription"></div>
        </div>
        <div v-else class="description-editor">
          <textarea v-model="description" class="desc-textarea" rows="10"></textarea>
          <div class="description-editor-actions">
            <button class="tool-btn tool-btn-primary" @click="saveDescription">
              <span class="mdi mdi-check"></span> Save
            </button>
            <button class="tool-btn" @click="cancelDescriptionEdit">
              <span class="mdi mdi-close"></span> Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { marked } from 'marked';

const FILE_PATH = 'Structure/ProjectStructure.md';

function parseStructureFile(content) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  let structure = [];
  let body = content;

  if (fmMatch) {
    body = content.slice(fmMatch[0].length).trim();
    // Simple YAML parser for our known structure
    const yaml = fmMatch[1];
    structure = parseYamlStructure(yaml);
  }

  // Strip leading "# Project Structure" heading from body
  body = body.replace(/^#\s+Project Structure\s*\n*/, '').trim();

  return { structure, body };
}

function parseYamlStructure(yaml) {
  const systems = [];
  const lines = yaml.split('\n');
  let currentSystem = null;
  let currentSubsystem = null;
  let indent = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === 'structure:') continue;

    const sysMatch = trimmed.match(/^-\s+system:\s*"?([^"]*)"?\s*$/);
    if (sysMatch) {
      currentSystem = { system: sysMatch[1], subsystems: [] };
      currentSubsystem = null;
      systems.push(currentSystem);
      continue;
    }

    if (trimmed === 'subsystems: []') {
      continue;
    }
    if (trimmed === 'subsystems:') {
      continue;
    }

    const subMatch = trimmed.match(/^-\s+name:\s*"?([^"]*)"?\s*$/);
    if (subMatch && currentSystem) {
      currentSubsystem = { name: subMatch[1], components: [] };
      currentSystem.subsystems.push(currentSubsystem);
      continue;
    }

    if (trimmed === 'components: []') {
      continue;
    }
    if (trimmed === 'components:') {
      continue;
    }

    const compMatch = trimmed.match(/^-\s+"?([^"]*)"?\s*$/);
    if (compMatch && currentSubsystem) {
      currentSubsystem.components.push(compMatch[1]);
      continue;
    }
  }

  return systems;
}

function serializeStructureFile(systems, body) {
  let yaml = 'structure:\n';
  for (const sys of systems) {
    yaml += `  - system: "${sys.system}"\n`;
    if (!sys.subsystems || sys.subsystems.length === 0) {
      yaml += '    subsystems: []\n';
    } else {
      yaml += '    subsystems:\n';
      for (const sub of sys.subsystems) {
        yaml += `      - name: "${sub.name}"\n`;
        if (!sub.components || sub.components.length === 0) {
          yaml += '        components: []\n';
        } else {
          yaml += '        components:\n';
          for (const comp of sub.components) {
            yaml += `          - "${comp}"\n`;
          }
        }
      }
    }
  }

  let content = `---\n${yaml}---\n\n# Project Structure\n\n`;
  if (body) {
    content += body + '\n';
  }
  return content;
}

export default {
  name: 'ProjectStructureView',
  setup() {
    const loading = ref(true);
    const saving = ref(false);
    const saved = ref(false);
    const dirty = ref(false);
    const systems = ref([]);
    const description = ref('');
    const editingDescription = ref(false);
    // Snapshot taken when entering edit mode so Cancel can revert in-place edits.
    let descriptionEditSnapshot = '';
    const renderedDescription = computed(() =>
      description.value ? marked(description.value, { breaks: true, gfm: true }) : ''
    );

    function startEditDescription() {
      descriptionEditSnapshot = description.value;
      editingDescription.value = true;
    }
    function saveDescription() {
      // Mark dirty (which schedules the auto-save) so the description change
      // gets flushed to disk along with structure edits.
      if (description.value !== descriptionEditSnapshot) markDirty();
      editingDescription.value = false;
    }
    function cancelDescriptionEdit() {
      description.value = descriptionEditSnapshot;
      editingDescription.value = false;
    }

    // Selection
    const selectedKey = ref(null);

    // Inline editing
    const editingKey = ref(null);
    const editValue = ref('');
    let editEl = null;
    let editOriginal = '';
    let originalContent = '';
    let savedTimeout = null;

    function makeKey(type, si, ssi, ci) {
      return `${type}:${si}:${ssi ?? ''}:${ci ?? ''}`;
    }

    function select(type, si, ssi, ci) {
      selectedKey.value = makeKey(type, si, ssi, ci);
    }

    function isSelected(type, si, ssi, ci) {
      return selectedKey.value === makeKey(type, si, ssi, ci);
    }

    function isEditing(type, si, ssi, ci) {
      return editingKey.value === makeKey(type, si, ssi, ci);
    }

    function startEdit(type, si, ssi, ci) {
      const key = makeKey(type, si, ssi, ci);
      let val = '';
      if (type === 'system') val = systems.value[si].system;
      else if (type === 'subsystem') val = systems.value[si].subsystems[ssi].name;
      else if (type === 'component') val = systems.value[si].subsystems[ssi].components[ci];

      editOriginal = val;
      editValue.value = val;
      editingKey.value = key;
      nextTick(() => {
        if (editEl) { editEl.focus(); editEl.select(); }
      });
    }

    function commitEdit() {
      if (!editingKey.value) return;
      const parts = editingKey.value.split(':');
      const type = parts[0];
      const si = parseInt(parts[1]);
      const ssi = parts[2] !== '' ? parseInt(parts[2]) : null;
      const ci = parts[3] !== '' ? parseInt(parts[3]) : null;
      const val = editValue.value.trim() || editOriginal;

      if (type === 'system') systems.value[si].system = val;
      else if (type === 'subsystem') systems.value[si].subsystems[ssi].name = val;
      else if (type === 'component') systems.value[si].subsystems[ssi].components[ci] = val;

      editingKey.value = null;
      markDirty();
    }

    function cancelEdit() {
      editingKey.value = null;
    }

    // ── CRUD ──

    function addSystem() {
      systems.value.push({ system: 'New System', subsystems: [] });
      markDirty();
      nextTick(() => startEdit('system', systems.value.length - 1));
    }

    function addSubSystem(si) {
      systems.value[si].subsystems.push({ name: 'New Sub-System', components: [] });
      markDirty();
      nextTick(() => startEdit('subsystem', si, systems.value[si].subsystems.length - 1));
    }

    function addComponent(si, ssi) {
      systems.value[si].subsystems[ssi].components.push('New Component');
      markDirty();
      const ci = systems.value[si].subsystems[ssi].components.length - 1;
      nextTick(() => startEdit('component', si, ssi, ci));
    }

    function deleteSystem(si) {
      systems.value.splice(si, 1);
      selectedKey.value = null;
      markDirty();
    }

    function deleteSubSystem(si, ssi) {
      systems.value[si].subsystems.splice(ssi, 1);
      selectedKey.value = null;
      markDirty();
    }

    function deleteComponent(si, ssi, ci) {
      systems.value[si].subsystems[ssi].components.splice(ci, 1);
      selectedKey.value = null;
      markDirty();
    }

    // ── Drag & Drop ──

    const dragSource = ref(null);
    const dropTarget = ref(null);

    function onDragStart(e, type, si, ssi, ci) {
      dragSource.value = { type, si, ssi, ci };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', ''); // required for Firefox
    }

    function onDragEnd() {
      dragSource.value = null;
      dropTarget.value = null;
    }

    function onDragOver(e, type, si, ssi, ci) {
      if (!dragSource.value) return;
      // Only allow same-type reorder within same parent
      const src = dragSource.value;
      if (src.type !== type) return;
      if (type === 'subsystem' && src.si !== si) return;
      if (type === 'component' && (src.si !== si || src.ssi !== ssi)) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const pos = e.clientY < midY ? 'above' : 'below';

      dropTarget.value = { type, si, ssi, ci, pos };
    }

    function onDragLeave() {
      dropTarget.value = null;
    }

    function onDrop(e, type, si, ssi, ci) {
      if (!dragSource.value || !dropTarget.value) {
        dragSource.value = null;
        dropTarget.value = null;
        return;
      }

      const src = dragSource.value;
      const dst = dropTarget.value;

      if (src.type !== dst.type) { cleanup(); return; }

      if (type === 'system') {
        const arr = systems.value;
        const item = arr.splice(src.si, 1)[0];
        let targetIdx = dst.si;
        if (src.si < dst.si) targetIdx--;
        if (dst.pos === 'below') targetIdx++;
        arr.splice(targetIdx, 0, item);
      } else if (type === 'subsystem') {
        if (src.si !== dst.si) { cleanup(); return; }
        const arr = systems.value[si].subsystems;
        const item = arr.splice(src.ssi, 1)[0];
        let targetIdx = dst.ssi;
        if (src.ssi < dst.ssi) targetIdx--;
        if (dst.pos === 'below') targetIdx++;
        arr.splice(targetIdx, 0, item);
      } else if (type === 'component') {
        if (src.si !== dst.si || src.ssi !== dst.ssi) { cleanup(); return; }
        const arr = systems.value[si].subsystems[ssi].components;
        const item = arr.splice(src.ci, 1)[0];
        let targetIdx = dst.ci;
        if (src.ci < dst.ci) targetIdx--;
        if (dst.pos === 'below') targetIdx++;
        arr.splice(targetIdx, 0, item);
      }

      markDirty();
      cleanup();

      function cleanup() {
        dragSource.value = null;
        dropTarget.value = null;
      }
    }

    // ── File I/O ──

    // Auto-save debounce: structure mutations call markDirty(), which schedules
    // a save 500ms after the last change. Coalesces rapid edits (typing a name,
    // back-to-back drops) into a single write.
    let autoSaveTimer = null;
    const AUTO_SAVE_DELAY_MS = 500;

    function scheduleAutoSave() {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(() => {
        autoSaveTimer = null;
        if (dirty.value && !saving.value) onSave();
      }, AUTO_SAVE_DELAY_MS);
    }

    function markDirty() {
      dirty.value = true;
      saved.value = false;
      scheduleAutoSave();
    }

    async function loadFile() {
      loading.value = true;
      try {
        const content = await window.electron.ipcRenderer.invoke('filetree:readFile', FILE_PATH);
        originalContent = content;
        const parsed = parseStructureFile(content);
        systems.value = parsed.structure.length ? [parsed.structure[0]] : [{ system: 'System', subsystems: [] }];
        description.value = parsed.body;
        dirty.value = false;
      } catch (e) {
        // File may not exist yet; create default
        systems.value = [{ system: 'System', subsystems: [] }];
        description.value = '';
        dirty.value = true;
      } finally {
        loading.value = false;
      }
    }

    async function onSave() {
      saving.value = true;
      try {
        const content = serializeStructureFile(systems.value, description.value);
        await window.electron.ipcRenderer.invoke('filetree:writeFile', FILE_PATH, content);
        originalContent = content;
        dirty.value = false;
        saved.value = true;
        if (savedTimeout) clearTimeout(savedTimeout);
        savedTimeout = setTimeout(() => { saved.value = false; }, 2000);
      } catch (e) {
        console.error('Failed to save:', e);
      } finally {
        saving.value = false;
      }
    }

    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (dirty.value && !saving.value) onSave();
      }
    }

    onMounted(() => {
      loadFile();
      window.addEventListener('keydown', onKeyDown);
    });

    onUnmounted(() => {
      if (savedTimeout) clearTimeout(savedTimeout);
      // Flush any pending auto-save so leaving the view never loses an edit.
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
        if (dirty.value && !saving.value) onSave();
      }
      window.removeEventListener('keydown', onKeyDown);
    });

    return {
      loading, saving, saved, dirty,
      systems, description, editingDescription,
      renderedDescription, startEditDescription, saveDescription, cancelDescriptionEdit,
      selectedKey, editingKey, editValue,
      get editEl() { return editEl; },
      set editEl(v) { editEl = v; },
      isSelected, isEditing, select,
      startEdit, commitEdit, cancelEdit,
      addSystem, addSubSystem, addComponent,
      deleteSystem, deleteSubSystem, deleteComponent,
      dragSource, dropTarget,
      onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
      onSave,
    };
  },
};
</script>

<style scoped>
.view-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.25rem;
  background: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  gap: 0.75rem;
}

.title-copy { min-width: 0; }

.folder-path {
  color: var(--text-muted);
  font-size: 0.8rem;
  margin: 0 0 0.15rem;
}

.file-name {
  color: var(--text-color);
  font-size: 1.25rem;
  margin: 0;
}

.title-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.spacer {
  width: 1px;
  height: 24px;
  background: var(--border-color);
  margin: 0 0.2rem;
}

.tool-btn {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  background: none;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  color: var(--text-color);
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0.35rem 0.6rem;
  transition: var(--transition);
}

.tool-btn:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.saved-indicator {
  color: #16a34a;
  font-size: 0.8rem;
  font-weight: 500;
}

.save-btn {
  background: #16a34a;
  border: none;
  border-radius: var(--border-radius);
  color: #fff;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.4rem 1rem;
  transition: var(--transition);
}

.save-btn:hover:not(:disabled) { background: #15803d; }
.save-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.state-card {
  padding: 2rem;
  color: var(--text-muted);
}

/* ── Structure tree ── */
.structure-tree {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.25rem;
}

.empty {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.tree-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.6rem;
  border-radius: var(--border-radius);
  cursor: pointer;
  transition: background-color 0.12s ease;
  min-height: 34px;
}

.tree-row:hover {
  background: rgba(74, 144, 226, 0.06);
}

.tree-row[draggable="true"] {
  cursor: grab;
}

.tree-row[draggable="true"]:active {
  cursor: grabbing;
}

.tree-row.selected {
  background: rgba(74, 144, 226, 0.12);
}

.tree-icon {
  font-size: 1.1rem;
  flex-shrink: 0;
}

.system-icon { color: #e2a514; }
.subsystem-icon { color: #4a90e2; }
.component-icon { color: #16a34a; }

.tree-label {
  flex: 1;
  min-width: 0;
  font-size: 0.9rem;
  color: var(--text-color);
  cursor: pointer;
}

.inline-input {
  flex: 1;
  min-width: 0;
  padding: 0.15rem 0.4rem;
  border: 1px solid var(--primary-color);
  border-radius: 3px;
  background: var(--card-bg);
  color: var(--text-color);
  font-size: 0.9rem;
  outline: none;
}

.row-actions {
  display: flex;
  gap: 0.15rem;
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.tree-row:hover .row-actions,
.tree-row.selected .row-actions {
  opacity: 1;
}

.row-btn {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  background: none;
  border: none;
  border-radius: 3px;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0.2rem 0.35rem;
  transition: var(--transition);
}

.row-btn:hover {
  color: var(--text-color);
  background: rgba(255, 255, 255, 0.08);
}

.delete-btn:hover {
  color: #ef4444;
}

/* Drag handle */
.drag-handle {
  color: var(--text-muted);
  font-size: 0.9rem;
  opacity: 0.3;
  cursor: grab;
  flex-shrink: 0;
}

.tree-row:hover .drag-handle {
  opacity: 0.7;
}

/* Drop indicators */
.drop-above {
  border-top: 2px solid var(--primary-color);
}

.drop-below {
  border-bottom: 2px solid var(--primary-color);
}

/* Indentation */
.tree-subsystem {
  padding-left: 1.5rem;
}

.tree-component {
  padding-left: 1.5rem;
}

/* ── Description ── */
.description-section {
  margin-top: 2rem;
  border-top: 1px solid var(--border-color);
  padding-top: 1rem;
}

.description-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0 0 0.25rem;
}

.description-section h3 {
  color: var(--text-color);
  font-size: 1rem;
  margin: 0;
}

.description-hint {
  margin: 0 0 0.75rem;
  font-size: 0.82rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.description-body {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 0.75rem 1rem;
  min-height: 60px;
}

.desc-rendered {
  color: var(--text-color);
  font-size: 0.9rem;
  line-height: 1.6;
}

.desc-rendered :deep(h1) { font-size: 1.2rem; margin: 0.5rem 0 0.4rem; font-weight: 600; }
.desc-rendered :deep(h2) { font-size: 1.05rem; margin: 0.85rem 0 0.4rem; font-weight: 600; }
.desc-rendered :deep(h3) { font-size: 0.95rem; margin: 0.75rem 0 0.3rem; font-weight: 600; }
.desc-rendered :deep(p) { margin: 0.4rem 0; }
.desc-rendered :deep(ul), .desc-rendered :deep(ol) { margin: 0.3rem 0; padding-left: 1.5rem; }
.desc-rendered :deep(li) { margin: 0.15rem 0; }
.desc-rendered :deep(code) { background: var(--secondary-color); padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.82rem; }
.desc-rendered :deep(pre) { background: var(--secondary-color); padding: 0.6rem 0.8rem; border-radius: 5px; overflow-x: auto; margin: 0.5rem 0; }
.desc-rendered :deep(pre code) { background: none; padding: 0; }
.desc-rendered :deep(a) { color: var(--primary-color); }
.desc-rendered :deep(blockquote) { margin: 0.4rem 0; padding-left: 0.75rem; border-left: 3px solid var(--border-color); color: var(--text-muted); }
.desc-rendered :deep(hr) { border: none; border-top: 1px solid var(--border-color); margin: 0.75rem 0; }

.description-editor {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.description-editor-actions {
  display: flex;
  gap: 0.5rem;
}

.tool-btn-primary {
  background: var(--primary-color);
  color: #fff;
  border-color: var(--primary-color);
}

.tool-btn-primary:hover {
  background: var(--primary-hover);
  border-color: var(--primary-hover);
}

.desc-textarea {
  background: var(--card-bg);
  border: 1px solid var(--primary-color);
  border-radius: var(--border-radius);
  color: var(--text-color);
  font-size: 0.9rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  padding: 0.6rem 0.8rem;
  outline: none;
  resize: vertical;
  line-height: 1.6;
}
</style>
