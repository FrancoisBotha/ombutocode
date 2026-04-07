<template>
  <div class="editor-view">
    <header class="title-bar">
      <div class="title-copy">
        <p class="folder-path">docs / Use Cases /</p>
        <h1 class="file-name">{{ fileName }}</h1>
      </div>
      <div class="title-actions">
        <template v-if="!isEditMode && !viewingHistorical">
          <button class="edit-btn" @click="onEdit">Edit</button>
        </template>
        <template v-if="isEditMode">
          <button class="cancel-btn" @click="onCancelEdit">Cancel</button>
          <button class="save-btn" @click="onSave" :disabled="saving">{{ saving ? 'Saving...' : 'Save' }}</button>
        </template>
        <button class="versions-btn" :disabled="!versionEntries.length" @click="toggleVersions">
          {{ versionEntries.length > 1 ? `Versions (${versionEntries.length})` : 'Versions' }}
        </button>
        <button class="back-btn" @click="$router.push('/use-cases')">Back</button>
      </div>
    </header>

    <div v-if="viewingHistorical" class="history-banner">
      <span>Viewing version from {{ historicalDate }} — {{ historicalMessage }}</span>
      <button @click="backToCurrent">Back to current</button>
    </div>

    <div v-if="loading" class="state-card"><p>Loading...</p></div>
    <div v-else-if="notFound" class="state-card"><p>Use case file not found.</p></div>

    <!-- Edit mode: split pane -->
    <div v-else-if="isEditMode && !viewingHistorical" class="split-pane">
      <div class="editor-pane">
        <div ref="editorContainer" class="codemirror-container"></div>
      </div>
      <div class="preview-pane">
        <article class="markdown-body" v-html="editPreviewHtml"></article>
      </div>
    </div>

    <!-- Read mode -->
    <div v-else class="read-pane">
      <article class="markdown-body" v-html="renderedHtml"></article>

      <!-- Linked Functional Requirements -->
      <div v-if="!viewingHistorical" class="related-section">
        <div class="related-header">
          <h3>Linked Functional Requirements</h3>
          <button class="add-link-btn" @click="showFRPicker = true">
            <span class="mdi mdi-link-plus"></span> Link FR
          </button>
        </div>
        <div v-if="linkedFRs.length === 0" class="related-empty">No linked FRs yet.</div>
        <div v-else class="related-list">
          <div v-for="fr in linkedFRs" :key="fr.frId" class="related-item">
            <span class="mdi mdi-checkbox-marked-outline related-icon" style="color:#16a34a"></span>
            <div class="related-info">
              <span class="related-name">{{ fr.frId }}</span>
            </div>
            <button class="remove-link-btn" @click="unlinkFR(fr.frId)" title="Unlink FR">
              <span class="mdi mdi-close"></span>
            </button>
          </div>
        </div>
      </div>

      <!-- Related Artifacts section -->
      <div v-if="!viewingHistorical" class="related-section">
        <div class="related-header">
          <h3>Related Artifacts</h3>
          <button class="add-link-btn" @click="showPicker = true">
            <span class="mdi mdi-link-plus"></span> Link Artifact
          </button>
        </div>
        <div v-if="relatedArtifacts.length === 0" class="related-empty">No linked artifacts yet.</div>
        <div v-else class="related-list">
          <div v-for="(art, i) in relatedArtifacts" :key="i" class="related-item">
            <span class="mdi mdi-file-document-outline related-icon"></span>
            <div class="related-info">
              <span class="related-name">{{ art.name }}</span>
              <span class="related-path">{{ art.path }}</span>
            </div>
            <button class="remove-link-btn" @click="removeArtifact(i)" title="Remove link">
              <span class="mdi mdi-close"></span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- FR picker modal -->
    <div v-if="showFRPicker" class="picker-overlay" @click.self="showFRPicker = false">
      <div class="picker-modal">
        <div class="picker-header">
          <h3>Link Functional Requirement</h3>
          <button class="picker-close" @click="showFRPicker = false"><span class="mdi mdi-close"></span></button>
        </div>
        <input v-model="frPickerFilter" class="picker-search" placeholder="Search FRs..." />
        <div class="picker-list">
          <div v-for="fr in filteredFRs" :key="fr.id" class="picker-item" @click="linkFR(fr)">
            <span class="mdi mdi-checkbox-marked-outline" style="color:#16a34a"></span>
            <div>
              <div class="picker-item-name">{{ fr.id }}</div>
              <div class="picker-item-path">{{ fr.description }}</div>
            </div>
          </div>
          <div v-if="filteredFRs.length === 0" class="picker-empty">No FRs found.</div>
        </div>
      </div>
    </div>

    <!-- Artifact picker modal -->
    <div v-if="showPicker" class="picker-overlay" @click.self="showPicker = false">
      <div class="picker-modal">
        <div class="picker-header">
          <h3>Link Artifact</h3>
          <button class="picker-close" @click="showPicker = false"><span class="mdi mdi-close"></span></button>
        </div>
        <input v-model="pickerFilter" class="picker-search" placeholder="Search files..." />
        <div class="picker-list">
          <div
            v-for="f in filteredFiles"
            :key="f.path"
            class="picker-item"
            @click="addArtifact(f)"
          >
            <span class="mdi mdi-file-document-outline"></span>
            <div>
              <div class="picker-item-name">{{ f.name }}</div>
              <div class="picker-item-path">{{ f.path }}</div>
            </div>
          </div>
          <div v-if="filteredFiles.length === 0" class="picker-empty">No files found.</div>
        </div>
      </div>
    </div>

    <!-- Versions panel -->
    <VersionsPanel
      :entries="versionEntries"
      :loading="versionsLoading"
      :open="isVersionsPanelOpen"
      @close="isVersionsPanelOpen = false"
      @select-version="handleVersionSelect"
    />
  </div>
</template>

<script>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { marked } from 'marked';
import { parseMatrix, serializeMatrix, getLinksForUC, MATRIX_PATH } from '../utils/requirementsMatrix';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown as markdownLang } from '@codemirror/lang-markdown';
import VersionsPanel from '../components/VersionsPanel.vue';

export default {
  name: 'UseCaseEditorView',
  components: { VersionsPanel },
  props: {
    filePath: { type: String, default: '' }
  },
  setup(props) {
    const route = useRoute();
    const router = useRouter();
    const loading = ref(false);
    const notFound = ref(false);
    const saving = ref(false);
    const markdown = ref('');
    const activePath = ref('');
    const isEditMode = ref(false);
    const editorContainer = ref(null);
    const editContent = ref('');
    const editPreviewHtml = ref('');
    const originalContent = ref('');

    // Versions
    const versionEntries = ref([]);
    const versionsLoading = ref(false);
    const isVersionsPanelOpen = ref(false);
    const viewingHistorical = ref(false);
    const historicalDate = ref('');
    const historicalMessage = ref('');

    // Related artifacts
    const relatedArtifacts = ref([]);
    const showPicker = ref(false);
    const pickerFilter = ref('');
    const allFiles = ref([]);
    const linkedFRs = ref([]);
    const allMatrixLinks = ref([]);
    const availableFRs = ref([]);
    const showFRPicker = ref(false);
    const frPickerFilter = ref('');

    let editorView = null;
    let previewDebounce = null;

    const filePath = computed(() => {
      const p = route.params.path;
      const joined = Array.isArray(p) ? p.join('/') : p || '';
      return decodeURIComponent(joined) || props.filePath || '';
    });

    const fileName = computed(() => {
      const parts = activePath.value.split('/');
      const name = parts[parts.length - 1] || '';
      return name.replace('.md', '');
    });

    const renderedHtml = computed(() => {
      if (!markdown.value) return '<p class="empty-copy">This file is empty.</p>';
      return marked.parse(markdown.value);
    });

    const filteredFiles = computed(() => {
      const q = pickerFilter.value.toLowerCase();
      const currentPath = activePath.value;
      return allFiles.value.filter(f =>
        f.path !== currentPath &&
        !relatedArtifacts.value.some(a => a.path === f.path) &&
        (f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
      );
    });

    // ── Related Artifacts parsing ──

    function parseRelatedArtifacts(content) {
      const arts = [];
      const section12 = content.match(/## 13\. Related Artifacts\n([\s\S]*?)(?=\n## |\n*$)/);
      if (!section12) return arts;
      const lines = section12[1].split('\n');
      for (const line of lines) {
        const m = line.match(/^-\s+\[([^\]]+)\]\(([^)]+)\)\s*$/);
        if (m) {
          arts.push({ name: m[1], path: m[2] });
        }
      }
      return arts;
    }

    function serializeRelatedArtifacts(content, arts) {
      const header = '## 13. Related Artifacts';
      const artsBlock = arts.map(a => `- [${a.name}](${a.path})`).join('\n');
      const newSection = header + '\n' + artsBlock + '\n';

      if (content.includes(header)) {
        return content.replace(/## 13\. Related Artifacts\n[\s\S]*?(?=\n## |\s*$)/, newSection);
      }
      return content.trimEnd() + '\n\n' + newSection;
    }

    function addArtifact(f) {
      relatedArtifacts.value.push({ name: f.name.replace('.md', ''), path: f.path });
      showPicker.value = false;
      pickerFilter.value = '';
      saveRelatedArtifacts();
    }

    function removeArtifact(i) {
      relatedArtifacts.value.splice(i, 1);
      saveRelatedArtifacts();
    }

    async function saveRelatedArtifacts() {
      const updated = serializeRelatedArtifacts(markdown.value, relatedArtifacts.value);
      markdown.value = updated;
      try {
        await window.electron.ipcRenderer.invoke('filetree:writeFile', activePath.value, updated);
        originalContent.value = updated;
      } catch (e) {
        console.error('Failed to save related artifacts:', e);
      }
    }

    // ── File loading ──

    async function loadFile() {
      const nextPath = filePath.value;
      activePath.value = nextPath;
      viewingHistorical.value = false;
      isVersionsPanelOpen.value = false;
      versionEntries.value = [];

      if (!nextPath) { notFound.value = true; return; }

      loading.value = true;
      notFound.value = false;
      try {
        markdown.value = await window.electron.ipcRenderer.invoke('filetree:readFile', nextPath);
        originalContent.value = markdown.value;
        relatedArtifacts.value = parseRelatedArtifacts(markdown.value);
      } catch (e) {
        notFound.value = true;
        console.error('Failed to load use case:', e);
      } finally {
        loading.value = false;
      }

      loadVersions();
      loadAllFiles();
      loadLinkedFRs();
    }

    async function loadVersions() {
      if (!activePath.value) return;
      versionsLoading.value = true;
      try {
        versionEntries.value = await window.electron.ipcRenderer.invoke('version:log', activePath.value, 500);
      } catch (e) {
        versionEntries.value = [];
      } finally {
        versionsLoading.value = false;
      }
    }

    async function loadAllFiles() {
      try {
        allFiles.value = await window.electron.ipcRenderer.invoke('filetree:scanAllFiles');
      } catch (e) {
        allFiles.value = [];
      }
    }

    async function loadLinkedFRs() {
      try {
        const content = await window.electron.ipcRenderer.invoke('filetree:readFile', MATRIX_PATH);
        allMatrixLinks.value = parseMatrix(content);
        linkedFRs.value = getLinksForUC(allMatrixLinks.value, activePath.value);
      } catch (e) {
        allMatrixLinks.value = [];
        linkedFRs.value = [];
      }

      // Load available FRs
      try {
        const frContent = await window.electron.ipcRenderer.invoke('filetree:readFile', 'Functional Requirements/FunctionalRequirements.md');
        const rows = [];
        let inTable = false;
        for (const line of frContent.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('|')) continue;
          const cells = trimmed.split('|').map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length);
          if (cells.length < 4) continue;
          if (cells[0] === 'ID') { inTable = true; continue; }
          if (cells[0].match(/^-+$/)) continue;
          if (inTable) rows.push({ id: cells[0], description: cells[2] });
        }
        availableFRs.value = rows;
      } catch (e) { availableFRs.value = []; }
    }

    const filteredFRs = computed(() => {
      const linked = new Set(linkedFRs.value.map(l => l.frId));
      const q = frPickerFilter.value.toLowerCase();
      return availableFRs.value.filter(fr =>
        !linked.has(fr.id) &&
        (fr.id.toLowerCase().includes(q) || fr.description.toLowerCase().includes(q))
      );
    });

    async function linkFR(fr) {
      const ucName = fileName.value;
      allMatrixLinks.value.push({ frId: fr.id, ucName, ucPath: activePath.value });
      linkedFRs.value = getLinksForUC(allMatrixLinks.value, activePath.value);
      showFRPicker.value = false;
      frPickerFilter.value = '';
      await saveMatrix();
    }

    async function unlinkFR(frId) {
      allMatrixLinks.value = allMatrixLinks.value.filter(l => !(l.frId === frId && l.ucPath === activePath.value));
      linkedFRs.value = getLinksForUC(allMatrixLinks.value, activePath.value);
      await saveMatrix();
    }

    async function saveMatrix() {
      try {
        const content = serializeMatrix(allMatrixLinks.value);
        await window.electron.ipcRenderer.invoke('filetree:writeFile', MATRIX_PATH, content);
      } catch (e) { console.error('Failed to save matrix:', e); }
    }

    // ── Edit mode ──

    function onEdit() {
      editContent.value = markdown.value;
      editPreviewHtml.value = marked.parse(markdown.value);
      isEditMode.value = true;
      nextTick(() => setupEditor());
    }

    function setupEditor() {
      if (!editorContainer.value) return;
      if (editorView) { editorView.destroy(); editorView = null; }

      const updateListener = EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          editContent.value = update.state.doc.toString();
          if (previewDebounce) clearTimeout(previewDebounce);
          previewDebounce = setTimeout(() => {
            editPreviewHtml.value = marked.parse(editContent.value);
          }, 200);
        }
      });

      const state = EditorState.create({
        doc: editContent.value,
        extensions: [
          keymap.of([...defaultKeymap, ...historyKeymap]),
          history(),
          markdownLang(),
          updateListener,
          EditorView.lineWrapping,
        ],
      });

      editorView = new EditorView({ state, parent: editorContainer.value });
    }

    function destroyEditor() {
      if (editorView) { editorView.destroy(); editorView = null; }
      if (previewDebounce) { clearTimeout(previewDebounce); previewDebounce = null; }
    }

    function onCancelEdit() {
      markdown.value = originalContent.value;
      relatedArtifacts.value = parseRelatedArtifacts(originalContent.value);
      destroyEditor();
      isEditMode.value = false;
    }

    async function onSave() {
      saving.value = true;
      try {
        await window.electron.ipcRenderer.invoke('filetree:writeFile', activePath.value, editContent.value);
        markdown.value = editContent.value;
        originalContent.value = editContent.value;
        relatedArtifacts.value = parseRelatedArtifacts(editContent.value);
        destroyEditor();
        isEditMode.value = false;
      } catch (e) {
        console.error('Failed to save:', e);
      } finally {
        saving.value = false;
      }
    }

    // ── Versions ──

    function toggleVersions() {
      if (isVersionsPanelOpen.value) { isVersionsPanelOpen.value = false; return; }
      if (versionEntries.value.length) isVersionsPanelOpen.value = true;
    }

    async function handleVersionSelect(hash) {
      const entry = versionEntries.value.find(e => e.hash === hash);
      try {
        const content = await window.electron.ipcRenderer.invoke('version:fileAtCommit', hash, activePath.value);
        if (content == null) {
          viewingHistorical.value = true;
          historicalDate.value = entry ? formatDate(entry.date) : hash;
          historicalMessage.value = 'File did not exist at this version.';
          markdown.value = '';
          return;
        }
        markdown.value = content;
        viewingHistorical.value = true;
        historicalDate.value = entry ? formatDate(entry.date) : hash;
        historicalMessage.value = entry ? entry.message : '';
      } catch (e) {
        console.error('Failed to load version:', e);
      }
    }

    async function backToCurrent() {
      viewingHistorical.value = false;
      await loadFile();
    }

    function formatDate(value) {
      if (!value) return 'Unknown';
      const d = new Date(value);
      if (isNaN(d.getTime())) return value;
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && isEditMode.value) {
        e.preventDefault();
        if (!saving.value) onSave();
      }
    }

    onMounted(() => {
      loadFile();
      window.addEventListener('keydown', onKeyDown);
    });

    onUnmounted(() => {
      destroyEditor();
      window.removeEventListener('keydown', onKeyDown);
    });

    watch(() => filePath.value, () => {
      destroyEditor();
      isEditMode.value = false;
      loadFile();
    });

    return {
      loading, notFound, saving, fileName, activePath,
      markdown, renderedHtml,
      isEditMode, editorContainer, editPreviewHtml,
      onEdit, onCancelEdit, onSave,
      versionEntries, versionsLoading, isVersionsPanelOpen, viewingHistorical,
      historicalDate, historicalMessage,
      toggleVersions, handleVersionSelect, backToCurrent,
      linkedFRs, showFRPicker, frPickerFilter, filteredFRs, linkFR, unlinkFR,
      relatedArtifacts, showPicker, pickerFilter, filteredFiles,
      addArtifact, removeArtifact,
    };
  },
};
</script>

<style scoped>
.editor-view { display: flex; flex-direction: column; height: 100%; }

.title-bar { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1.25rem; background: var(--card-bg); border-bottom: 1px solid var(--border-color); flex-shrink: 0; gap: 0.75rem; }
.title-copy { min-width: 0; }
.folder-path { color: var(--text-muted); font-size: 0.8rem; margin: 0 0 0.15rem; }
.file-name { color: var(--text-color); font-size: 1.25rem; margin: 0; }
.title-actions { display: flex; align-items: center; gap: 0.5rem; }

.edit-btn { background: var(--primary-color); border: none; border-radius: var(--border-radius); color: #fff; cursor: pointer; font-size: 0.9rem; padding: 0.45rem 1rem; transition: var(--transition); }
.edit-btn:hover { background: var(--primary-hover); }
.save-btn { background: #16a34a; border: none; border-radius: var(--border-radius); color: #fff; cursor: pointer; font-size: 0.9rem; font-weight: 600; padding: 0.45rem 1rem; transition: var(--transition); }
.save-btn:hover:not(:disabled) { background: #15803d; }
.save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.cancel-btn, .versions-btn, .back-btn { background: transparent; border: 1px solid var(--border-color); border-radius: var(--border-radius); color: var(--text-color); cursor: pointer; font-size: 0.85rem; padding: 0.45rem 0.9rem; transition: var(--transition); }
.cancel-btn:hover, .versions-btn:hover:not(:disabled), .back-btn:hover { border-color: var(--primary-color); color: var(--primary-color); }
.versions-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.history-banner { display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 1.25rem; background: #fef3c7; border-bottom: 1px solid #f59e0b; color: #92400e; font-size: 0.85rem; }
.history-banner button { background: #f59e0b; border: none; border-radius: var(--border-radius); color: #fff; cursor: pointer; font-size: 0.8rem; padding: 0.35rem 0.8rem; }

.state-card { padding: 2rem; color: var(--text-muted); }

/* ── Split pane (edit mode) ── */
.split-pane { display: flex; flex: 1; min-height: 0; }
.editor-pane { flex: 1; min-width: 0; display: flex; flex-direction: column; border-right: 1px solid var(--border-color); }
.codemirror-container { flex: 1; overflow: auto; }
.codemirror-container :deep(.cm-editor) { height: 100%; }
.codemirror-container :deep(.cm-scroller) { overflow: auto; }
.preview-pane { flex: 1; min-width: 0; overflow-y: auto; }
.preview-pane .markdown-body { border: none; box-shadow: none; }

/* ── Read pane ── */
.read-pane { flex: 1; overflow-y: auto; padding: 1rem 1.25rem; }
.markdown-body { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--border-radius); box-shadow: var(--box-shadow); color: var(--text-color); line-height: 1.7; padding: 1.5rem; }
.markdown-body :deep(h1), .markdown-body :deep(h2), .markdown-body :deep(h3) { color: var(--text-color); margin: 1.5rem 0 0.6rem; }
.markdown-body :deep(h1:first-child), .markdown-body :deep(h2:first-child) { margin-top: 0; }
.markdown-body :deep(p), .markdown-body :deep(ul), .markdown-body :deep(ol) { margin: 0 0 0.8rem; }
.markdown-body :deep(hr) { border: none; border-top: 1px solid var(--border-color); margin: 1rem 0; }
.markdown-body :deep(a) { color: var(--primary-color); }

/* ── Related Artifacts ── */
.related-section { margin-top: 1rem; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--border-radius); padding: 1rem 1.25rem; }
.related-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
.related-header h3 { margin: 0; font-size: 1rem; color: var(--text-color); }
.add-link-btn { display: flex; align-items: center; gap: 0.25rem; background: none; border: 1px solid var(--border-color); border-radius: var(--border-radius); color: var(--text-color); cursor: pointer; font-size: 0.8rem; padding: 0.3rem 0.6rem; transition: var(--transition); }
.add-link-btn:hover { border-color: var(--primary-color); color: var(--primary-color); }
.related-empty { color: var(--text-muted); font-size: 0.85rem; }
.related-list { display: flex; flex-direction: column; gap: 0.35rem; }
.related-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0.5rem; border-radius: 4px; transition: background 0.12s; }
.related-item:hover { background: rgba(74, 144, 226, 0.06); }
.related-icon { color: var(--primary-color); font-size: 1rem; flex-shrink: 0; }
.related-info { flex: 1; min-width: 0; }
.related-name { display: block; font-size: 0.85rem; color: var(--text-color); }
.related-path { display: block; font-size: 0.7rem; color: var(--text-muted); }
.remove-link-btn { display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; background: none; border: none; border-radius: 3px; color: var(--text-muted); cursor: pointer; flex-shrink: 0; transition: var(--transition); }
.remove-link-btn:hover { color: #ef4444; background: rgba(239, 68, 68, 0.1); }

/* ── Picker modal ── */
.picker-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; }
.picker-modal { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px; width: 500px; max-height: 70vh; display: flex; flex-direction: column; }
.picker-header { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-color); }
.picker-header h3 { margin: 0; font-size: 1rem; color: var(--text-color); }
.picker-close { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.1rem; }
.picker-search { margin: 0.5rem 0.75rem; padding: 0.4rem 0.6rem; border: 1px solid var(--border-color); border-radius: var(--border-radius); background: var(--card-bg); color: var(--text-color); font-size: 0.85rem; outline: none; }
.picker-search:focus { border-color: var(--primary-color); }
.picker-list { flex: 1; overflow-y: auto; padding: 0.25rem 0.5rem 0.5rem; }
.picker-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.45rem 0.5rem; border-radius: 4px; cursor: pointer; transition: background 0.12s; }
.picker-item:hover { background: rgba(74, 144, 226, 0.1); }
.picker-item .mdi { color: var(--primary-color); font-size: 1rem; }
.picker-item-name { font-size: 0.85rem; color: var(--text-color); }
.picker-item-path { font-size: 0.7rem; color: var(--text-muted); }
.picker-empty { color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 1rem; }
</style>
