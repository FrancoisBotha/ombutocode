<template>
  <div class="et-overlay" @click.self="$emit('close')">
    <div class="et-modal">
      <div class="et-header">
        <div class="et-title-group">
          <span class="mdi mdi-ticket-confirmation-outline et-icon"></span>
          <div>
            <h2 class="et-title">Tickets</h2>
            <p class="et-subtitle">{{ epic.title || epic.fileName }}</p>
          </div>
        </div>
        <button class="et-close" title="Close" @click="$emit('close')">
          <span class="mdi mdi-close"></span>
        </button>
      </div>

      <div class="et-body">
        <div v-if="loading" class="et-state">
          <span class="mdi mdi-loading mdi-spin"></span> Loading tickets…
        </div>
        <div v-else-if="error" class="et-state et-state-error">
          <span class="mdi mdi-alert-circle-outline"></span> {{ error }}
        </div>
        <div v-else-if="tickets.length === 0" class="et-state">
          <span class="mdi mdi-ticket-outline"></span>
          <p>No tickets are linked to this epic yet.</p>
        </div>
        <template v-else>
          <div class="et-summary">
            <span class="et-count">{{ tickets.length }} ticket{{ tickets.length === 1 ? '' : 's' }}</span>
            <span
              v-for="group in statusGroups"
              :key="group.status"
              class="et-status-pill"
              :class="'status-' + group.status"
            >{{ group.count }} {{ formatStatus(group.status) }}</span>
          </div>
          <table class="et-table">
            <thead>
              <tr>
                <th class="et-col-id">ID</th>
                <th class="et-col-title">Title</th>
                <th class="et-col-status">Status</th>
                <th class="et-col-actions"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in tickets" :key="t.id">
                <td class="et-col-id">{{ t.id }}</td>
                <td class="et-col-title">{{ t.title || '—' }}</td>
                <td class="et-col-status">
                  <span class="et-status-badge" :class="'status-' + (t.status || 'backlog')">
                    {{ formatStatus(t.status) }}
                  </span>
                </td>
                <td class="et-col-actions">
                  <div class="et-actions">
                    <button
                      class="et-icon-btn"
                      title="View ticket details"
                      @click="detailTicket = t"
                    >
                      <span class="mdi mdi-information-outline"></span>
                    </button>
                    <button
                      class="et-icon-btn"
                      :class="{ 'is-generating': runSummaryState(t) === 'generating' }"
                      :disabled="!runSummaryState(t) || runSummaryState(t) === 'generating'"
                      :title="runSummaryTitle(t)"
                      @click="runSummaryTicket = t"
                    >
                      <span class="mdi" :class="runSummaryIcon(t)"></span>
                    </button>
                    <button
                      class="et-icon-btn"
                      :disabled="!hasChanges(t)"
                      :title="hasChanges(t) ? 'View code changes' : 'No code changes — this ticket has not been merged'"
                      @click="changesTicket = t"
                    >
                      <span class="mdi mdi-source-branch"></span>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </template>
      </div>

      <div class="et-footer">
        <button class="et-btn" @click="$emit('close')">Close</button>
      </div>
    </div>

    <TicketDetailDialog
      v-if="detailTicket"
      :ticket="detailTicket"
      @close="detailTicket = null"
    />
    <RunSummaryDialog
      v-if="runSummaryTicket"
      :ticket="runSummaryTicket"
      @close="runSummaryTicket = null"
    />
    <TicketChangesDialog
      v-if="changesTicket"
      :ticket="changesTicket"
      @close="changesTicket = null"
    />
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue';
import TicketDetailDialog from '@/components/TicketDetailDialog.vue';
import RunSummaryDialog from '@/components/RunSummaryDialog.vue';
import TicketChangesDialog from '@/components/TicketChangesDialog.vue';

export default {
  name: 'EpicTicketsDialog',
  components: { TicketDetailDialog, RunSummaryDialog, TicketChangesDialog },
  props: {
    epic: { type: Object, required: true },
  },
  emits: ['close'],
  setup(props) {
    const tickets = ref([]);
    const loading = ref(true);
    const error = ref(null);

    // Row action dialogs — same three views the review column offers.
    const detailTicket = ref(null);
    const runSummaryTicket = ref(null);
    const changesTicket = ref(null);

    // Mirrors KanbanColumn: a null state means no summary exists at all (the
    // feature was off, or the ticket merged before summaries shipped).
    function runSummaryState(ticket) {
      const status = ticket?.run_summary?.status;
      return ['generating', 'ready', 'failed', 'unavailable'].includes(status) ? status : null;
    }

    function runSummaryIcon(ticket) {
      switch (runSummaryState(ticket)) {
        case 'generating': return 'mdi-loading mdi-spin';
        case 'ready': return 'mdi-text-box-search-outline';
        default: return 'mdi-text-box-remove-outline';
      }
    }

    function runSummaryTitle(ticket) {
      switch (runSummaryState(ticket)) {
        case 'generating': return 'Summarising run output…';
        case 'ready': return 'View run summary';
        case 'failed': return `Run summary failed: ${ticket?.run_summary?.error || 'unknown error'}`;
        default: return 'No run summary available';
      }
    }

    // Changes exist once a ticket has been merged. The squash sha was only
    // persisted from a later release, so gate on status rather than the sha —
    // the dialog recovers older commits from the commit subject.
    function hasChanges(ticket) {
      return ['review', 'done'].includes(ticket?.status);
    }

    // Status ordering follows the ticket lifecycle so the summary reads in a
    // natural left-to-right progression.
    const STATUS_ORDER = ['backlog', 'todo', 'building', 'in_progress', 'test', 'eval', 'merging', 'review', 'done'];

    function statusRank(status) {
      const idx = STATUS_ORDER.indexOf(status);
      return idx === -1 ? STATUS_ORDER.length : idx;
    }

    function formatStatus(status) {
      if (!status) return 'backlog';
      return status.replace(/_/g, ' ');
    }

    // A ticket belongs to this epic when its epic_ref resolves to the same epic
    // file. Tickets store epic_ref as `docs/Epics/<fileName>`; match on the
    // basename so path-separator or directory-prefix differences don't matter.
    function matchesEpic(ticket) {
      const ref = String(ticket.epic_ref || '').trim();
      if (!ref) return false;
      const base = ref.replace(/\\/g, '/').split('/').pop().toLowerCase();
      return base === String(props.epic.fileName || '').toLowerCase();
    }

    const statusGroups = computed(() => {
      const counts = new Map();
      for (const t of tickets.value) {
        const s = t.status || 'backlog';
        counts.set(s, (counts.get(s) || 0) + 1);
      }
      return [...counts.entries()]
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => statusRank(a.status) - statusRank(b.status));
    });

    async function load() {
      loading.value = true;
      error.value = null;
      try {
        const data = await window.electron.ipcRenderer.invoke('backlog:read');
        const all = Array.isArray(data?.tickets) ? data.tickets : [];
        tickets.value = all
          .filter(matchesEpic)
          .sort((a, b) =>
            statusRank(a.status) - statusRank(b.status) ||
            String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
          );
      } catch (e) {
        error.value = e.message || 'Failed to load tickets';
      } finally {
        loading.value = false;
      }
    }

    onMounted(load);

    return {
      tickets, loading, error, statusGroups, formatStatus,
      detailTicket, runSummaryTicket, changesTicket,
      runSummaryState, runSummaryIcon, runSummaryTitle, hasChanges,
    };
  },
};
</script>

<style scoped>
.et-overlay {
  position: fixed;
  inset: 0;
  background: rgba(8, 14, 24, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 1300;
}

.et-modal {
  width: 90vw;
  max-width: 720px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: var(--card-bg, #fff);
  color: var(--text-color, #2c3e50);
  border: 1px solid var(--border-color, #e1e4e8);
  border-radius: 8px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}

.et-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border-color, #e1e4e8);
}
.et-title-group { display: flex; align-items: flex-start; gap: 0.6rem; min-width: 0; }
.et-icon { font-size: 1.4rem; color: #4a90e2; margin-top: 0.1rem; }
.et-title { margin: 0; font-size: 1.05rem; }
.et-subtitle {
  margin: 0.15rem 0 0;
  font-size: 0.82rem;
  color: var(--text-muted, #6b778c);
  word-break: break-word;
}
.et-close {
  background: transparent;
  border: none;
  color: var(--text-muted, #6b778c);
  cursor: pointer;
  font-size: 1.1rem;
  padding: 0.2rem;
  border-radius: 4px;
  flex-shrink: 0;
}
.et-close:hover { background: var(--secondary-color, #f1f2f4); color: var(--text-color, #2c3e50); }

.et-body { padding: 1rem 1.25rem; overflow-y: auto; flex: 1; min-height: 0; }

.et-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem 1rem;
  color: var(--text-muted, #6b778c);
  font-size: 0.9rem;
}
.et-state .mdi { font-size: 1.6rem; }
.et-state p { margin: 0; }
.et-state-error { color: #b91c1c; }

.et-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.85rem;
}
.et-count {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted, #6b778c);
  margin-right: 0.25rem;
}
.et-status-pill {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.1rem 0.5rem;
  border-radius: 10px;
  text-transform: capitalize;
}

.et-table { width: 100%; border-collapse: collapse; }
.et-table th {
  text-align: left;
  padding: 0.4rem 0.6rem;
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted, #6b778c);
  border-bottom: 1px solid var(--border-color, #e1e4e8);
}
.et-table td {
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid var(--border-color, #f1f2f4);
  font-size: 0.85rem;
  vertical-align: top;
}
.et-col-id {
  width: 110px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.8rem;
  white-space: nowrap;
}
.et-col-status { width: 110px; }
.et-col-actions { width: 96px; }

.et-actions { display: flex; gap: 0.2rem; justify-content: flex-end; }
.et-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted, #6b778c);
  font-size: 0.95rem;
  cursor: pointer;
}
.et-icon-btn:hover:not(:disabled) {
  background: var(--secondary-color, #f1f2f4);
  border-color: var(--border-color, #e1e4e8);
  color: var(--text-color, #2c3e50);
}
.et-icon-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.et-icon-btn.is-generating { opacity: 0.7; cursor: progress; }

.et-status-badge {
  display: inline-block;
  padding: 0.12rem 0.5rem;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: capitalize;
  white-space: nowrap;
}

/* Status colours — shared by the badges and summary pills. */
.status-backlog { background: rgba(107, 119, 140, 0.15); color: #6b778c; }
.status-todo { background: rgba(91, 155, 213, 0.15); color: #4a90e2; }
.status-building,
.status-in_progress { background: rgba(229, 168, 48, 0.18); color: #b87f0e; }
.status-test,
.status-eval { background: rgba(155, 89, 182, 0.15); color: #8e44ad; }
.status-merging { background: rgba(52, 152, 219, 0.15); color: #2980b9; }
.status-review { background: rgba(229, 168, 48, 0.2); color: #b87f0e; }
.status-done { background: rgba(31, 122, 63, 0.18); color: #1f7a3f; }

[data-theme="dark"] .status-building,
[data-theme="dark"] .status-in_progress,
[data-theme="dark"] .status-review { color: #e5a830; }
[data-theme="dark"] .status-done { color: #6dd4a0; background: rgba(109, 212, 160, 0.15); }

.et-footer {
  display: flex;
  justify-content: flex-end;
  padding: 0.75rem 1.25rem;
  border-top: 1px solid var(--border-color, #e1e4e8);
}
.et-btn {
  background: var(--secondary-color, #f1f2f4);
  color: var(--text-color, #2c3e50);
  border: 1px solid var(--border-color, #e1e4e8);
  border-radius: 6px;
  padding: 0.4rem 1rem;
  font-size: 0.85rem;
  cursor: pointer;
}
.et-btn:hover { background: var(--border-color, #e1e4e8); }
</style>
