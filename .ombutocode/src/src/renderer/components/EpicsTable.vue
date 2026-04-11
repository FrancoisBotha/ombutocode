<template>
  <div ref="featuresViewRef" class="epics-view" :class="{ 'is-resizing': isResizing }">
    <div v-if="loading" class="epics-loading">
      Loading epics...
    </div>

    <div v-else-if="error" class="epics-error">
      <span class="mdi mdi-alert-circle"></span> {{ error }}
    </div>

    <div v-else-if="features.length === 0" class="epics-empty">
      <span class="mdi mdi-shape-outline"></span>
      <p>No epic documents found</p>
    </div>

    <template v-else>
      <div class="epics-table-container">
        <!-- Search controls -->
        <div class="epics-controls">
          <div class="search-wrapper">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search epics..."
              class="search-input"
              @input="onSearchInput"
            />
          </div>
          <div class="result-count">
            {{ resultCountText }}
          </div>
        </div>

        <!-- Results table -->
        <div ref="tabulatorTable" class="tabulator-table"></div>
      </div>

      <div
        v-if="selectedEpic"
        class="resize-handle"
        role="separator"
        aria-orientation="vertical"
        tabindex="0"
        title="Drag to resize detail panel"
        @pointerdown="startResize"
      ></div>

      <div v-if="selectedEpic" class="epics-detail-container" :style="detailPanelStyle">
        <aside class="epics-detail">
          <h3 class="detail-title">{{ selectedEpic.title }}</h3>
          <div class="detail-actions">
            <button
              v-if="showStartButton"
              class="btn-start"
              :disabled="starting"
              @click="startSelectedFeature"
            >
              <span class="mdi mdi-play-circle-outline"></span>
              {{ starting ? 'Starting...' : 'Start Epic' }}
            </button>
            <button
              v-if="selectedEpic.status && ['BUILDING', 'DONE', 'building', 'done'].includes(selectedEpic.status)"
              class="btn-evaluate"
              :disabled="evaluating"
              @click="evaluateSelectedFeature"
            >
              <span v-if="!evaluating" class="mdi mdi-check-decagram-outline"></span>
              <span v-else class="mdi mdi-loading mdi-spin"></span>
              {{ evaluateButtonText }}
            </button>
          </div>

          <!-- Eval result display -->
          <div v-if="evalState === 'error'" class="eval-result eval-error">
            <span class="mdi mdi-alert-circle"></span>
            {{ evalError }}
          </div>
          <div v-if="evalState === 'pass'" class="eval-result eval-pass">
            <span class="mdi mdi-check-circle"></span>
            Epic evaluation passed. Status updated to complete.
          </div>
          <div v-if="evalState === 'fail'" class="eval-result eval-fail">
            <span class="mdi mdi-close-circle"></span>
            Epic evaluation failed.
            <details v-if="evalOutput" class="eval-details">
              <summary>View evaluation details</summary>
              <pre class="eval-output">{{ evalOutput }}</pre>
            </details>
          </div>

          <dl class="detail-fields">
            <dt>File</dt>
            <dd>{{ selectedEpic.fileName }}</dd>

            <dt>Status</dt>
            <dd>{{ selectedEpic.status || '—' }}</dd>
          </dl>
          <div class="epic-content markdown-body" v-html="renderedContent"></div>
        </aside>
      </div>
    </template>
  </div>
</template>

<script>
import { computed, onMounted, onUnmounted, nextTick, ref, watch } from 'vue';
import { useEpicStore } from '@/stores/epicStore';
import { marked } from 'marked';
import { TabulatorFull as Tabulator } from 'tabulator-tables';
import 'tabulator-tables/dist/css/tabulator.min.css';

const RESIZE_HANDLE_WIDTH = 10;
const MIN_TABLE_WIDTH = 420;
const MIN_DETAIL_WIDTH = 320;
const MAX_DETAIL_WIDTH = 880;

export default {
  name: 'EpicsTable',
  setup() {
    const epicStore = useEpicStore();
    const featuresViewRef = ref(null);
    const tabulatorTable = ref(null);
    const tabulatorInstance = ref(null);
    const detailWidth = ref(480);
    const isResizing = ref(false);
    const dragStartX = ref(0);
    const dragStartWidth = ref(detailWidth.value);

    // Search state
    const searchQuery = ref('');
    const searchDebounceTimer = ref(null);

    const features = computed(() => epicStore.epics);
    const selectedEpicId = computed(() => epicStore.selectedEpicId);
    const selectedEpic = computed(() => epicStore.selectedEpic);
    const loading = computed(() => epicStore.loading);
    const error = computed(() => epicStore.error);
    const detailPanelStyle = computed(() => ({ width: `${detailWidth.value}px` }));

    // Start state
    const starting = ref(false);
    const STARTABLE_STATUSES = new Set(['', 'draft', 'planned']);
    const showStartButton = computed(() => {
      if (!selectedEpic.value) return false;
      return STARTABLE_STATUSES.has(selectedEpic.value.status || '');
    });

    // Eval state
    const evalState = computed(() => epicStore.evalState);
    const evalError = computed(() => epicStore.evalError);
    const evalOutput = computed(() => epicStore.evalOutput);
    const evaluating = computed(() => evalState.value === 'checking' || evalState.value === 'running');

    const evaluateButtonText = computed(() => {
      if (evalState.value === 'checking') return 'Checking readiness...';
      if (evalState.value === 'running') return 'Evaluating...';
      return 'Feature Evaluation';
    });

    const resultCountText = computed(() => {
      if (!searchQuery.value.trim()) return '';
      const displayed = tabulatorInstance.value
        ? tabulatorInstance.value.getDataCount('active')
        : features.value.length;
      const total = features.value.length;
      return `Showing ${displayed} of ${total} features`;
    });

    const renderedContent = computed(() => {
      if (!selectedEpic.value?.content) return '';
      return marked(selectedEpic.value.content, { breaks: true, gfm: true });
    });

    // Track currently selected row for manual highlighting
    let currentSelectedRow = null;
    let evalCompleteCleanup = null;

    function initTabulator() {
      if (!tabulatorTable.value || tabulatorInstance.value) return;

      tabulatorInstance.value = new Tabulator(tabulatorTable.value, {
        data: features.value,
        index: 'id',
        layout: 'fitColumns',
        selectable: false,
        initialSort: [
          { column: 'title', dir: 'asc' }
        ],
        columns: [
          {
            title: 'Epic',
            field: 'title',
            headerSort: true,
            cssClass: 'col-title'
          },
          {
            title: 'Status',
            field: 'status',
            width: 120,
            headerSort: true,
            formatter: function(cell) {
              return cell.getValue() || '—';
            },
            cssClass: 'col-status'
          },
        ]
      });

      tabulatorInstance.value.on('cellClick', function(e, cell) {
        const row = cell.getRow();
        const feature = row.getData();
        if (feature?.id) {
          epicStore.selectEpic(feature.id);
          highlightRow(row);
        }
      });

      // Select initial row
      if (features.value.length > 0 && !selectedEpicId.value) {
        epicStore.selectEpic(features.value[0].id);
      }
      nextTick(() => {
        if (selectedEpicId.value) {
          selectRowById(selectedEpicId.value);
        }
      });
    }

    function highlightRow(row) {
      if (currentSelectedRow && currentSelectedRow !== row) {
        currentSelectedRow.getElement().classList.remove('selected-row');
      }
      row.getElement().classList.add('selected-row');
      currentSelectedRow = row;
    }

    function selectRowById(id) {
      if (!tabulatorInstance.value) return;
      try {
        const row = tabulatorInstance.value.getRow(id);
        if (row) {
          highlightRow(row);
        }
      } catch (e) {
        // Row not found
      }
    }

    function applySearchFilter() {
      if (!tabulatorInstance.value) return;
      const query = searchQuery.value.trim().toLowerCase();
      if (query) {
        tabulatorInstance.value.setFilter('title', 'like', query);
      } else {
        tabulatorInstance.value.clearFilter();
      }
    }

    function onSearchInput() {
      if (searchDebounceTimer.value) {
        clearTimeout(searchDebounceTimer.value);
      }
      searchDebounceTimer.value = setTimeout(() => {
        applySearchFilter();
      }, 300);
    }

    // Watch for features data changes to update Tabulator
    watch(features, (newFeatures) => {
      if (tabulatorInstance.value) {
        tabulatorInstance.value.setData(newFeatures);
        applySearchFilter();
      }
    });

    // Reset eval state when selected feature changes
    watch(selectedEpicId, () => {
      epicStore.resetEvalState();
    });

    onMounted(async () => {
      await epicStore.loadEpics();
      if (features.value.length > 0 && !selectedEpicId.value) {
        epicStore.selectEpic(features.value[0].id);
      }
      initTabulator();
      detailWidth.value = clampDetailWidth(detailWidth.value);
      window.addEventListener('resize', handleWindowResize);

      // Listen for feature eval completion events
      evalCompleteCleanup = window.electron.ipcRenderer.on('epics:evalComplete', (data) => {
        epicStore.handleEvalComplete(data);
        if (data.verdict === 'PASS') {
          epicStore.loadEpics();
        }
      });
    });

    onUnmounted(() => {
      if (searchDebounceTimer.value) {
        clearTimeout(searchDebounceTimer.value);
      }
      window.removeEventListener('resize', handleWindowResize);
      stopResize();
      if (tabulatorInstance.value) {
        tabulatorInstance.value.destroy();
        tabulatorInstance.value = null;
      }
      if (typeof evalCompleteCleanup === 'function') {
        evalCompleteCleanup();
      }
      epicStore.resetEvalState();
    });

    function getContainerWidth() {
      return featuresViewRef.value?.clientWidth || window.innerWidth;
    }

    function getMaxDetailWidth() {
      const maxFromContainer = getContainerWidth() - MIN_TABLE_WIDTH - RESIZE_HANDLE_WIDTH;
      return Math.max(MIN_DETAIL_WIDTH, Math.min(MAX_DETAIL_WIDTH, maxFromContainer));
    }

    function clampDetailWidth(width) {
      const min = MIN_DETAIL_WIDTH;
      const max = getMaxDetailWidth();
      return Math.min(Math.max(width, min), max);
    }

    function handleWindowResize() {
      detailWidth.value = clampDetailWidth(detailWidth.value);
      if (tabulatorInstance.value) {
        tabulatorInstance.value.redraw();
      }
    }

    function startResize(event) {
      if (!selectedEpic.value) return;
      isResizing.value = true;
      dragStartX.value = event.clientX;
      dragStartWidth.value = detailWidth.value;
      event.preventDefault();
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', stopResize);
      window.addEventListener('pointercancel', stopResize);
    }

    function handlePointerMove(event) {
      if (!isResizing.value) return;
      const deltaX = event.clientX - dragStartX.value;
      detailWidth.value = clampDetailWidth(dragStartWidth.value - deltaX);
    }

    function stopResize() {
      if (!isResizing.value) return;
      isResizing.value = false;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
    }

    async function startSelectedFeature() {
      if (!selectedEpic.value || starting.value) return;
      starting.value = true;
      try {
        await epicStore.startEpic(selectedEpic.value);
      } catch (e) {
        console.error('Failed to start feature:', e);
      } finally {
        starting.value = false;
      }
    }

    async function evaluateSelectedFeature() {
      if (!selectedEpic.value || evaluating.value) return;
      try {
        await epicStore.evaluateEpic(selectedEpic.value);
      } catch (e) {
        console.error('Failed to start feature evaluation:', e);
      }
    }

    return {
      features,
      selectedEpic,
      selectedEpicId,
      loading,
      error,
      evalState,
      evalError,
      evalOutput,
      evaluating,
      evaluateButtonText,
      starting,
      showStartButton,
      detailPanelStyle,
      featuresViewRef,
      tabulatorTable,
      isResizing,
      searchQuery,
      resultCountText,
      renderedContent,
      selectEpic: (id) => epicStore.selectEpic(id),
      startSelectedFeature,
      evaluateSelectedFeature,
      startResize,
      onSearchInput
    };
  }
};
</script>

<style scoped>
.epics-view {
  display: flex;
  flex: 1;
  overflow: hidden;
  background-color: #f5f7fa;
}

.epics-view.is-resizing,
.epics-view.is-resizing * {
  user-select: none;
  cursor: col-resize;
}

.epics-loading,
.epics-error,
.epics-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: #6b778c;
  font-size: 0.95rem;
}

.epics-error {
  color: #e74c3c;
}

.epics-empty .mdi {
  font-size: 3rem;
  margin-bottom: 0.75rem;
  color: #c1c7d0;
}

.epics-empty p {
  margin: 0;
}

.epics-table-container {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  min-width: 0;
}

.epics-controls {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.search-wrapper {
  flex: 1;
  min-width: 250px;
}

.search-input {
  width: 100%;
  padding: 0.625rem 0.875rem;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  font-size: 0.875rem;
  color: #2c3e50;
  background-color: #ffffff;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: #4a90e2;
  box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.1);
}

.search-input::placeholder {
  color: #9ca3af;
}

.result-count {
  white-space: nowrap;
  font-size: 0.875rem;
  color: #6b778c;
  padding: 0.625rem 0.875rem;
}

.tabulator-table {
  flex: 1;
  background-color: #ffffff;
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  min-height: 0;
}

.resize-handle {
  flex: 0 0 10px;
  cursor: col-resize;
  position: relative;
  background-color: #f5f7fa;
}

.resize-handle::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background-color: #d6dbe3;
}

.resize-handle:hover::before {
  background-color: #4a90e2;
}

.epics-detail-container {
  flex: 0 0 auto;
  min-width: 0;
  max-width: 100%;
  height: 100%;
}

.epics-detail {
  height: 100%;
  background: #fff;
  border-left: 1px solid #e1e4e8;
  padding: 1.25rem;
  overflow-y: auto;
}

.detail-title {
  margin: 0 0 1rem;
  font-size: 1.1rem;
  color: #2c3e50;
}

.detail-actions {
  margin-bottom: 1rem;
}

.btn-start {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: none;
  border-radius: 4px;
  background-color: #1f7a3f;
  color: #fff;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.4rem 0.65rem;
  cursor: pointer;
  margin-right: 0.5rem;
}

.btn-start:hover {
  background-color: #186832;
}

.btn-start:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-evaluate {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: none;
  border-radius: 4px;
  background-color: #4a5aa8;
  color: #fff;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.4rem 0.65rem;
  cursor: pointer;
}

.btn-evaluate:hover {
  background-color: #3d4d96;
}

.btn-evaluate:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Eval result banners */
.eval-result {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.6rem 0.8rem;
  border-radius: 4px;
  font-size: 0.825rem;
  margin-bottom: 1rem;
  line-height: 1.4;
}

.eval-error {
  background-color: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}

.eval-pass {
  background-color: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
}

.eval-fail {
  background-color: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
  flex-direction: column;
}

.eval-details {
  margin-top: 0.5rem;
  width: 100%;
}

.eval-details summary {
  cursor: pointer;
  font-weight: 600;
  font-size: 0.8rem;
}

.eval-output {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background-color: #2d333b;
  color: #c9d1d9;
  border-radius: 4px;
  font-size: 0.75rem;
  max-height: 300px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.detail-fields {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 0.5rem 0.75rem;
  margin: 0 0 1rem;
}

.detail-fields dt {
  font-size: 0.75rem;
  text-transform: uppercase;
  color: #6b778c;
  font-weight: 600;
}

.detail-fields dd {
  margin: 0;
  font-size: 0.875rem;
  color: #2c3e50;
}

.content-heading {
  margin: 0.5rem 0;
  font-size: 0.85rem;
  text-transform: uppercase;
  color: #6b778c;
}

.epic-content {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.6;
  color: #2c3e50;
  background-color: #f8f9fa;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  padding: 1rem;
  max-height: calc(100vh - 300px);
  overflow-y: auto;
}

/* Markdown styling */
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  margin-top: 1rem;
  margin-bottom: 0.5rem;
  font-weight: 600;
  color: #2c3e50;
}

.markdown-body :deep(h1) { font-size: 1.25rem; border-bottom: 1px solid #e1e4e8; padding-bottom: 0.3rem; }
.markdown-body :deep(h2) { font-size: 1.1rem; border-bottom: 1px solid #e1e4e8; padding-bottom: 0.2rem; }
.markdown-body :deep(h3) { font-size: 1rem; }
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) { font-size: 0.9rem; }

.markdown-body :deep(p) {
  margin: 0.5rem 0;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0.5rem 0;
  padding-left: 1.5rem;
}

.markdown-body :deep(li) {
  margin: 0.25rem 0;
}

.markdown-body :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.85em;
  background-color: #e9ecef;
  padding: 0.15rem 0.3rem;
  border-radius: 3px;
}

.markdown-body :deep(pre) {
  background-color: #2d333b;
  color: #c9d1d9;
  padding: 0.75rem;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0.5rem 0;
}

.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
  color: inherit;
}

.markdown-body :deep(blockquote) {
  margin: 0.5rem 0;
  padding-left: 1rem;
  border-left: 4px solid #4a90e2;
  color: #6b778c;
}

.markdown-body :deep(a) {
  color: #4a90e2;
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5rem 0;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid #e1e4e8;
  padding: 0.4rem 0.6rem;
  text-align: left;
}

.markdown-body :deep(th) {
  background-color: #f1f2f4;
  font-weight: 600;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid #e1e4e8;
  margin: 1rem 0;
}

.markdown-body :deep(strong) {
  font-weight: 600;
}

.markdown-body :deep(em) {
  font-style: italic;
}

/* Tabulator custom styles - matching Archive pattern */
:deep(.tabulator) {
  border: none;
  background-color: #ffffff;
}

:deep(.tabulator-header) {
  background-color: #f8f9fa;
  border-bottom: 2px solid #e1e4e8;
}

:deep(.tabulator-header .tabulator-col) {
  background-color: #f8f9fa;
}

:deep(.tabulator-header .tabulator-col-title) {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b778c;
}

:deep(.tabulator-row) {
  cursor: pointer;
}

:deep(.tabulator-row:hover) {
  background-color: #f8f9fa;
}

:deep(.tabulator-row.selected-row) {
  background-color: #e1e7ff !important;
}

:deep(.tabulator-cell) {
  font-size: 0.875rem;
  color: #2c3e50;
  border-bottom: 1px solid #f1f2f4;
}

:deep(.col-status) {
  font-size: 0.8rem;
}

:deep(.col-owner) {
  font-size: 0.8rem;
}

:deep(.col-updated) {
  color: #6b778c;
  font-size: 0.8rem;
}
</style>
