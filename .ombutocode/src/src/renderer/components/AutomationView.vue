<template>
  <section class="automation-view">
    <header class="automation-header">
      <h2>Automation</h2>
      <p>Monitor per-agent capacity and pause state.</p>
    </header>

    <div class="automation-meta">
      <span class="updated-at">Last refreshed: {{ formatTimestamp(lastRefreshedAt) }}</span>
    </div>

    <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>

    <section class="panel">
      <header class="panel-header">
        <h3>Agent Status</h3>
        <span class="count">{{ agentStatuses.length }}</span>
      </header>
      <div v-if="agentStatuses.length > 0" class="list">
        <article v-for="agent in agentStatuses" :key="agent.toolId" class="list-row">
          <div class="row-main">
            <strong>{{ agent.toolName }}</strong>
            <span>{{ agent.activeTotalRuns }}/{{ agent.totalCapacity }} slots used</span>
          </div>
          <div class="row-side status-side">
            <span class="subtle">Impl {{ agent.activeImplementationRuns }} | Eval {{ agent.activeEvaluationRuns }}</span>
            <span v-if="agent.isPaused" class="pause-text">
              Paused{{ formatPause(agent) }}
            </span>
            <button
              v-if="agent.isPaused"
              class="unpause-button"
              @click="unpauseAgent(agent.toolId)"
              :disabled="unpausingAgents.has(agent.toolId)"
            >
              {{ unpausingAgents.has(agent.toolId) ? 'Unpausing...' : 'Unpause' }}
            </button>
          </div>
        </article>
      </div>
      <p v-else class="empty-state">No agent status available.</p>
    </section>

    <section class="panel">
      <header class="panel-header">
        <h3>Active Executions</h3>
        <span class="count">{{ activeRuns.length }}</span>
      </header>
      <div v-if="activeRuns.length > 0" class="list">
        <article v-for="run in activeRuns" :key="run.runId || `${run.ticketId}-${run.agentName}`" class="list-row">
          <div class="row-main">
            <strong>{{ run.ticketId }}</strong>
            <span>Branch: {{ formatBranch(run.branch) }}</span>
          </div>
          <div class="row-side status-side">
            <span class="subtle">{{ run.agentName }} · {{ run.state }}</span>
            <span class="subtle">Elapsed: {{ formatElapsed(run.elapsedMs) }}</span>
          </div>
        </article>
      </div>
      <p v-else class="empty-state">No active executions.</p>
    </section>

    <section class="panel">
      <header class="panel-header">
        <h3>Evaluation Queue</h3>
        <span class="count">{{ evalQueue.totalTickets }}</span>
      </header>
      <div v-if="evalQueue.tickets && evalQueue.tickets.length > 0" class="list">
        <article v-for="ticket in evalQueue.tickets" :key="ticket.id" class="list-row">
          <div class="row-main">
            <strong>{{ ticket.id }}</strong>
            <span>{{ ticket.title }}</span>
          </div>
          <div class="row-side status-side">
            <span v-if="ticket.ready" class="ready-badge">Ready</span>
            <span v-else-if="ticket.blockedByDependencies" class="blocked-badge">Blocked by dependencies</span>
            <span v-if="ticket.estimatedPickupAt" class="subtle">Pickup: {{ formatTimestamp(ticket.estimatedPickupAt) }}</span>
          </div>
        </article>
      </div>
      <p v-else class="empty-state">{{ evalQueueEmptyMessage }}</p>
    </section>
  </section>
</template>

<script>
import { onMounted, onUnmounted, ref, computed } from 'vue';

export default {
  name: 'AutomationView',
  setup() {
    const agentStatuses = ref([]);
    const activeRuns = ref([]);
    const evalQueue = ref({ totalTickets: 0, tickets: [], activeCount: 0, readyCount: 0, activeTicketIds: [] });
    const errorMessage = ref('');
    const lastRefreshedAt = ref(null);
    const nowMs = ref(Date.now());
    const unpausingAgents = ref(new Set());
    let refreshTimer = null;
    let clockTimer = null;

    const evalQueueEmptyMessage = computed(() => {
      if (evalQueue.value.activeCount > 0) {
        return `No pending evaluation tickets. ${evalQueue.value.activeCount} active evaluation(s) in progress.`;
      }
      return 'No evaluation tickets in queue.';
    });

    const formatTimestamp = (value) => {
      if (!value) return '--';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '--';
      return date.toLocaleTimeString();
    };

    const formatDuration = (ms) => {
      const totalSeconds = Math.max(0, Math.floor(ms / 1000));
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      }
      if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
      }
      return `${seconds}s`;
    };

    const formatPause = (agent) => {
      const pauseUntilMs = Date.parse(agent?.pauseUntil || '');
      const remaining = Number.isFinite(pauseUntilMs)
        ? pauseUntilMs - nowMs.value
        : Number(agent?.pauseRemainingMs || 0);
      const suffix = remaining > 0 ? ` (${formatDuration(remaining)} remaining)` : '';
      const reason = agent?.pauseReason ? `: ${agent.pauseReason}` : '';
      return `${reason}${suffix}`;
    };

    const formatElapsed = (elapsedMs) => {
      if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return '--';
      return formatDuration(elapsedMs);
    };

    const formatBranch = (branch) => {
      const normalized = String(branch || '').trim();
      return normalized || '-';
    };

    const unpauseAgent = async (toolId) => {
      if (unpausingAgents.value.has(toolId)) return;

      unpausingAgents.value.add(toolId);
      try {
        const result = await window.electron.ipcRenderer.invoke('automation:unpause-agent', { toolId });
        if (result?.success) {
          await refresh();
        } else {
          errorMessage.value = result?.error?.message || `Failed to unpause ${toolId}`;
        }
      } catch (error) {
        errorMessage.value = error?.message || `Failed to unpause ${toolId}`;
      } finally {
        unpausingAgents.value.delete(toolId);
      }
    };

    const refresh = async () => {
      try {
        const [agentSnapshot, activeRunsSnapshot, queueSnapshot] = await Promise.all([
          window.electron.ipcRenderer.invoke('automation:agent-status'),
          window.electron.ipcRenderer.invoke('automation:active-runs', { includeQueued: true }),
          window.electron.ipcRenderer.invoke('automation:eval-queue', { limit: 50 })
        ]);
        agentStatuses.value = Array.isArray(agentSnapshot?.agents) ? agentSnapshot.agents : [];
        activeRuns.value = Array.isArray(activeRunsSnapshot?.runs) ? activeRunsSnapshot.runs : [];
        evalQueue.value = queueSnapshot || { totalTickets: 0, tickets: [], activeCount: 0, readyCount: 0, activeTicketIds: [] };
        errorMessage.value = '';
        lastRefreshedAt.value = new Date().toISOString();
      } catch (error) {
        errorMessage.value = error?.message || 'Failed to refresh automation status.';
      }
    };

    onMounted(async () => {
      await refresh();
      refreshTimer = setInterval(refresh, 5000);
      clockTimer = setInterval(() => {
        nowMs.value = Date.now();
      }, 1000);
    });

    onUnmounted(() => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
      }
      if (clockTimer) {
        clearInterval(clockTimer);
      }
    });

    return {
      agentStatuses,
      activeRuns,
      evalQueue,
      evalQueueEmptyMessage,
      errorMessage,
      lastRefreshedAt,
      unpausingAgents,
      formatBranch,
      formatElapsed,
      formatPause,
      formatTimestamp,
      unpauseAgent
    };
  }
};
</script>

<style scoped>
.automation-view {
  flex: 1;
  padding: 20px 24px;
  overflow-y: auto;
  background: #f8f9fa;
}

.automation-header h2 {
  font-size: 24px;
  margin: 0;
}

.automation-header p {
  margin: 4px 0 0;
  color: #5d6778;
}

.automation-meta {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 16px;
  margin-bottom: 16px;
}

.updated-at {
  font-size: 12px;
  color: #6b7280;
}

.panel {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 14px;
  margin-top: 14px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
}

.count {
  font-size: 12px;
  color: #6b7280;
}

.summary,
.info-message,
.error-message,
.empty-state {
  font-size: 13px;
  color: #4b5563;
}

.error-message {
  color: #b42318;
}

.list {
  display: grid;
  gap: 8px;
}

.list-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px;
  border: 1px solid #eef0f3;
  border-radius: 8px;
}

.row-main {
  display: grid;
  gap: 2px;
}

.row-main span {
  font-size: 12px;
  color: #6b7280;
}

.row-side {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.status-side {
  text-align: right;
}

.elapsed,
.assignee,
.subtle,
.pause-text {
  font-size: 12px;
  color: #4b5563;
}

.pause-text {
  color: #92400e;
}

.ready-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  background: #dcfce7;
  color: #166534;
  font-size: 11px;
  font-weight: 600;
}

.blocked-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  background: #fee2e2;
  color: #991b1b;
  font-size: 11px;
  font-weight: 600;
}

.unpause-button {
  padding: 4px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #ffffff;
  color: #374151;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.unpause-button:hover:not(:disabled) {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.unpause-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 900px) {
  .automation-view {
    padding: 16px;
  }

  .list-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .row-side,
  .status-side {
    justify-content: flex-start;
    text-align: left;
  }
}
</style>
