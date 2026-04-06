<template>
  <div ref="logsViewRef" class="logs-view" :class="{ 'is-resizing': isResizing }">
    <div v-if="loading && logs.length === 0" class="logs-loading">
      Loading logs...
    </div>

    <div v-else-if="error" class="logs-error">
      <span class="mdi mdi-alert-circle"></span> {{ error }}
    </div>

    <div v-else-if="logs.length === 0 && !hasSearched" class="logs-empty">
      <span class="mdi mdi-text-box-outline"></span>
      <p>No scheduler logs found</p>
    </div>

    <template v-else>
      <div class="logs-table-container">
        <!-- Search and filter controls -->
        <div class="logs-controls">
          <div class="search-wrapper">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search logs..."
              class="search-input"
              @input="onSearchInput"
            />
          </div>
          <div class="filter-wrapper">
            <select
              v-model="selectedSeverity"
              class="filter-dropdown"
              @change="onFilterChange"
            >
              <option value="">All Severities</option>
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warning</option>
              <option value="error">Error</option>
            </select>
          </div>
          <div class="filter-wrapper">
            <select
              v-model="selectedEventType"
              class="filter-dropdown"
              @change="onFilterChange"
            >
              <option value="">All Event Types</option>
              <option v-for="et in eventTypes" :key="et" :value="et">
                {{ et }}
              </option>
            </select>
          </div>
          <div class="filter-wrapper">
            <select
              v-model="selectedTicketId"
              class="filter-dropdown"
              @change="onFilterChange"
            >
              <option value="">All Tickets</option>
              <option v-for="tid in ticketIds" :key="tid" :value="tid">
                {{ tid }}
              </option>
            </select>
          </div>
          <div class="result-count">
            {{ resultCountText }}
          </div>
        </div>

        <!-- No results state -->
        <div v-if="hasSearched && logs.length === 0" class="logs-empty">
          <span class="mdi mdi-text-box-outline"></span>
          <p>No logs match your search.</p>
        </div>

        <!-- Results table -->
        <div v-show="logs.length > 0" ref="tabulatorTable" class="tabulator-table"></div>
      </div>

      <div
        v-if="selectedLog"
        class="resize-handle"
        role="separator"
        aria-orientation="vertical"
        tabindex="0"
        title="Drag to resize detail panel"
        @pointerdown="startResize"
      ></div>

      <div v-if="selectedLog" class="logs-detail-container" :style="detailPanelStyle">
        <aside class="logs-detail">
          <h3 class="detail-title">Log Entry #{{ selectedLog.id }}</h3>

          <dl class="detail-fields">
            <dt>Timestamp</dt>
            <dd>{{ formatTimestamp(selectedLog.timestamp) }}</dd>

            <dt>Severity</dt>
            <dd>
              <span class="severity-badge" :class="'severity-' + selectedLog.severity">
                {{ selectedLog.severity }}
              </span>
            </dd>

            <dt>Event Type</dt>
            <dd class="mono">{{ selectedLog.event_type }}</dd>

            <dt v-if="selectedLog.ticket_id">Ticket ID</dt>
            <dd v-if="selectedLog.ticket_id" class="mono">{{ selectedLog.ticket_id }}</dd>

            <dt v-if="selectedLog.run_id">Run ID</dt>
            <dd v-if="selectedLog.run_id" class="mono">{{ selectedLog.run_id }}</dd>

            <dt v-if="selectedLog.agent_name">Agent</dt>
            <dd v-if="selectedLog.agent_name">{{ selectedLog.agent_name }}</dd>

            <dt>Message</dt>
            <dd>{{ selectedLog.message || '(empty)' }}</dd>

            <dt v-if="selectedLog.details">Details</dt>
            <dd v-if="selectedLog.details" class="details-section">
              <template v-if="parsedDetails">
                <div v-for="(value, key) in parsedDetails" :key="key" class="detail-kv">
                  <span class="detail-key">{{ key }}:</span>
                  <span class="detail-value">{{ formatDetailValue(value) }}</span>
                </div>
              </template>
              <pre v-else class="raw-details">{{ selectedLog.details }}</pre>
            </dd>
          </dl>
        </aside>
      </div>
    </template>
  </div>
</template>

<script>
import { computed, onMounted, onUnmounted, ref, nextTick, watch } from 'vue';
import { useLogsStore } from '@/stores/logsStore';
import { TabulatorFull as Tabulator } from 'tabulator-tables';
import 'tabulator-tables/dist/css/tabulator.min.css';

const RESIZE_HANDLE_WIDTH = 10;
const MIN_TABLE_WIDTH = 420;
const MIN_DETAIL_WIDTH = 280;
const MAX_DETAIL_WIDTH = 760;

export default {
  name: 'LogsTable',
  setup() {
    const logsStore = useLogsStore();
    const logsViewRef = ref(null);
    const tabulatorTable = ref(null);
    const tabulatorInstance = ref(null);
    const detailWidth = ref(420);
    const isResizing = ref(false);
    const dragStartX = ref(0);
    const dragStartWidth = ref(detailWidth.value);

    // Search and filter state
    const searchQuery = ref('');
    const selectedSeverity = ref('');
    const selectedEventType = ref('');
    const selectedTicketId = ref('');
    const hasSearched = ref(false);
    const searchDebounceTimer = ref(null);

    const logs = computed(() => logsStore.logs);
    const total = computed(() => logsStore.total);
    const selectedLog = computed(() => logsStore.selectedLog);
    const loading = computed(() => logsStore.loading);
    const error = computed(() => logsStore.error);
    const eventTypes = computed(() => logsStore.eventTypes);
    const ticketIds = computed(() => logsStore.ticketIds);

    const detailPanelStyle = computed(() => ({
      width: `${detailWidth.value}px`
    }));

    const resultCountText = computed(() => {
      if (!hasSearched.value && logs.value.length === 0) return '';
      return `Showing ${logs.value.length} of ${total.value} logs`;
    });

    const parsedDetails = computed(() => {
      if (!selectedLog.value?.details) return null;
      try {
        const parsed = JSON.parse(selectedLog.value.details);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed;
        }
        return null;
      } catch {
        return null;
      }
    });

    let currentSelectedRow = null;

    function initTabulator() {
      if (!tabulatorTable.value || tabulatorInstance.value) return;

      tabulatorInstance.value = new Tabulator(tabulatorTable.value, {
        data: logs.value,
        index: 'id',
        layout: 'fitColumns',
        selectable: false,
        initialSort: [
          { column: 'id', dir: 'desc' }
        ],
        columns: [
          {
            title: 'Timestamp',
            field: 'timestamp',
            width: 180,
            headerSort: true,
            formatter: function(cell) {
              return formatTimestamp(cell.getValue());
            },
            cssClass: 'col-timestamp'
          },
          {
            title: 'Severity',
            field: 'severity',
            width: 80,
            headerSort: true,
            formatter: function(cell) {
              const severity = cell.getValue();
              const badgeClass = 'severity-badge severity-' + severity;
              return `<span class="${badgeClass}">${severity}</span>`;
            },
            cssClass: 'col-severity'
          },
          {
            title: 'Event Type',
            field: 'event_type',
            width: 180,
            headerSort: true,
            cssClass: 'col-event-type'
          },
          {
            title: 'Ticket',
            field: 'ticket_id',
            width: 120,
            headerSort: true,
            cssClass: 'col-ticket-id'
          },
          {
            title: 'Message',
            field: 'message',
            headerSort: false,
            cssClass: 'col-message'
          }
        ]
      });

      tabulatorInstance.value.on('cellClick', function(e, cell) {
        const row = cell.getRow();
        const log = row.getData();
        if (log?.id) {
          logsStore.selectLog(log.id);
          highlightRow(row);
        }
      });

      if (logs.value.length > 0 && !logsStore.selectedLogId) {
        logsStore.selectLog(logs.value[0].id);
      }
      nextTick(() => {
        if (logsStore.selectedLogId) {
          selectRowById(logsStore.selectedLogId);
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

    function buildSearchParams() {
      const params = {
        limit: 500,
        offset: 0
      };
      const query = searchQuery.value.trim();
      if (query) params.query = query;
      if (selectedSeverity.value) params.severity = selectedSeverity.value;
      if (selectedEventType.value) params.event_type = selectedEventType.value;
      if (selectedTicketId.value) params.ticket_id = selectedTicketId.value;
      return params;
    }

    async function performSearch() {
      const params = buildSearchParams();
      const hasFilters = params.query || params.severity || params.event_type || params.ticket_id;

      if (hasFilters) {
        await logsStore.searchLogs(params);
      } else {
        await logsStore.loadLogs(params);
      }
      hasSearched.value = true;

      if (tabulatorInstance.value) {
        tabulatorInstance.value.setData(logs.value);
        if (logs.value.length > 0) {
          logsStore.selectLog(logs.value[0].id);
          nextTick(() => selectRowById(logs.value[0].id));
        }
      }
    }

    function onSearchInput() {
      if (searchDebounceTimer.value) {
        clearTimeout(searchDebounceTimer.value);
      }
      searchDebounceTimer.value = setTimeout(() => {
        performSearch();
      }, 300);
    }

    function onFilterChange() {
      performSearch();
    }

    function formatTimestamp(isoString) {
      if (!isoString) return '\u2014';
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }

    function formatDetailValue(value) {
      if (value === null || value === undefined) return 'null';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    }

    // Resize logic
    function getContainerWidth() {
      return logsViewRef.value?.clientWidth || window.innerWidth;
    }

    function getMaxDetailWidth() {
      const maxFromContainer = getContainerWidth() - MIN_TABLE_WIDTH - RESIZE_HANDLE_WIDTH;
      return Math.max(MIN_DETAIL_WIDTH, Math.min(MAX_DETAIL_WIDTH, maxFromContainer));
    }

    function clampDetailWidth(width) {
      return Math.min(Math.max(width, MIN_DETAIL_WIDTH), getMaxDetailWidth());
    }

    function handleWindowResize() {
      detailWidth.value = clampDetailWidth(detailWidth.value);
      if (tabulatorInstance.value) {
        tabulatorInstance.value.redraw();
      }
    }

    function startResize(event) {
      if (!selectedLog.value) return;
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

    onMounted(async () => {
      await logsStore.loadLogs({ limit: 500 });
      await logsStore.loadFilterOptions();
      hasSearched.value = false;
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

    return {
      logs,
      total,
      selectedLog,
      loading,
      error,
      detailPanelStyle,
      logsViewRef,
      tabulatorTable,
      isResizing,
      searchQuery,
      selectedSeverity,
      selectedEventType,
      selectedTicketId,
      eventTypes,
      ticketIds,
      hasSearched,
      resultCountText,
      parsedDetails,
      formatTimestamp,
      formatDetailValue,
      startResize,
      onSearchInput,
      onFilterChange
    };
  }
};
</script>

<style scoped>
.logs-view {
  display: flex;
  flex: 1;
  overflow: hidden;
  background-color: #f5f7fa;
}

.logs-view.is-resizing,
.logs-view.is-resizing * {
  user-select: none;
  cursor: col-resize;
}

.logs-loading,
.logs-error,
.logs-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: #6b778c;
  font-size: 0.95rem;
}

.logs-error {
  color: #e74c3c;
}

.logs-empty .mdi {
  font-size: 3rem;
  margin-bottom: 0.75rem;
  color: #c1c7d0;
}

.logs-empty p {
  margin: 0;
}

.logs-table-container {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  min-width: 0;
}

.logs-controls {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.search-wrapper {
  flex: 1;
  min-width: 200px;
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
  min-width: 140px;
}

.filter-dropdown {
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

.filter-dropdown:focus {
  outline: none;
  border-color: #4a90e2;
  box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.1);
}

.result-count {
  white-space: nowrap;
  font-size: 0.875rem;
  color: #6b778c;
  padding: 0.625rem 0.5rem;
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

.logs-detail-container {
  flex: 0 0 auto;
  min-width: 0;
  max-width: 100%;
  height: 100%;
}

.logs-detail {
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

.detail-fields dd.mono {
  font-family: monospace;
  font-size: 0.8rem;
}

/* Severity badges */
.severity-badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 3px;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.severity-debug {
  background-color: #e8e8e8;
  color: #6b778c;
}

.severity-info {
  background-color: #e1f0ff;
  color: #1a5fa0;
}

.severity-warn {
  background-color: #fff3cd;
  color: #856404;
}

.severity-error {
  background-color: #fde8ea;
  color: #9b1c1c;
}

/* Detail panel key-value pairs */
.details-section {
  margin-top: 0.5rem;
}

.detail-kv {
  display: flex;
  gap: 0.5rem;
  padding: 0.25rem 0;
  font-size: 0.8rem;
  border-bottom: 1px solid #f1f2f4;
}

.detail-key {
  font-weight: 600;
  color: #6b778c;
  min-width: 80px;
  flex-shrink: 0;
}

.detail-value {
  color: #2c3e50;
  word-break: break-word;
  font-family: monospace;
  font-size: 0.78rem;
}

.raw-details {
  margin: 0.25rem 0 0;
  padding: 0.5rem;
  background-color: #f8f9fa;
  border: 1px solid #e1e4e8;
  border-radius: 4px;
  font-size: 0.78rem;
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
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

:deep(.col-timestamp) {
  font-family: monospace;
  font-size: 0.78rem;
  color: #6b778c;
}

:deep(.col-event-type) {
  font-family: monospace;
  font-size: 0.78rem;
}

:deep(.col-ticket-id) {
  font-family: monospace;
  font-size: 0.78rem;
}

:deep(.col-message) {
  font-size: 0.82rem;
}
</style>
