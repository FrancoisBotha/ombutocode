<template>
  <div class="td-overlay" @click.self="$emit('close')">
    <div class="td-modal">
      <div class="td-header">
        <div class="td-title-group">
          <span class="mdi mdi-information-outline td-icon"></span>
          <div>
            <h2 class="td-title">Ticket Details</h2>
            <p class="td-subtitle">{{ ticket.id }}</p>
          </div>
        </div>
        <button class="td-close" title="Close" @click="$emit('close')">
          <span class="mdi mdi-close"></span>
        </button>
      </div>

      <div class="td-body">
        <div class="td-row">
          <span class="td-label">Title</span>
          <span class="td-value">{{ ticket.title || '—' }}</span>
        </div>
        <div class="td-row" v-if="ticket.description">
          <span class="td-label">Description</span>
          <span class="td-value">{{ ticket.description }}</span>
        </div>
        <div class="td-row">
          <span class="td-label">Status</span>
          <span class="td-value">
            <span class="td-badge" :class="'status-' + (ticket.status || 'backlog')">
              {{ formatStatus(ticket.status) }}
            </span>
          </span>
        </div>
        <div class="td-row" v-if="ticket.assignee">
          <span class="td-label">Assignee</span>
          <span class="td-value">{{ ticket.assignee }}</span>
        </div>
        <div class="td-row" v-if="ticket.epic_ref">
          <span class="td-label">Epic</span>
          <span class="td-value td-mono">{{ ticket.epic_ref }}</span>
        </div>
        <div class="td-row" v-if="ticket.last_updated">
          <span class="td-label">Last Updated</span>
          <span class="td-value">{{ ticket.last_updated }}</span>
        </div>
        <div class="td-row" v-if="ticket.dependencies?.length">
          <span class="td-label">Dependencies</span>
          <ul class="td-list">
            <li v-for="dep in ticket.dependencies" :key="dep" class="td-mono">{{ dep }}</li>
          </ul>
        </div>
        <div class="td-row" v-if="ticket.acceptance_criteria?.length">
          <span class="td-label">Acceptance Criteria</span>
          <ul class="td-list">
            <li v-for="(c, i) in ticket.acceptance_criteria" :key="i">{{ c }}</li>
          </ul>
        </div>
        <div class="td-row" v-if="filesTouched.length">
          <span class="td-label">Files Touched</span>
          <ul class="td-list">
            <li v-for="f in filesTouched" :key="f" class="td-mono">{{ f }}</li>
          </ul>
        </div>
        <div class="td-row" v-if="ticket.notes">
          <span class="td-label">Notes</span>
          <span class="td-value td-notes">{{ ticket.notes }}</span>
        </div>
      </div>

      <div class="td-footer">
        <button class="td-btn" @click="$emit('close')">Close</button>
      </div>
    </div>
  </div>
</template>

<script>
import { computed } from 'vue';

export default {
  name: 'TicketDetailDialog',
  props: {
    ticket: { type: Object, required: true },
  },
  emits: ['close'],
  setup(props) {
    // files_touched has been written as both an array and a newline-joined
    // string over the life of the backlog schema.
    const filesTouched = computed(() => {
      const raw = props.ticket?.files_touched;
      if (Array.isArray(raw)) return raw.filter(Boolean);
      if (typeof raw === 'string') return raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      return [];
    });

    function formatStatus(status) {
      return String(status || 'backlog').replace(/_/g, ' ');
    }

    return { filesTouched, formatStatus };
  },
};
</script>

<style scoped>
.td-overlay {
  position: fixed;
  inset: 0;
  background: rgba(8, 14, 24, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 1400;
}

.td-modal {
  width: 90vw;
  max-width: 620px;
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  background: var(--card-bg, #fff);
  color: var(--text-color, #2c3e50);
  border: 1px solid var(--border-color, #e1e4e8);
  border-radius: 8px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}

.td-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border-color, #e1e4e8);
}
.td-title-group { display: flex; align-items: flex-start; gap: 0.6rem; min-width: 0; }
.td-icon { font-size: 1.3rem; color: #4a90e2; margin-top: 0.1rem; }
.td-title { margin: 0; font-size: 1.02rem; }
.td-subtitle {
  margin: 0.15rem 0 0;
  font-size: 0.8rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: var(--text-muted, #6b778c);
}
.td-close {
  background: transparent;
  border: none;
  color: var(--text-muted, #6b778c);
  cursor: pointer;
  font-size: 1.1rem;
  padding: 0.2rem;
  border-radius: 4px;
  flex-shrink: 0;
}
.td-close:hover { background: var(--secondary-color, #f1f2f4); color: var(--text-color, #2c3e50); }

.td-body { padding: 1rem 1.25rem; overflow-y: auto; flex: 1; min-height: 0; }

.td-row {
  display: grid;
  grid-template-columns: 130px 1fr;
  gap: 0.75rem;
  padding: 0.45rem 0;
  border-bottom: 1px solid var(--border-color, #f1f2f4);
  font-size: 0.85rem;
}
.td-row:last-child { border-bottom: none; }

.td-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted, #6b778c);
  padding-top: 0.1rem;
}
.td-value { word-break: break-word; line-height: 1.55; }
.td-notes { white-space: pre-wrap; }
.td-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.78rem;
}
.td-list { margin: 0; padding-left: 1.1rem; line-height: 1.6; }
.td-list li { margin: 0.1rem 0; word-break: break-word; }

.td-badge {
  display: inline-block;
  padding: 0.12rem 0.5rem;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: capitalize;
  white-space: nowrap;
}
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

.td-footer {
  display: flex;
  justify-content: flex-end;
  padding: 0.75rem 1.25rem;
  border-top: 1px solid var(--border-color, #e1e4e8);
}
.td-btn {
  background: var(--secondary-color, #f1f2f4);
  color: var(--text-color, #2c3e50);
  border: 1px solid var(--border-color, #e1e4e8);
  border-radius: 6px;
  padding: 0.4rem 1rem;
  font-size: 0.85rem;
  cursor: pointer;
}
.td-btn:hover { background: var(--border-color, #e1e4e8); }
</style>
