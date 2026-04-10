<template>
  <div class="file-preview-view" :class="{ 'file-preview-view--edit': isEditMode }">
    <div v-if="loading" class="state-card">
      <p class="state-text">Loading file...</p>
    </div>

    <div v-else-if="notFound" class="state-card">
      <h1>File not found</h1>
      <p class="state-text">The requested Markdown file could not be loaded.</p>
    </div>

    <div v-else class="preview-layout">
      <header class="title-bar">
        <div class="title-copy">
          <p class="folder-path">{{ folderBreadcrumb }}</p>
          <h1 class="file-name">{{ fileName }}</h1>
        </div>
        <div v-if="!isImage" class="title-actions">
          <button v-if="isEpic && !viewingHistorical && !isEditMode" class="back-btn" type="button" @click="backToEpics">
            <span class="mdi mdi-arrow-left"></span> Epics
          </button>
          <template v-if="isEpic && !viewingHistorical && !isEditMode">
            <button class="prd-ai-btn" type="button" @click="refineEpicWithAi">
              <span class="mdi mdi-pencil-outline"></span> Refine with AI
            </button>
          </template>
          <button v-if="isSkill && !viewingHistorical && !isEditMode" class="back-btn" type="button" @click="backToSkills">
            <span class="mdi mdi-arrow-left"></span> Skills
          </button>
          <template v-if="isPrd && !viewingHistorical && !isEditMode">
            <button class="prd-ai-btn" type="button" @click="createNewPrd">
              <span class="mdi mdi-robot-outline"></span> Create PRD
            </button>
            <button class="prd-ai-btn" type="button" @click="refinePrdWithAi">
              <span class="mdi mdi-pencil-outline"></span> Refine with AI
            </button>
          </template>
          <template v-if="isArchitecture && !viewingHistorical && !isEditMode">
            <button class="prd-ai-btn" type="button" @click="createNewArch">
              <span class="mdi mdi-robot-outline"></span> Create Architecture
            </button>
            <button class="prd-ai-btn" type="button" @click="refineArchWithAi">
              <span class="mdi mdi-pencil-outline"></span> Refine with AI
            </button>
          </template>
          <template v-if="!viewingHistorical && !isEditMode">
            <button class="edit-btn" type="button" @click="onEdit">Edit</button>
          </template>
          <template v-if="isEditMode">
            <button class="cancel-btn" type="button" @click="onCancelEdit">Cancel</button>
            <button class="save-btn" type="button" @click="onSave" :disabled="saving">{{ saving ? 'Saving...' : 'Save' }}</button>
          </template>
          <button
            class="versions-btn"
            type="button"
            :disabled="versionsButtonDisabled"
            @click="toggleVersionsPanel"
          >
            {{ versionsButtonLabel }}
          </button>
        </div>
      </header>

      <div v-if="viewingHistorical" class="history-banner">
        <span class="history-banner__text">Viewing version from {{ historicalDate }} &mdash; {{ historicalMessage }}</span>
        <button class="history-banner__back" type="button" @click="backToCurrent">Back to current</button>
      </div>

      <div v-if="historicalError" class="state-card">
        <p class="state-text">{{ historicalError }}</p>
      </div>

      <div v-else-if="isEditMode && !viewingHistorical" class="editor-split">
        <div class="editor-pane">
          <div ref="editorContainer" class="codemirror-container"></div>
        </div>
        <div class="preview-pane">
          <article class="markdown-body" v-html="editPreviewHtml"></article>
        </div>
      </div>

      <div v-else-if="isImage" class="image-preview">
        <img v-if="imageDataUrl" :src="imageDataUrl" :alt="fileName" class="image-full" />
        <p v-else class="state-text">Loading image...</p>
      </div>

      <article v-else class="markdown-body" v-html="renderedHtml"></article>
    </div>

    <VersionsPanel
      :entries="versionEntries"
      :loading="versionsLoading"
      :open="isVersionsPanelOpen"
      @close="closeVersionsPanel"
      @select-version="handleVersionSelect"
    />
  </div>
</template>

<script>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { marked } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown as markdownLang } from '@codemirror/lang-markdown';
import VersionsPanel from '../components/VersionsPanel.vue';

let watcherRegistered = false;
const fileChangeSubscribers = new Set();
const markdownRenderer = new marked.Renderer();

markdownRenderer.code = function codeRenderer(codeToken, infostring) {
  const source = typeof codeToken === 'string' ? codeToken : codeToken.text || '';
  const rawLanguage = typeof codeToken === 'string' ? infostring : codeToken.lang;
  const language = rawLanguage && hljs.getLanguage(rawLanguage) ? rawLanguage : null;
  const highlighted = language
    ? hljs.highlight(source, { language }).value
    : hljs.highlightAuto(source).value;
  const className = language ? `language-${language}` : 'language-plaintext';
  return `<pre><code class="hljs ${className}">${highlighted}</code></pre>`;
};

function ensureFileWatcher() {
  if (watcherRegistered || typeof window === 'undefined') {
    return;
  }

  window.electron.ipcRenderer.on('watcher:fileChanged', (payload) => {
    fileChangeSubscribers.forEach((subscriber) => subscriber(payload));
  });
  watcherRegistered = true;
}

marked.setOptions({
  gfm: true,
  breaks: true,
  renderer: markdownRenderer,
});

export default {
  name: 'FilePreviewView',
  components: {
    VersionsPanel,
  },
  props: {
    filePath: { type: String, default: '' }
  },
  setup(props) {
    const route = useRoute();
    const router = useRouter();
    const loading = ref(false);
    const notFound = ref(false);
    const markdown = ref('');
    const activePath = ref('');
    const versionEntries = ref([]);
    const versionsLoading = ref(false);
    const isVersionsPanelOpen = ref(false);

    const isEditMode = computed(() => route.query.edit === '1');
    const editorContainer = ref(null);
    const editContent = ref('');
    const editPreviewHtml = ref('');
    const originalContent = ref('');
    const saving = ref(false);
    let editorView = null;
    let previewDebounce = null;
    const viewingHistorical = ref(false);
    const historicalHash = ref('');
    const historicalDate = ref('');
    const historicalMessage = ref('');
    const historicalError = ref('');

    const IMAGE_EXTS = /\.(png|jpg|jpeg|gif|bmp|webp|svg)$/i;
    const imageDataUrl = ref('');

    const isImage = computed(() => IMAGE_EXTS.test(activePath.value));
    const isPrd = computed(() => activePath.value.startsWith('Product Requirements Document/') && activePath.value.endsWith('.md'));
    const isSkill = computed(() => activePath.value.startsWith('Skills/') && activePath.value.endsWith('.md'));
    const isArchitecture = computed(() => activePath.value.startsWith('Architecture/') && activePath.value.endsWith('.md'));
    const isEpic = computed(() => activePath.value.startsWith('Epics/') && activePath.value.endsWith('.md'));

    function refinePrdWithAi() {
      if (window.__planNavigate) window.__planNavigate('plan-prd');
    }

    function createNewPrd() {
      if (window.__planNavigate) window.__planNavigate('plan-prd');
    }

    function refineArchWithAi() {
      if (window.__planNavigate) window.__planNavigate('plan-architecture');
    }

    function createNewArch() {
      if (window.__planNavigate) window.__planNavigate('plan-architecture');
    }

    function backToSkills() {
      if (window.__planNavigate) window.__planNavigate('plan-skills');
    }

    function backToEpics() {
      if (window.__planNavigate) window.__planNavigate('plan-epics');
    }

    function refineEpicWithAi() {
      if (window.__planNavigate) window.__planNavigate('plan-epics');
    }

    const normalizedPath = computed(() => {
      const routePath = route.params.path;
      const joinedPath = Array.isArray(routePath) ? routePath.join('/') : routePath || '';
      const fromRoute = decodeURIComponent(joinedPath).replace(/^\/+/, '');
      return fromRoute || props.filePath || '';
    });

    const fileName = computed(() => {
      if (!activePath.value) {
        return '';
      }

      const parts = activePath.value.split('/').filter(Boolean);
      return parts[parts.length - 1] || '';
    });

    const folderBreadcrumb = computed(() => {
      if (!activePath.value) {
        return 'docs /';
      }

      const parts = activePath.value.split('/').filter(Boolean);
      const folders = parts.slice(0, -1);
      return folders.length ? `docs / ${folders.join(' / ')} /` : 'docs /';
    });

    const renderedHtml = computed(() => {
      if (!markdown.value) {
        return '<p class="empty-copy">This file is empty.</p>';
      }

      return marked.parse(markdown.value);
    });

    const versionsButtonDisabled = computed(() => loading.value || versionsLoading.value || !versionEntries.value.length);

    const versionsButtonLabel = computed(() => {
      const count = versionEntries.value.length;
      return count > 1 ? `Versions (${count})` : 'Versions';
    });

    async function loadFile() {
      const nextPath = normalizedPath.value;
      activePath.value = nextPath;
      isVersionsPanelOpen.value = false;
      versionEntries.value = [];
      viewingHistorical.value = false;
      historicalHash.value = '';
      historicalDate.value = '';
      historicalMessage.value = '';
      historicalError.value = '';

      if (!nextPath) {
        markdown.value = '';
        notFound.value = true;
        return;
      }

      loading.value = true;
      notFound.value = false;
      imageDataUrl.value = '';

      try {
        if (IMAGE_EXTS.test(nextPath)) {
          imageDataUrl.value = await window.electron.ipcRenderer.invoke('filetree:readImage', nextPath);
        } else {
          markdown.value = await window.electron.ipcRenderer.invoke('filetree:readFile', nextPath);
        }
      } catch (error) {
        markdown.value = '';
        notFound.value = true;
        if (!String(error && error.message ? error.message : error).includes('ENOENT')) {
          console.error('Failed to load file:', error);
        }
      } finally {
        loading.value = false;
      }

      if (!IMAGE_EXTS.test(nextPath)) {
        await loadVersionEntries();
      }
    }

    async function loadVersionEntries() {
      if (!activePath.value) {
        versionEntries.value = [];
        return;
      }

      versionsLoading.value = true;

      try {
        versionEntries.value = await window.electron.ipcRenderer.invoke('version:log', activePath.value, 500);
      } catch (error) {
        versionEntries.value = [];
        console.error('Failed to load version history:', error);
      } finally {
        versionsLoading.value = false;
      }
    }

    function onEdit() {
      originalContent.value = markdown.value;
      editContent.value = markdown.value;
      editPreviewHtml.value = marked.parse(markdown.value);
      router.replace({
        path: route.path,
        query: { ...route.query, edit: '1' },
      });
    }

    watch(isEditMode, (editing) => {
      if (editing) {
        nextTick(() => setupEditor());
      } else {
        destroyEditor();
      }
    });

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

    function exitEditMode() {
      destroyEditor();
      const { edit, ...rest } = route.query;
      router.replace({ path: route.path, query: rest });
    }

    function onCancelEdit() {
      markdown.value = originalContent.value;
      exitEditMode();
    }

    async function onSave() {
      saving.value = true;
      try {
        await window.electron.ipcRenderer.invoke('filetree:writeFile', activePath.value, editContent.value);
        markdown.value = editContent.value;
        exitEditMode();
      } catch (error) {
        console.error('Failed to save file:', error);
        alert('Failed to save: ' + (error.message || error));
      } finally {
        saving.value = false;
      }
    }

    async function toggleVersionsPanel() {
      if (versionsButtonDisabled.value && !isVersionsPanelOpen.value) {
        return;
      }

      if (isVersionsPanelOpen.value) {
        isVersionsPanelOpen.value = false;
        return;
      }

      await loadVersionEntries();
      if (versionEntries.value.length) {
        isVersionsPanelOpen.value = true;
      }
    }

    function closeVersionsPanel() {
      isVersionsPanelOpen.value = false;
    }

    async function handleVersionSelect(hash) {
      const entry = versionEntries.value.find((e) => e.hash === hash);
      historicalError.value = '';

      try {
        const content = await window.electron.ipcRenderer.invoke('version:fileAtCommit', hash, activePath.value);
        if (content === null || content === undefined) {
          historicalError.value = 'This file did not exist at the selected version.';
          viewingHistorical.value = true;
          historicalHash.value = hash;
          historicalDate.value = entry ? formatEntryDate(entry.date) : hash;
          historicalMessage.value = entry ? entry.message : '';
          markdown.value = '';
          return;
        }
        markdown.value = content;
        viewingHistorical.value = true;
        historicalHash.value = hash;
        historicalDate.value = entry ? formatEntryDate(entry.date) : hash;
        historicalMessage.value = entry ? entry.message : '';
      } catch (error) {
        historicalError.value = `Failed to load file at this version: ${error.message || error}`;
        viewingHistorical.value = true;
        historicalHash.value = hash;
        historicalDate.value = entry ? formatEntryDate(entry.date) : hash;
        historicalMessage.value = entry ? entry.message : '';
        markdown.value = '';
      }
    }

    async function backToCurrent() {
      viewingHistorical.value = false;
      historicalHash.value = '';
      historicalDate.value = '';
      historicalMessage.value = '';
      historicalError.value = '';
      await loadFile();
    }

    function formatEntryDate(value) {
      if (!value) return 'Unknown date';
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return value;
      const formatter = new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
      });
      const parts = formatter.formatToParts(parsed);
      const p = Object.fromEntries(parts.map((pt) => [pt.type, pt.value]));
      return `${p.month} ${p.day}, ${p.year} ${p.hour}:${p.minute} ${p.dayPeriod}`;
    }

    function handleEscapeKey(event) {
      if (event.key === 'Escape' && isVersionsPanelOpen.value) {
        closeVersionsPanel();
      }
    }

    const handleFileChange = () => {
      if (activePath.value) {
        loadFile();
      }
    };

    onMounted(() => {
      ensureFileWatcher();
      fileChangeSubscribers.add(handleFileChange);
      window.addEventListener('keydown', handleEscapeKey);
      loadFile();
    });

    onUnmounted(() => {
      destroyEditor();
      fileChangeSubscribers.delete(handleFileChange);
      window.removeEventListener('keydown', handleEscapeKey);
    });

    watch(() => normalizedPath.value, () => {
      loadFile();
    });

    return {
      backToCurrent,
      fileName,
      folderBreadcrumb,
      historicalDate,
      historicalError,
      historicalMessage,
      editorContainer,
      editPreviewHtml,
      imageDataUrl,
      isEditMode,
      isImage,
      isPrd,
      isArchitecture,
      isSkill,
      isEpic,
      backToEpics,
      refineEpicWithAi,
      refinePrdWithAi,
      createNewPrd,
      refineArchWithAi,
      createNewArch,
      backToSkills,
      isVersionsPanelOpen,
      loading,
      notFound,
      onEdit,
      onCancelEdit,
      onSave,
      saving,
      closeVersionsPanel,
      handleVersionSelect,
      renderedHtml,
      toggleVersionsPanel,
      versionEntries,
      versionsButtonDisabled,
      versionsButtonLabel,
      versionsLoading,
      viewingHistorical,
    };
  },
};
</script>

<style scoped>
.file-preview-view {
  max-width: 100%;
}

.file-preview-view--edit {
  max-width: 100%;
}

.preview-layout {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.title-bar,
.state-card,
.markdown-body {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  box-shadow: var(--box-shadow);
}

.title-bar {
  align-items: center;
  display: flex;
  gap: 1rem;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
}

.title-actions {
  align-items: center;
  display: flex;
  gap: 0.75rem;
}

.title-copy {
  min-width: 0;
}

.folder-path {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin: 0 0 0.35rem;
}

.file-name {
  color: var(--text-color);
  font-size: 1.75rem;
  margin: 0;
  overflow-wrap: anywhere;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
  border: none;
  border-radius: var(--border-radius);
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.5rem 1rem;
  transition: var(--transition);
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.12);
}

.prd-ai-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: #6dd4a0;
  color: #0A1220;
  border: none;
  border-radius: var(--border-radius);
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
  padding: 0.5rem 1rem;
  transition: var(--transition);
}

.prd-ai-btn:hover {
  background: #86efac;
}

.prd-ai-btn .mdi {
  font-size: 1rem;
}

.edit-btn {
  background: var(--primary-color);
  border: none;
  border-radius: var(--border-radius);
  color: #fff;
  cursor: pointer;
  font-size: 0.9rem;
  padding: 0.55rem 1.2rem;
  transition: var(--transition);
}

.edit-btn:hover {
  background: var(--primary-hover);
}

.versions-btn {
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  color: var(--text-color);
  cursor: pointer;
  font-size: 0.9rem;
  padding: 0.55rem 1rem;
  transition: var(--transition);
}

.versions-btn:hover:not(:disabled) {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.versions-btn:disabled {
  color: var(--text-muted);
  cursor: not-allowed;
  opacity: 0.6;
}

.history-banner {
  align-items: center;
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: var(--border-radius);
  display: flex;
  gap: 1rem;
  justify-content: space-between;
  padding: 0.75rem 1.25rem;
}

.history-banner__text {
  color: #92400e;
  font-size: 0.9rem;
  font-weight: 500;
}

.history-banner__back {
  background: #f59e0b;
  border: none;
  border-radius: var(--border-radius);
  color: #fff;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.45rem 1rem;
  transition: var(--transition);
  white-space: nowrap;
}

.history-banner__back:hover {
  background: #d97706;
}

.state-card {
  padding: 2rem;
}

.state-card h1,
.state-card h2 {
  color: var(--text-color);
  margin: 0 0 0.5rem;
}

.state-text {
  color: var(--text-muted);
  margin: 0;
}

.markdown-body {
  color: var(--text-color);
  line-height: 1.7;
  padding: 1.5rem;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  color: var(--text-color);
  margin: 1.5rem 0 0.6rem;
}

.markdown-body :deep(h1:first-child),
.markdown-body :deep(h2:first-child),
.markdown-body :deep(h3:first-child) {
  margin-top: 0;
}

.markdown-body :deep(p),
.markdown-body :deep(ul),
.markdown-body :deep(ol),
.markdown-body :deep(table),
.markdown-body :deep(blockquote) {
  margin: 0 0 1rem;
}

.markdown-body :deep(pre) {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  margin: 0 0 1rem;
  overflow-x: auto;
  padding: 1rem;
}

.markdown-body :deep(code) {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.875rem;
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--border-color);
  padding: 0.55rem 0.7rem;
  text-align: left;
}

.markdown-body :deep(a) {
  color: var(--primary-color);
}

.markdown-body :deep(.empty-copy) {
  color: var(--text-muted);
  margin: 0;
}

/* Editor split-pane */
.editor-split {
  display: flex;
  gap: 1px;
  flex: 1;
  min-height: 400px;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  overflow: hidden;
}

.editor-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-color);
}

.codemirror-container {
  flex: 1;
  overflow: auto;
}

.codemirror-container :deep(.cm-editor) {
  height: 100%;
}

.codemirror-container :deep(.cm-scroller) {
  overflow: auto;
}

.preview-pane {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
}

.preview-pane .markdown-body {
  border: none;
  box-shadow: none;
}

.save-btn {
  background: #16a34a;
  border: none;
  border-radius: var(--border-radius);
  color: #fff;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  padding: 0.55rem 1.2rem;
  transition: var(--transition);
}

.save-btn:hover:not(:disabled) {
  background: #15803d;
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.cancel-btn {
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  color: var(--text-color);
  cursor: pointer;
  font-size: 0.9rem;
  padding: 0.55rem 1rem;
  transition: var(--transition);
}

.cancel-btn:hover {
  border-color: var(--text-muted);
}

/* Image preview */
.image-preview {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  box-shadow: var(--box-shadow);
  padding: 1rem;
  text-align: center;
}

.image-full {
  max-width: 100%;
  max-height: 80vh;
  object-fit: contain;
}
</style>
