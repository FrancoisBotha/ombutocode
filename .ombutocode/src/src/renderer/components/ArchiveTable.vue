<template>
  <div ref="archiveViewRef" class="archive-view" :class="{ 'is-resizing': isResizing }">
    <div v-if="loading" class="archive-loading">
      Loading archive...
    </div>

    <div v-else-if="error" class="archive-error">
      <span class="mdi mdi-alert-circle"></span> {{ error }}
    </div>

    <div v-else-if="archiveTickets.length === 0 && !hasSearched" class="archive-empty">
      <span class="mdi mdi-archive-outline"></span>
      <p>No archived items found</p>
    </div>

    <template v-else>
      <div class="archive-table-container">
        <!-- Search and filter controls -->
        <div class="archive-controls">
          <div class="search-wrapper">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search archived tickets..."
              class="search-input"
              @input="onSearchInput"
            />
          </div>
          <div class="filter-wrapper">
            <select
              v-model="selectedFeatureRef"
              class="feature-ref-dropdown"
              @change="onFilterChange"
            >
              <option value="">All Features</option>
              <option v-for="ref in featureRefs" :key="ref" :value="ref">
                {{ ref || '(None)' }}
              </option>
            </select>
          </div>
          <div class="result-count">
            {{ resultCountText }}
          </div>
        </div>

        <!-- No results state -->
        <div v-if="hasSearched && archiveTickets.length === 0" class="archive-empty">
          <span class="mdi mdi-archive-outline"></span>
          <p>No archived tickets match your search.</p>
        </div>

        <!-- Results table -->
        <div v-show="archiveTickets.length > 0" ref="tabulatorTable" class="tabulator-table"></div>
      </div>

      <div
        v-if="selectedTicket"
        class="resize-handle"
        role="separator"
        aria-orientation="vertical"
        tabindex="0"
        title="Drag to resize detail panel"
        @pointerdown="startResize"
      ></div>

      <div v-if="selectedTicket" class="archive-detail-container" :style="detailPanelStyle">
        <aside class="archive-detail">
          <h3 class="detail-title">{{ selectedTicket.title }}</h3>

          <dl class="detail-fields">
            <dt>ID</dt>
            <dd>{{ selectedTicket.id }}</dd>

            <dt>Status</dt>
            <dd><span class="status-badge status-archive">{{ selectedTicket.status }}</span></dd>

            <dt>Feature Ref</dt>
            <dd>{{ selectedTicket.feature_ref || 'None' }}</dd>

            <dt>Archived Date</dt>
            <dd>{{ formatDate(selectedTicket.last_updated) }}</dd>

            <dt>Dependencies</dt>
            <dd>{{ selectedTicket.dependencies && selectedTicket.dependencies.length ? selectedTicket.dependencies.join(', ') : 'None' }}</dd>

            <dt>Acceptance Criteria</dt>
            <dd>
              <ul v-if="selectedTicket.acceptance_criteria && selectedTicket.acceptance_criteria.length" class="criteria-list">
                <li v-for="(criterion, i) in selectedTicket.acceptance_criteria" :key="i">{{ criterion }}</li>
              </ul>
              <span v-else>None</span>
            </dd>

            <dt v-if="hasEvalSummary(selectedTicket)">Evaluation Summary</dt>
            <dd v-if="hasEvalSummary(selectedTicket)" class="eval-summary-section">
              <div class="eval-summary-header">
                <span class="eval-verdict-badge" :class="getEvalVerdictBadgeClass(selectedTicket)">
                  {{ getEvalVerdict(selectedTicket) }}
                </span>
              </div>
              <p v-if="selectedTicket.eval_summary?.timestamp" class="eval-summary-timestamp">
                {{ formatEvalSummaryTimestamp(selectedTicket.eval_summary.timestamp) }}
              </p>
              <p v-if="!hasEvalCriteriaChecks(selectedTicket)" class="eval-summary-empty">
                No per-criterion details available.
              </p>
              <ul v-else class="eval-checklist">
                <li v-for="(check, idx) in getEvalCriteriaChecks(selectedTicket)" :key="`${check.criterion || 'criterion'}-${idx}`" class="eval-check-item">
                  <div class="eval-check-main">
                    <span class="mdi" :class="getEvalCheckIconClass(check)"></span>
                    <span class="eval-check-criterion">{{ check.criterion || 'Unnamed criterion' }}</span>
                  </div>
                  <p v-if="isEvalCheckFail(check) && check.failure_reason" class="eval-check-reason">
                    <strong>Reason:</strong> {{ check.failure_reason }}
                  </p>
                  <p v-if="isEvalCheckFail(check) && check.suggestion" class="eval-check-suggestion">
                    <strong>Suggestion:</strong> {{ check.suggestion }}
                  </p>
                </li>
              </ul>
            </dd>

            <dt>Files Touched</dt>
            <dd>
              <ul v-if="selectedTicket.files_touched && selectedTicket.files_touched.length" class="files-list">
                <li v-for="(file, i) in selectedTicket.files_touched" :key="i">{{ file }}</li>
              </ul>
              <span v-else>None</span>
            </dd>

            <dt>Notes</dt>
            <dd>{{ selectedTicket.notes || 'None' }}</dd>
          </dl>
        </aside>
      </div>
    </template>
  </div>
</template>

<script>
import { computed, onMounted, onUnmounted, ref, nextTick } from 'vue';
import { useArchiveStore } from '@/stores/archiveStore';
import { TabulatorFull as Tabulator } from 'tabulator-tables';
import 'tabulator-tables/dist/css/tabulator.min.css';

const RESIZE_HANDLE_WIDTH = 10;
const MIN_TABLE_WIDTH = 420;
const MIN_DETAIL_WIDTH = 280;
const MAX_DETAIL_WIDTH = 760;

export default {
  name: 'ArchiveTable',
  setup() {
    const archiveStore = useArchiveStore();
    const archiveViewRef = ref(null);
    const tabulatorTable = ref(null);
    const tabulatorInstance = ref(null);
    const detailWidth = ref(420);
    const isResizing = ref(false);
    const dragStartX = ref(0);
    const dragStartWidth = ref(detailWidth.value);

    // Search and filter state
    const searchQuery = ref('');
    const selectedFeatureRef = ref('');
    const featureRefs = ref([]);
    const hasSearched = ref(false);
    const searchDebounceTimer = ref(null);
    const totalResultCount = ref(0);

    const archiveTickets = computed(() => archiveStore.archiveTickets);
    const selectedTicketId = computed(() => archiveStore.selectedTicketId);
    const selectedTicket = computed(() => archiveStore.selectedTicket);
    const loading = computed(() => archiveStore.loading);
    const error = computed(() => archiveStore.error);
    const detailPanelStyle = computed(() => ({
      width: `${detailWidth.value}px`
    }));

    const resultCountText = computed(() => {
      if (!hasSearched.value) return '';
      const count = archiveTickets.value.length;
      const total = totalResultCount.value;
      return `Showing ${count} of ${total} tickets`;
    });

    // Track currently selected row for manual highlighting
    let currentSelectedRow = null;

    // Initialize Tabulator table
    function initTabulator() {
      if (!tabulatorTable.value || tabulatorInstance.value) return;

      tabulatorInstance.value = new Tabulator(tabulatorTable.value, {
        data: archiveTickets.value,
        index: 'id',
        layout: 'fitColumns',
        selectable: false, // Disable built-in selection, we'll handle it manually
        initialSort: [
          { column: 'last_updated', dir: 'desc' }
        ],
        columns: [
          {
            title: 'ID',
            field: 'id',
            width: 150,
            headerSort: true,
            cssClass: 'col-id'
          },
          {
            title: 'Title',
            field: 'title',
            headerSort: true,
            cssClass: 'col-title'
          },
          {
            title: 'Archived Date',
            field: 'last_updated',
            width: 200,
            headerSort: true,
            formatter: function(cell) {
              return formatDate(cell.getValue());
            },
            cssClass: 'col-date'
          }
        ]
      });

      // Use Tabulator's cellClick callback
      tabulatorInstance.value.on('cellClick', function(e, cell) {
        const row = cell.getRow();
        const ticket = row.getData();
        if (ticket?.id) {
          archiveStore.selectTicket(ticket.id);
          highlightRow(row);
        }
      });

      // Select initial row
      if (archiveTickets.value.length > 0 && !selectedTicketId.value) {
        // Auto-select first ticket if none selected
        archiveStore.selectTicket(archiveTickets.value[0].id);
      }
      // Highlight the selected ticket
      nextTick(() => {
        if (selectedTicketId.value) {
          selectRowById(selectedTicketId.value);
        }
      });
    }

    function highlightRow(row) {
      // Remove previous selection
      if (currentSelectedRow && currentSelectedRow !== row) {
        currentSelectedRow.getElement().classList.remove('selected-row');
      }
      // Add selection to new row
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

    async function loadFeatureRefs() {
      try {
        const result = await window.electron.ipcRenderer.invoke('archive:getDistinctFeatureRefs');
        if (result.success && Array.isArray(result.refs)) {
          featureRefs.value = result.refs.filter(ref => ref && ref.trim()).sort();
        }
      } catch (error) {
        console.error('Failed to load feature refs:', error);
      }
    }

    async function performSearch() {
      try {
        const query = searchQuery.value.trim();
        const featureRef = selectedFeatureRef.value.trim() || undefined;

        const result = await window.electron.ipcRenderer.invoke('archive:search', {
          query,
          featureRef,
          limit: 1000,
          offset: 0
        });

        if (result.success) {
          archiveStore.$patch({
            tickets: result.tickets || [],
            error: null
          });
          totalResultCount.value = result.total || 0;
          hasSearched.value = true;

          // Reinitialize tabulator with new data
          if (tabulatorInstance.value) {
            tabulatorInstance.value.setData(result.tickets || []);
            if ((result.tickets || []).length > 0 && !selectedTicketId.value) {
              archiveStore.selectTicket(result.tickets[0].id);
            }
          }
        } else {
          archiveStore.$patch({
            error: result.error || 'Search failed'
          });
        }
      } catch (error) {
        console.error('Search error:', error);
        archiveStore.$patch({
          error: 'Failed to search archive'
        });
      }
    }

    function onSearchInput() {
      // Debounce search with ~300ms delay
      if (searchDebounceTimer.value) {
        clearTimeout(searchDebounceTimer.value);
      }
      searchDebounceTimer.value = setTimeout(() => {
        performSearch();
      }, 300);
    }

    function onFilterChange() {
      // Immediately apply filter change
      performSearch();
    }

    onMounted(async () => {
      await archiveStore.loadArchive();
      await loadFeatureRefs();

      // Show all tickets initially
      totalResultCount.value = (archiveStore.archiveTickets || []).length;

      initTabulator();
      detailWidth.value = clampDetailWidth(detailWidth.value);
      window.addEventListener('resize', handleWindowResize);
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
    });

    function formatDate(isoString) {
      if (!isoString) return '—';
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
      });
    }

    const getEvalSummary = (ticket) => {
      const summary = ticket?.eval_summary;
      if (!summary || typeof summary !== 'object') return null;
      const verdict = String(summary.verdict || '').toUpperCase();
      if (verdict !== 'PASS' && verdict !== 'FAIL') return null;
      return summary;
    };

    const hasEvalSummary = (ticket) => !!getEvalSummary(ticket);

    const getEvalVerdict = (ticket) => String(getEvalSummary(ticket)?.verdict || '').toUpperCase();

    const getEvalVerdictBadgeClass = (ticket) => (
      getEvalVerdict(ticket) === 'PASS' ? 'is-pass' : 'is-fail'
    );

    const formatEvalSummaryTimestamp = (timestamp) => {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) return String(timestamp);
      const formatted = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'UTC'
      }).format(date);
      return `${formatted} UTC`;
    };

    const getEvalCriteriaChecks = (ticket) => {
      const checks = getEvalSummary(ticket)?.criteria_checks;
      return Array.isArray(checks) ? checks : [];
    };

    const hasEvalCriteriaChecks = (ticket) => getEvalCriteriaChecks(ticket).length > 0;

    const getEvalCheckResult = (check) => String(check?.result || '').toUpperCase();

    const isEvalCheckFail = (check) => getEvalCheckResult(check) === 'FAIL';

    const getEvalCheckIconClass = (check) => (
      getEvalCheckResult(check) === 'PASS'
        ? 'mdi-check-circle eval-check-icon-pass'
        : 'mdi-close-circle eval-check-icon-fail'
    );

    function getContainerWidth() {
      return archiveViewRef.value?.clientWidth || window.innerWidth;
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
      if (!selectedTicket.value) return;
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

    return {
      archiveTickets,
      selectedTicketId,
      selectedTicket,
      loading,
      error,
      detailPanelStyle,
      archiveViewRef,
      tabulatorTable,
      isResizing,
      searchQuery,
      selectedFeatureRef,
      featureRefs,
      hasSearched,
      resultCountText,
      formatDate,
      startResize,
      onSearchInput,
      onFilterChange,
      hasEvalSummary,
      getEvalVerdict,
      getEvalVerdictBadgeClass,
      formatEvalSummaryTimestamp,
      getEvalCriteriaChecks,
      hasEvalCriteriaChecks,
      isEvalCheckFail,
      getEvalCheckIconClass
    };
  }
};
</script>

<style scoped>
.archive-view {
  display: flex;
  flex: 1;
  overflow: hidden;
  background-color: #f5f7fa;
}

.archive-view.is-resizing,
.archive-view.is-resizing * {
  user-select: none;
  cursor: col-resize;
}

.archive-loading,
.archive-error,
.archive-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: #6b778c;
  font-size: 0.95rem;
}

.archive-error {
  color: #e74c3c;
}

.archive-empty .mdi {
  font-size: 3rem;
  margin-bottom: 0.75rem;
  color: #c1c7d0;
}

.archive-empty p {
  margin: 0;
}

.archive-table-container {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  min-width: 0;
}

.archive-controls {
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

.filter-wrapper {
  min-width: 200px;
}

.feature-ref-dropdown {
  width: 100%;
  padding: 0.625rem 0.875rem;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  font-size: 0.875rem;
  color: #2c3e50;
  background-color: #ffffff;
  cursor: pointer;
  transition: border-color 0.2s;
}

.feature-ref-dropdown:focus {
  outline: none;
  border-color: #4a90e2;
  box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.1);
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

.archive-detail-container {
  flex: 0 0 auto;
  min-width: 0;
  max-width: 100%;
  height: 100%;
}

.archive-detail {
  padding: 1.5rem;
  overflow-y: auto;
  height: 100%;
  background-color: #ffffff;
  border-left: 1px solid #e1e4e8;
}

.detail-title {
  margin: 0 0 1.25rem;
  font-size: 1.1rem;
  font-weight: 600;
  color: #2c3e50;
}

.detail-fields {
  margin: 0;
}

.detail-fields dt {
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b778c;
  margin-top: 1rem;
}

.detail-fields dt:first-child {
  margin-top: 0;
}

.detail-fields dd {
  margin: 0.25rem 0 0;
  font-size: 0.875rem;
  color: #2c3e50;
  line-height: 1.5;
}

.status-badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 3px;
  font-size: 0.75rem;
  font-weight: 500;
}

.status-archive {
  background-color: #e8e1f0;
  color: #6c4a8e;
}

.criteria-list,
.files-list {
  margin: 0.25rem 0 0;
  padding-left: 1.25rem;
}

.criteria-list li,
.files-list li {
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
}

.files-list li {
  font-family: monospace;
  font-size: 0.8rem;
}

/* Tabulator custom styles */
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

:deep(.col-id) {
  font-family: monospace;
  font-size: 0.8rem;
}

:deep(.col-date) {
  color: #6b778c;
  font-size: 0.8rem;
}

/* Eval Summary Styles */
.eval-summary-section {
  margin-top: 0.5rem;
}

.eval-summary-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.25rem;
}

.eval-verdict-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.2rem 0.6rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.eval-verdict-badge.is-pass {
  background-color: #dcfce7;
  color: #166534;
}

.eval-verdict-badge.is-fail {
  background-color: #fde8ea;
  color: #7f1d1d;
}

.eval-summary-timestamp {
  margin: 0.1rem 0 0.35rem 0;
  font-size: 0.78rem;
  color: #5e6c84;
}

.eval-summary-empty {
  margin: 0;
  font-size: 0.82rem;
  color: #5e6c84;
}

.eval-checklist {
  margin: 0.5rem 0 0 0;
  padding-left: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.eval-check-item {
  background-color: #f8fafc;
  border: 1px solid #dbe5f0;
  border-radius: 6px;
  padding: 0.55rem 0.65rem;
}

.eval-check-main {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
}

.eval-check-criterion {
  color: #172b4d;
  font-size: 0.84rem;
  line-height: 1.45;
}

.eval-check-icon-pass {
  color: #16a34a;
  font-size: 1rem;
  margin-top: 0.05rem;
}

.eval-check-icon-fail {
  color: #dc2626;
  font-size: 1rem;
  margin-top: 0.05rem;
}

.eval-check-reason {
  margin: 0.35rem 0 0 1.45rem;
  font-size: 0.8rem;
  color: #5e6c84;
  line-height: 1.4;
}

.eval-check-suggestion {
  margin: 0.25rem 0 0 1.45rem;
  font-size: 0.8rem;
  color: #0d9488;
  font-style: italic;
  line-height: 1.4;
}
</style>
