<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content changes-modal">
      <div class="modal-header changes-header">
        <div class="changes-title-group">
          <span class="mdi mdi-source-branch changes-icon"></span>
          <div>
            <h2>Changes: {{ ticket?.id }}</h2>
            <p class="changes-subtitle">{{ ticket?.title || 'Untitled' }}</p>
          </div>
        </div>
        <div class="changes-header-meta">
          <span v-if="commit.shortSha" class="changes-chip mono">{{ commit.shortSha }}</span>
          <span v-if="commit.totals" class="changes-chip">
            {{ commit.totals.files }} file{{ commit.totals.files === 1 ? '' : 's' }}
            <span class="stat-add">+{{ commit.totals.additions }}</span>
            <span class="stat-del">−{{ commit.totals.deletions }}</span>
          </span>
          <button class="changes-close" @click="$emit('close')" title="Close">
            <span class="mdi mdi-close"></span>
          </button>
        </div>
      </div>

      <div class="modal-body changes-body">
        <p v-if="loadingFiles" class="changes-state">
          <span class="mdi mdi-loading mdi-spin"></span> Loading changed files…
        </p>

        <p v-else-if="loadError" class="changes-state is-error">
          <span class="mdi mdi-alert-circle-outline"></span> {{ loadError }}
        </p>

        <p v-else-if="!files.length" class="changes-state">
          <span class="mdi mdi-information-outline"></span> This commit changed no files.
        </p>

        <div v-else class="changes-layout">
          <!-- Column 1: changed files -->
          <aside class="file-column">
            <ul class="file-list">
              <li v-for="group in groupedFiles" :key="group.dir" class="file-group">
                <div class="file-group-dir" :title="group.dir">{{ group.dir || '/' }}</div>
                <button
                  v-for="file in group.files"
                  :key="file.path"
                  class="file-item"
                  :class="{ 'is-selected': selectedPath === file.path }"
                  @click="selectFile(file)"
                  :title="file.path"
                >
                  <span class="file-status" :class="`is-${file.statusLabel}`">{{ file.status }}</span>
                  <span class="file-name">{{ baseName(file.path) }}</span>
                  <span v-if="file.binary" class="file-counts mono">bin</span>
                  <span v-else class="file-counts mono">
                    <span class="stat-add">+{{ file.additions }}</span>
                    <span class="stat-del">−{{ file.deletions }}</span>
                  </span>
                </button>
              </li>
            </ul>
          </aside>

          <!-- Columns 2 & 3: before / after -->
          <section class="diff-column">
            <div v-if="selectedFile" class="diff-toolbar">
              <span class="diff-path mono">{{ selectedFile.path }}</span>
              <span v-if="selectedFile.oldPath" class="diff-renamed">
                renamed from <span class="mono">{{ selectedFile.oldPath }}</span>
              </span>
            </div>

            <div class="diff-pane-labels" v-if="mergeReady">
              <span>Before</span>
              <span>After</span>
            </div>

            <p v-if="!selectedFile" class="changes-state">
              <span class="mdi mdi-arrow-left"></span> Select a file to view its changes.
            </p>

            <p v-else-if="loadingDiff" class="changes-state">
              <span class="mdi mdi-loading mdi-spin"></span> Loading diff…
            </p>

            <p v-else-if="diffError" class="changes-state is-error">
              <span class="mdi mdi-alert-circle-outline"></span> {{ diffError }}
            </p>

            <p v-else-if="diff?.binary" class="changes-state">
              <span class="mdi mdi-file-question-outline"></span> Binary file — no text diff to show.
            </p>

            <div v-else-if="diff?.tooLarge" class="changes-state changes-too-large">
              <span class="mdi mdi-alert-outline"></span>
              This file is {{ formatBytes(diff.bytes) }} — large enough to make the editor sluggish.
              <button class="show-anyway-btn" @click="loadDiff(selectedFile, true)">Show anyway</button>
            </div>

            <!-- v-show, not v-if: CodeMirror measures its container on
                 construction, so the node must already be laid out. -->
            <div v-show="hasRenderableDiff" ref="mergeContainer" class="merge-container"></div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { MergeView } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { html as htmlLang } from '@codemirror/lang-html';
import { css as cssLang } from '@codemirror/lang-css';
import { markdown as markdownLang } from '@codemirror/lang-markdown';
import { cpp as cppLang } from '@codemirror/lang-cpp';
import { python as pythonLang } from '@codemirror/lang-python';
import { rust as rustLang } from '@codemirror/lang-rust';
import { StreamLanguage } from '@codemirror/language';
import { csharp as csharpMode } from '@codemirror/legacy-modes/mode/clike';
import { ruby as rubyMode } from '@codemirror/legacy-modes/mode/ruby';
import { oneDark } from '@codemirror/theme-one-dark';

// C# and Ruby have no Lezer grammar published, so they use the legacy
// CodeMirror 5 stream modes. Highlighting is coarser than a real parser gives,
// but it beats plain text and needs no third-party package.
const csharp = () => StreamLanguage.define(csharpMode);
const ruby = () => StreamLanguage.define(rubyMode);

/**
 * Only these language packs are installed. Anything else renders as plain text
 * with the diff highlighting intact — no extra dependencies for the long tail.
 */
const LANGUAGE_BY_EXTENSION = {
  js: javascript, jsx: () => javascript({ jsx: true }),
  ts: () => javascript({ typescript: true }), tsx: () => javascript({ typescript: true, jsx: true }),
  mjs: javascript, cjs: javascript,
  json: javascript,
  html: htmlLang, htm: htmlLang, vue: htmlLang,
  css: cssLang, scss: cssLang,
  md: markdownLang, markdown: markdownLang,
  // C/C++ — the pack covers both, plus the usual header extensions.
  c: cppLang, h: cppLang, cpp: cppLang, cxx: cppLang, cc: cppLang,
  hpp: cppLang, hxx: cppLang, hh: cppLang,
  cs: csharp,
  py: pythonLang, pyw: pythonLang, pyi: pythonLang,
  rs: rustLang,
  rb: ruby, rake: ruby, gemspec: ruby
};

function languageExtension(filePath) {
  const ext = String(filePath || '').split('.').pop()?.toLowerCase();
  const factory = LANGUAGE_BY_EXTENSION[ext];
  if (!factory) return [];
  try {
    return factory();
  } catch (_) {
    return [];
  }
}

export default {
  name: 'TicketChangesDialog',
  props: {
    ticket: { type: Object, required: true }
  },
  emits: ['close'],
  setup(props) {
    const files = ref([]);
    const commit = ref({});
    const loadingFiles = ref(true);
    const loadError = ref('');

    const selectedPath = ref('');
    const selectedFile = computed(() => files.value.find(f => f.path === selectedPath.value) || null);
    const diff = ref(null);
    const loadingDiff = ref(false);
    const diffError = ref('');

    const mergeContainer = ref(null);
    let mergeView = null;

    /**
     * Whether the loaded diff is renderable at all.
     *
     * Deliberately independent of loadingDiff: renderMergeView() runs while the
     * load is still settling, and folding the loading flag in here once made it
     * bail every time, leaving two empty panes.
     */
    const hasRenderableDiff = computed(() => (
      !!diff.value && !diff.value.binary && !diff.value.tooLarge && !diffError.value
    ));

    const mergeReady = computed(() => hasRenderableDiff.value && !loadingDiff.value);

    const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';

    const baseName = (filePath) => String(filePath || '').split('/').pop();

    const groupedFiles = computed(() => {
      const groups = new Map();
      for (const file of files.value) {
        const parts = String(file.path).split('/');
        const dir = parts.slice(0, -1).join('/');
        if (!groups.has(dir)) groups.set(dir, []);
        groups.get(dir).push(file);
      }
      return [...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dir, groupFiles]) => ({ dir, files: groupFiles }));
    });

    const formatBytes = (bytes) => {
      const value = Number(bytes) || 0;
      if (value < 1024) return `${value} B`;
      if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
      return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    };

    function destroyMergeView() {
      if (mergeView) {
        mergeView.destroy();
        mergeView = null;
      }
    }

    function renderMergeView() {
      destroyMergeView();
      if (!hasRenderableDiff.value || !mergeContainer.value) return;

      const language = languageExtension(diff.value.path);
      const baseExtensions = [
        lineNumbers(),
        EditorView.editable.of(false),
        EditorState.readOnly.of(true),
        EditorView.lineWrapping,
        language,
        ...(isDark() ? [oneDark] : [])
      ];

      mergeView = new MergeView({
        a: {
          doc: diff.value.before ?? '',
          extensions: baseExtensions
        },
        b: {
          doc: diff.value.after ?? '',
          extensions: baseExtensions
        },
        parent: mergeContainer.value,
        // Unchanged stretches collapse to a clickable spacer, so a small change
        // in a big file does not bury the reviewer in context.
        collapseUnchanged: { margin: 3, minSize: 6 },
        highlightChanges: true,
        gutter: true
      });
    }

    async function loadFiles() {
      loadingFiles.value = true;
      loadError.value = '';
      try {
        const response = await window.electron.ipcRenderer.invoke('gitdiff:changedFiles', props.ticket.id);
        if (!response?.success) {
          loadError.value = response?.error?.message || 'Unable to load changes.';
          return;
        }
        commit.value = response.data;
        files.value = response.data.files || [];
        const firstText = files.value.find(f => !f.binary) || files.value[0];
        if (firstText) await selectFile(firstText);
      } catch (error) {
        loadError.value = error?.message || 'Unable to load changes.';
      } finally {
        loadingFiles.value = false;
      }
    }

    async function loadDiff(file, allowLarge = false) {
      if (!file) return;
      loadingDiff.value = true;
      diffError.value = '';
      destroyMergeView();
      try {
        const response = await window.electron.ipcRenderer.invoke('gitdiff:fileDiff', {
          ticketId: props.ticket.id,
          filePath: file.path,
          oldPath: file.oldPath || null,
          allowLarge
        });
        if (!response?.success) {
          diffError.value = response?.error?.message || 'Unable to load this file.';
          diff.value = null;
          return;
        }
        diff.value = response.data;
        // Clear the flag before rendering so the container is laid out rather
        // than display:none when CodeMirror measures it.
        loadingDiff.value = false;
        await nextTick();
        renderMergeView();
      } catch (error) {
        diffError.value = error?.message || 'Unable to load this file.';
        diff.value = null;
      } finally {
        loadingDiff.value = false;
      }
    }

    async function selectFile(file) {
      selectedPath.value = file.path;
      await loadDiff(file, false);
    }

    onMounted(loadFiles);
    onBeforeUnmount(destroyMergeView);

    return {
      files,
      commit,
      loadingFiles,
      loadError,
      selectedPath,
      selectedFile,
      groupedFiles,
      diff,
      loadingDiff,
      diffError,
      mergeReady,
      hasRenderableDiff,
      mergeContainer,
      selectFile,
      loadDiff,
      baseName,
      formatBytes
    };
  }
};
</script>

<style scoped>
.changes-modal {
  width: 95vw;
  max-width: 1800px;
  height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.changes-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-shrink: 0;
}

.changes-title-group {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
}

.changes-title-group h2 { margin: 0; font-size: 1.05rem; }
.changes-icon { font-size: 1.4rem; color: #5e6c84; }

.changes-subtitle {
  margin: 0.15rem 0 0;
  font-size: 0.82rem;
  color: #5e6c84;
}

.changes-header-meta {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.changes-chip {
  display: inline-flex;
  gap: 0.35rem;
  border-radius: 999px;
  padding: 0.2rem 0.6rem;
  background-color: #f1f5f9;
  font-size: 0.7rem;
  font-weight: 600;
  color: #42526e;
  white-space: nowrap;
}

.changes-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.1rem;
  color: #5e6c84;
  padding: 0.15rem 0.3rem;
}

.changes-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  /* The two inner columns own their own scrollbars; the body itself must not
     scroll or the file list would slide out of view with the diff. */
  overflow: hidden;
}

.changes-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(220px, 300px) 1fr;
  gap: 0.75rem;
}

.file-column {
  min-height: 0;
  overflow-y: auto;
  border: 1px solid #dbe5f0;
  border-radius: 6px;
  background-color: #f8fafc;
}

.file-list { list-style: none; margin: 0; padding: 0.35rem; }

.file-group + .file-group { margin-top: 0.5rem; }

.file-group-dir {
  padding: 0.2rem 0.35rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.2px;
  text-transform: uppercase;
  color: #5e6c84;
  word-break: break-all;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  padding: 0.3rem 0.35rem;
  border: none;
  border-radius: 4px;
  background: none;
  cursor: pointer;
  text-align: left;
  font-size: 0.78rem;
  color: inherit;
}

.file-item:hover { background-color: #e8eef6; }
.file-item.is-selected { background-color: #dbeafe; font-weight: 600; }

.file-status {
  flex-shrink: 0;
  width: 1.1rem;
  text-align: center;
  font-size: 0.68rem;
  font-weight: 700;
  border-radius: 3px;
}

.file-status.is-added { color: #166534; }
.file-status.is-deleted { color: #b91c1c; }
.file-status.is-modified { color: #b45309; }
.file-status.is-renamed,
.file-status.is-copied { color: #4338ca; }

.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-counts { flex-shrink: 0; font-size: 0.68rem; display: flex; gap: 0.25rem; }
.stat-add { color: #16a34a; }
.stat-del { color: #dc2626; }

.diff-column {
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid #dbe5f0;
  border-radius: 6px;
  overflow: hidden;
}

.diff-toolbar {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid #dbe5f0;
  background-color: #f8fafc;
  font-size: 0.76rem;
  flex-shrink: 0;
}

.diff-path { font-weight: 600; word-break: break-all; }
.diff-renamed { color: #5e6c84; font-size: 0.72rem; }

.diff-pane-labels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-bottom: 1px solid #dbe5f0;
  background-color: #f1f5f9;
  flex-shrink: 0;
}

.diff-pane-labels span {
  padding: 0.25rem 0.6rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: #5e6c84;
}

.diff-pane-labels span + span { border-left: 1px solid #dbe5f0; }

.merge-container {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.merge-container :deep(.cm-mergeView),
.merge-container :deep(.cm-mergeViewEditors) { height: 100%; }
.merge-container :deep(.cm-editor) { height: 100%; }
.merge-container :deep(.cm-scroller) { font-size: 0.78rem; }

.changes-state {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  padding: 1rem;
  font-size: 0.85rem;
  color: #5e6c84;
}

.changes-state.is-error { color: #b91c1c; }

.changes-too-large { flex-wrap: wrap; }

.show-anyway-btn {
  border: 1px solid #dbe5f0;
  border-radius: 4px;
  padding: 0.2rem 0.55rem;
  background-color: #fff;
  cursor: pointer;
  font-size: 0.76rem;
  font-weight: 600;
}

.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }

[data-theme="dark"] .changes-icon,
[data-theme="dark"] .changes-subtitle,
[data-theme="dark"] .changes-state,
[data-theme="dark"] .changes-close,
[data-theme="dark"] .file-group-dir,
[data-theme="dark"] .diff-renamed,
[data-theme="dark"] .diff-pane-labels span { color: var(--text-muted); }

[data-theme="dark"] .file-column,
[data-theme="dark"] .diff-column,
[data-theme="dark"] .diff-toolbar,
[data-theme="dark"] .diff-pane-labels,
[data-theme="dark"] .changes-chip,
[data-theme="dark"] .show-anyway-btn {
  background-color: #161a1f;
  border-color: var(--border-color);
}

[data-theme="dark"] .changes-chip,
[data-theme="dark"] .show-anyway-btn { color: var(--text-color); }
[data-theme="dark"] .file-item:hover { background-color: #1e242b; }
[data-theme="dark"] .file-item.is-selected { background-color: #24303f; }
[data-theme="dark"] .changes-state.is-error { color: #e06060; }
</style>
