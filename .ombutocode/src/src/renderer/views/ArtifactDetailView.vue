<template>
  <div class="view-container" :class="{ 'view-container--edit': isEditMode }">
    <!-- Not Found -->
    <div v-if="notFound" class="not-found">
      <h1>Not Found</h1>
      <p class="text-muted">The artifact "{{ route.params.id }}" does not exist.</p>
      <router-link to="/tree" class="back-link">Back to Tree</router-link>
    </div>

    <!-- Loading -->
    <div v-else-if="artifactStore.loading" class="loading">
      <p class="text-muted">Loading artifact...</p>
    </div>

    <!-- Read Mode -->
    <div v-else-if="artifact && !isEditMode" class="artifact-detail fade-in">
      <!-- Breadcrumb trail -->
      <nav class="breadcrumb-trail" v-if="breadcrumbs.length > 0">
        <span v-for="(crumb, index) in breadcrumbs" :key="crumb.id">
          <router-link :to="`/artifact/${crumb.id}`" class="breadcrumb-link">
            {{ crumb.id }}
          </router-link>
          <span class="breadcrumb-separator" v-if="index < breadcrumbs.length - 1"> &gt; </span>
        </span>
        <span class="breadcrumb-separator"> &gt; </span>
        <span class="breadcrumb-current">{{ artifact.id }}</span>
      </nav>

      <!-- Metadata header -->
      <div class="metadata-header">
        <div class="header-top flex items-center justify-between">
          <div class="header-title-row flex items-center">
            <span class="artifact-id text-muted">{{ artifact.id }}</span>
            <h1 class="artifact-title">{{ artifact.title }}</h1>
          </div>
          <button class="edit-btn" @click="onEdit">Edit</button>
        </div>

        <div class="metadata-row flex flex-wrap items-center">
          <span class="type-label">{{ typeLabel(artifact.type) }}</span>
          <span
            class="status-badge"
            :class="statusClass(artifact.status)"
          >{{ artifact.status }}</span>
          <span class="meta-item text-muted text-sm">
            Created: {{ formatDate(artifact.created) }}
          </span>
          <span class="meta-item text-muted text-sm">
            Updated: {{ formatDate(artifact.updated) }}
          </span>
          <span v-if="artifact.tags && artifact.tags.length" class="tags-row">
            <span class="tag" v-for="tag in artifact.tags" :key="tag">{{ tag }}</span>
          </span>
        </div>
      </div>

      <!-- Markdown body -->
      <div class="artifact-body card" v-html="renderedBody"></div>

      <!-- Children section -->
      <div v-if="children.length > 0" class="children-section">
        <h2>Children</h2>
        <div class="children-grid">
          <router-link
            v-for="child in children"
            :key="child.id"
            :to="`/artifact/${child.id}`"
            class="child-card card"
          >
            <div class="child-header flex items-center">
              <span class="status-dot" :class="statusClass(child.status)"></span>
              <span class="child-id">{{ child.id }}</span>
            </div>
            <div class="child-title">{{ child.title }}</div>
          </router-link>
        </div>
      </div>
    </div>

    <!-- Edit Mode -->
    <div v-else-if="artifact && isEditMode" class="artifact-edit fade-in">
      <!-- Edit header -->
      <div class="edit-header">
        <div class="edit-header-left">
          <span class="artifact-id text-muted">{{ artifact.id }}</span>
          <span class="type-label">{{ typeLabel(artifact.type) }}</span>
        </div>
        <div class="edit-header-actions">
          <button class="cancel-btn" @click="onCancel">Cancel</button>
          <button class="save-btn" @click="onSave" :disabled="artifactStore.loading">Save</button>
        </div>
      </div>

      <!-- Form controls -->
      <div class="edit-form card">
        <!-- Title -->
        <div class="form-row">
          <label class="form-label">Title</label>
          <input type="text" v-model="editTitle" class="form-input" placeholder="Artifact title" />
        </div>

        <!-- Status -->
        <div class="form-row">
          <label class="form-label">Status</label>
          <select v-model="editStatus" class="form-select">
            <option value="draft">draft</option>
            <option value="active">active</option>
            <option value="review">review</option>
            <option value="done">done</option>
            <option value="archived">archived</option>
          </select>
        </div>

        <!-- Parent (only shown when artifact type requires one) -->
        <div class="form-row" v-if="parentType !== null">
          <label class="form-label">Parent</label>
          <select v-model="editParent" class="form-select">
            <option value="">— none —</option>
            <option v-for="p in availableParents" :key="p.id" :value="p.id">
              {{ p.id }} — {{ p.title }}
            </option>
          </select>
        </div>

        <!-- Priority (optional) -->
        <div class="form-row">
          <label class="form-label">Priority</label>
          <select v-model="editPriority" class="form-select">
            <option value="">— none —</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="critical">critical</option>
          </select>
        </div>

        <!-- Tags -->
        <div class="form-row">
          <label class="form-label">Tags</label>
          <div class="tags-editor">
            <span class="tag-chip" v-for="(tag, i) in editTags" :key="i">
              {{ tag }}
              <button class="tag-remove" @click="removeTag(i)" type="button">×</button>
            </span>
            <input
              type="text"
              v-model="newTagInput"
              class="tag-input"
              placeholder="Add tag…"
              @keydown.enter.prevent="addTag"
              @keydown.188.prevent="addTag"
            />
            <button
              v-if="newTagInput.trim()"
              class="tag-add-btn"
              type="button"
              @click="addTag"
            >Add</button>
          </div>
        </div>
      </div>

      <!-- Split pane: editor + preview -->
      <div class="split-pane">
        <div class="editor-pane">
          <div class="pane-label">Markdown</div>
          <div ref="cmContainer" class="cm-container"></div>
        </div>
        <div class="preview-pane">
          <div class="pane-label">Preview</div>
          <div class="preview-content artifact-body" v-html="previewHtml"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useArtifactStore } from '../stores/artifactStore';
import { marked } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';

// CodeMirror 6
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown as markdownLang } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';

const TYPE_LABELS = {
  prd: 'PRD',
  comp: 'Component',
  fr: 'Functional Req',
  nfr: 'Non-Functional Req',
  epic: 'EPIC',
  us: 'User Story',
  ac: 'Acceptance Criteria',
};

// Hierarchy: maps artifact type -> required parent type (null = no parent allowed)
const PARENT_TYPES = {
  prd: null,
  comp: 'prd',
  fr: 'prd',
  nfr: 'prd',
  epic: 'comp',
  us: 'epic',
  ac: 'us',
};

export default {
  name: 'ArtifactDetailView',
  props: {
    filePath: { type: String, default: '' }
  },
  setup(props) {
    const route = useRoute();
    const router = useRouter();
    const artifactStore = useArtifactStore();
    const notFound = ref(false);
    const breadcrumbs = ref([]);
    const children = ref([]);

    // Edit mode state
    const isEditMode = ref(false);
    const editTitle = ref('');
    const editStatus = ref('draft');
    const editParent = ref('');
    const editTags = ref([]);
    const editPriority = ref('');
    const editBody = ref('');
    const newTagInput = ref('');
    const previewHtml = ref('');
    const cmContainer = ref(null);
    let editorView = null;
    let previewTimer = null;

    // Configure marked with highlight.js
    marked.setOptions({
      highlight(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
      },
    });

    const artifact = computed(() => artifactStore.currentArtifact);

    const renderedBody = computed(() => {
      if (!artifact.value || !artifact.value.body) return '';
      return marked(artifact.value.body);
    });

    const wantsEditMode = computed(() => route.query.edit === '1');

    const parentType = computed(() => {
      if (!artifact.value) return undefined;
      const t = (artifact.value.type || '').toLowerCase();
      return Object.prototype.hasOwnProperty.call(PARENT_TYPES, t) ? PARENT_TYPES[t] : undefined;
    });

    const availableParents = computed(() => {
      if (!parentType.value) return [];
      return artifactStore.artifactList.filter(
        (a) => (a.type || '').toLowerCase() === parentType.value
      );
    });

    function statusClass(status) {
      if (!status) return '';
      const s = status.toLowerCase();
      if (s === 'draft') return 'status-draft';
      if (s === 'active' || s === 'approved') return 'status-active';
      if (s === 'review' || s === 'in-review') return 'status-review';
      if (s === 'done' || s === 'completed') return 'status-done';
      if (s === 'archived' || s === 'deprecated') return 'status-archived';
      return 'status-default';
    }

    function formatDate(dateStr) {
      if (!dateStr) return '—';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    async function buildBreadcrumbs(art) {
      const crumbs = [];
      let current = art;
      while (current && current.parent_id) {
        const parent = await artifactStore.fetchOne(current.parent_id);
        if (!parent) break;
        crumbs.unshift({ id: parent.id, title: parent.title });
        current = parent;
      }
      // Restore currentArtifact since fetchOne overwrites it
      artifactStore.currentArtifact = art;
      breadcrumbs.value = crumbs;
    }

    async function loadChildren(artifactId) {
      const allArtifacts = await window.electron.ipcRenderer.invoke('artifact:list', { parent_id: artifactId });
      children.value = allArtifacts || [];
    }

    async function loadArtifact(id) {
      notFound.value = false;
      breadcrumbs.value = [];
      children.value = [];

      const result = await artifactStore.fetchOne(id);
      if (!result) {
        notFound.value = true;
        return;
      }

      await buildBreadcrumbs(result);
      await loadChildren(result.id);

      if (wantsEditMode.value) {
        enterEditMode(result, false);
      }
    }

    // --- Edit mode helpers ---

    function isDarkMode() {
      const el = document.documentElement;
      if (el.classList.contains('theme-dark')) return true;
      if (el.classList.contains('theme-light')) return false;
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    function schedulePreview() {
      if (previewTimer) clearTimeout(previewTimer);
      previewTimer = setTimeout(() => {
        previewHtml.value = marked(editBody.value);
      }, 200);
    }

    function initEditor() {
      if (editorView) {
        editorView.destroy();
        editorView = null;
      }

      const dark = isDarkMode();
      const extensions = [
        lineNumbers(),
        drawSelection(),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.lineWrapping,
        markdownLang(),
        ...(dark ? [oneDark] : []),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            editBody.value = update.state.doc.toString();
            schedulePreview();
          }
        }),
      ];

      editorView = new EditorView({
        state: EditorState.create({
          doc: editBody.value,
          extensions,
        }),
        parent: cmContainer.value,
      });
    }

    function destroyEditor() {
      if (editorView) {
        editorView.destroy();
        editorView = null;
      }
      if (previewTimer) {
        clearTimeout(previewTimer);
        previewTimer = null;
      }
    }

    function enterEditMode(art, syncRoute = true) {
      if (!art) return;
      editTitle.value = art.title || '';
      editStatus.value = art.status || 'draft';
      editParent.value = art.parent_id || '';
      editTags.value = Array.isArray(art.tags) ? [...art.tags] : [];
      editPriority.value = art.priority || '';
      editBody.value = art.body || '';
      previewHtml.value = marked(art.body || '');
      isEditMode.value = true;

      // Ensure artifact list is loaded for parent dropdown
      if (artifactStore.artifactList.length === 0) {
        artifactStore.fetchAll();
      }

      nextTick(() => {
        initEditor();
      });

      if (syncRoute && route.query.edit !== '1') {
        router.replace({
          path: route.path,
          query: { ...route.query, edit: '1' },
        });
      }
    }

    function exitEditMode(syncRoute = true) {
      destroyEditor();
      isEditMode.value = false;

      if (syncRoute && route.query.edit === '1') {
        const nextQuery = { ...route.query };
        delete nextQuery.edit;
        router.replace({
          path: route.path,
          query: nextQuery,
        });
      }
    }

    function onEdit() {
      enterEditMode(artifact.value);
    }

    function onCancel() {
      exitEditMode();
    }

    async function onSave() {
      if (!artifact.value) return;
      const payload = {
        title: editTitle.value,
        status: editStatus.value,
        parent: editParent.value || null,
        tags: editTags.value,
        priority: editPriority.value || null,
        body: editBody.value,
      };

      try {
        await artifactStore.update(artifact.value.id, payload);
        exitEditMode();
        await loadArtifact(artifact.value.id);
      } catch (err) {
        console.error('Failed to save artifact:', err);
      }
    }

    function addTag() {
      const tag = newTagInput.value.trim().replace(/,+$/, '');
      if (tag && !editTags.value.includes(tag)) {
        editTags.value.push(tag);
      }
      newTagInput.value = '';
    }

    function removeTag(index) {
      editTags.value.splice(index, 1);
    }

    onMounted(() => {
      loadArtifact(route.params.id || props.filePath);
    });

    onUnmounted(() => {
      destroyEditor();
    });

    watch(() => route.params.id || props.filePath, (newId) => {
      if (newId) {
        if (isEditMode.value) {
          exitEditMode(false);
        }
        loadArtifact(newId);
      }
    });

    watch(wantsEditMode, (shouldEdit) => {
      if (!artifact.value) {
        return;
      }

      if (shouldEdit && !isEditMode.value) {
        enterEditMode(artifact.value, false);
      }

      if (!shouldEdit && isEditMode.value) {
        exitEditMode(false);
      }
    });

    function typeLabel(type) {
      return TYPE_LABELS[(type || '').toLowerCase()] || (type || '').toUpperCase();
    }

    return {
      route,
      router,
      artifactStore,
      artifact,
      notFound,
      breadcrumbs,
      children,
      renderedBody,
      statusClass,
      formatDate,
      typeLabel,
      // edit mode
      isEditMode,
      editTitle,
      editStatus,
      editParent,
      editTags,
      editPriority,
      editBody,
      newTagInput,
      previewHtml,
      cmContainer,
      parentType,
      availableParents,
      onEdit,
      onCancel,
      onSave,
      addTag,
      removeTag,
    };
  },
};
</script>

<style scoped>
.view-container {
  max-width: 960px;
}

.view-container--edit {
  max-width: 100%;
}

/* Not Found */
.not-found {
  text-align: center;
  padding: 4rem 1rem;
}

.not-found h1 {
  color: var(--text-color);
  margin-bottom: 0.5rem;
}

.back-link {
  display: inline-block;
  margin-top: 1rem;
  color: var(--primary-color);
  text-decoration: none;
}

.back-link:hover {
  text-decoration: underline;
}

/* Breadcrumb */
.breadcrumb-trail {
  margin-bottom: 1rem;
  font-size: 0.875rem;
  color: var(--text-muted);
}

.breadcrumb-link {
  color: var(--primary-color);
  text-decoration: none;
}

.breadcrumb-link:hover {
  text-decoration: underline;
}

.breadcrumb-separator {
  margin: 0 0.25rem;
  color: var(--text-muted);
}

.breadcrumb-current {
  color: var(--text-color);
  font-weight: 600;
}

/* Metadata Header */
.metadata-header {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 1.25rem 1.5rem;
  box-shadow: var(--box-shadow);
  margin-bottom: 1.5rem;
}

.header-top {
  margin-bottom: 0.75rem;
}

.artifact-id {
  font-family: monospace;
  font-size: 0.875rem;
  margin-right: 0.75rem;
}

.artifact-title {
  font-size: 1.5rem;
  color: var(--text-color);
}

.edit-btn {
  background: var(--primary-color);
  color: #fff;
  border: none;
  border-radius: var(--border-radius);
  padding: 0.5rem 1.25rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: var(--transition);
}

.edit-btn:hover {
  background: var(--primary-hover);
}

.metadata-row {
  gap: 0.75rem;
}

.type-label {
  background: var(--secondary-color);
  color: var(--text-color);
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 500;
}

/* Status badge colors */
.status-badge {
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: capitalize;
}

.status-draft {
  background: var(--warning-color);
  color: #fff;
}

.status-active {
  background: var(--success-color);
  color: #fff;
}

.status-review {
  background: var(--primary-color);
  color: #fff;
}

.status-done {
  background: #6c757d;
  color: #fff;
}

.status-archived {
  background: var(--text-muted);
  color: #fff;
}

.status-default {
  background: var(--secondary-color);
  color: var(--text-color);
}

.meta-item {
  white-space: nowrap;
}

.tags-row {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.tag {
  background: var(--secondary-color);
  color: var(--text-muted);
  padding: 0.15rem 0.5rem;
  border-radius: 3px;
  font-size: 0.75rem;
}

/* Markdown body */
.artifact-body {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 1.5rem;
  box-shadow: var(--box-shadow);
  margin-bottom: 1.5rem;
  line-height: 1.7;
  color: var(--text-color);
}

.artifact-body :deep(h1),
.artifact-body :deep(h2),
.artifact-body :deep(h3) {
  margin-top: 1.25rem;
  margin-bottom: 0.5rem;
  color: var(--text-color);
}

.artifact-body :deep(p) {
  margin-bottom: 0.75rem;
}

.artifact-body :deep(pre) {
  background: var(--secondary-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 1rem;
  overflow-x: auto;
  margin-bottom: 0.75rem;
}

.artifact-body :deep(code) {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.875rem;
}

.artifact-body :deep(ul),
.artifact-body :deep(ol) {
  margin-left: 1.5rem;
  margin-bottom: 0.75rem;
}

.artifact-body :deep(a) {
  color: var(--primary-color);
}

/* Children section */
.children-section {
  margin-top: 1.5rem;
}

.children-section h2 {
  font-size: 1.15rem;
  color: var(--text-color);
  margin-bottom: 0.75rem;
}

.children-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.75rem;
}

.child-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 0.75rem 1rem;
  box-shadow: var(--box-shadow);
  text-decoration: none;
  color: var(--text-color);
  transition: var(--transition);
  display: block;
}

.child-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 2px 8px rgba(74, 144, 226, 0.15);
}

.child-header {
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.status-dot.status-draft {
  background: var(--warning-color);
}

.status-dot.status-active {
  background: var(--success-color);
}

.status-dot.status-review {
  background: var(--primary-color);
}

.status-dot.status-done {
  background: #6c757d;
}

.status-dot.status-archived {
  background: var(--text-muted);
}

.status-dot.status-default {
  background: var(--secondary-color);
}

.child-id {
  font-family: monospace;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.child-title {
  font-size: 0.9rem;
  font-weight: 500;
}

.loading {
  padding: 2rem;
  text-align: center;
}

/* =========================================================
   Edit Mode
   ========================================================= */

.artifact-edit {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 6rem);
}

.edit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 0;
  margin-bottom: 0.75rem;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.edit-header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.edit-header-actions {
  display: flex;
  gap: 0.5rem;
}

.cancel-btn {
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 0.5rem 1.25rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: var(--transition);
}

.cancel-btn:hover {
  border-color: var(--text-color);
  color: var(--text-color);
}

.save-btn {
  background: var(--primary-color);
  color: #fff;
  border: none;
  border-radius: var(--border-radius);
  padding: 0.5rem 1.25rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: var(--transition);
}

.save-btn:hover:not(:disabled) {
  background: var(--primary-hover);
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Form controls */
.edit-form {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 1rem 1.25rem;
  box-shadow: var(--box-shadow);
  margin-bottom: 0.75rem;
  flex-shrink: 0;
}

.form-row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.6rem;
}

.form-row:last-child {
  margin-bottom: 0;
}

.form-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  width: 72px;
  flex-shrink: 0;
  padding-top: 0.35rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.form-input,
.form-select {
  flex: 1;
  background: var(--bg-color);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 0.35rem 0.6rem;
  font-size: 0.875rem;
  outline: none;
  transition: var(--transition);
}

.form-input:focus,
.form-select:focus {
  border-color: var(--primary-color);
}

/* Tags editor */
.tags-editor {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
  flex: 1;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 0.25rem 0.5rem;
  min-height: 2rem;
}

.tags-editor:focus-within {
  border-color: var(--primary-color);
}

.tag-chip {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  background: var(--secondary-color);
  color: var(--text-color);
  padding: 0.1rem 0.45rem;
  border-radius: 3px;
  font-size: 0.75rem;
}

.tag-remove {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.9rem;
  line-height: 1;
  padding: 0;
}

.tag-remove:hover {
  color: var(--text-color);
}

.tag-input {
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-color);
  font-size: 0.8rem;
  min-width: 80px;
}

.tag-add-btn {
  background: var(--primary-color);
  color: #fff;
  border: none;
  border-radius: 3px;
  padding: 0.1rem 0.5rem;
  font-size: 0.75rem;
  cursor: pointer;
}

/* Split pane */
.split-pane {
  display: flex;
  gap: 0.75rem;
  flex: 1;
  min-height: 0;
}

.editor-pane,
.preview-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  background: var(--card-bg);
  overflow: hidden;
}

.pane-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  background: var(--secondary-color);
}

.cm-container {
  flex: 1;
  overflow: auto;
  font-size: 0.875rem;
}

.cm-container :deep(.cm-editor) {
  height: 100%;
}

.cm-container :deep(.cm-scroller) {
  height: 100%;
  font-family: 'Consolas', 'Monaco', monospace;
}

.preview-pane .preview-content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.25rem;
  box-shadow: none;
  border: none;
  border-radius: 0;
  margin-bottom: 0;
}
</style>
