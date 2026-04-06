import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useBacklogStore = defineStore('backlog', () => {
  const KANBAN_STATUSES = ['todo', 'building', 'in_progress', 'test', 'eval', 'merging', 'review', 'done'];

  /**
   * Check if a ticket's dependencies are resolved.
   * Dependencies are resolved when all dependent tickets have status 'review' or 'done'.
   * @param {Object} ticket - The ticket to check
   * @returns {boolean} - True if all dependencies are resolved
   */
  function hasResolvedDependencies(ticket) {
    if (!ticket || !Array.isArray(ticket.dependencies) || ticket.dependencies.length === 0) {
      return true;
    }

    const ticketStatusById = new Map(
      _tickets.value.map((t) => [t.id, t.status])
    );

    for (const dependency of ticket.dependencies) {
      const dependencyId = normalizeDependencyId(dependency);
      if (!dependencyId) continue;

      const dependencyStatus = ticketStatusById.get(dependencyId);
      if (dependencyStatus !== 'review' && dependencyStatus !== 'done') {
        return false;
      }
    }

    return true;
  }

  /**
   * Normalize a dependency ID from various formats.
   * @param {string} dependency - The dependency ID (can be in format 'TICKET-123' or '[TICKET-123]')
   * @returns {string|null} - Normalized dependency ID or null if invalid
   */
  function normalizeDependencyId(dependency) {
    if (!dependency || typeof dependency !== 'string') return null;
    const trimmed = dependency.trim();
    if (!trimmed) return null;
    // Handle format like [TICKET-123] or just TICKET-123
    const match = trimmed.match(/^\[?([^\]]+)\]?$/);
    return match ? match[1].trim() : trimmed;
  }
  const _tickets = ref([]);
  const _version = ref(1);
  const _updatedAt = ref('');
  const _loading = ref(false);
  const _error = ref(null);
  const selectedTicketId = ref(null);

  const backlogTickets = computed(() =>
    _tickets.value.filter(t => t.status === 'backlog')
  );

  const kanbanTickets = computed(() =>
    _tickets.value.filter(t => KANBAN_STATUSES.includes(t.status))
  );

  const selectedTicket = computed(() =>
    _tickets.value.find(t => t.id === selectedTicketId.value) || null
  );

  function ticketsByStatus(status) {
    if (!KANBAN_STATUSES.includes(status)) return [];
    let filtered;
    if (status === 'in_progress') {
      // Include 'building' tickets in the In Progress column
      filtered = _tickets.value.filter(t => t.status === 'in_progress' || t.status === 'building');
    } else {
      filtered = _tickets.value.filter(t => t.status === status);
    }
    if (status === 'done' || status === 'eval' || status === 'review') {
      filtered.sort((a, b) => (b.last_updated || '').localeCompare(a.last_updated || ''));
    }
    return filtered;
  }

  async function loadBacklog() {
    _loading.value = true;
    _error.value = null;
    try {
      const data = await window.electron.ipcRenderer.invoke('backlog:read');
      _tickets.value = data.tickets || [];
      _version.value = data.version || 1;
      _updatedAt.value = data.updated_at || '';
    } catch (e) {
      _error.value = e.message;
    } finally {
      _loading.value = false;
    }
  }

  async function updateTicketStatus(ticketId, newStatus) {
    _error.value = null;
    try {
      await window.electron.ipcRenderer.invoke('backlog:updateStatus', {
        ticketId,
        newStatus
      });
      await loadBacklog();
    } catch (e) {
      _error.value = e.message;
      throw e;
    }
  }

  async function rejectReviewTicket(ticketId, comment) {
    _error.value = null;
    try {
      await window.electron.ipcRenderer.invoke('backlog:rejectReviewTicket', {
        ticketId,
        comment
      });
      await loadBacklog();
    } catch (e) {
      _error.value = e.message;
      throw e;
    }
  }

  async function updateTicketAssignee(ticketId, assignee) {
    _error.value = null;
    try {
      await window.electron.ipcRenderer.invoke('backlog:updateAssignee', {
        ticketId,
        assignee
      });
      await loadBacklog();
    } catch (e) {
      _error.value = e.message;
      throw e;
    }
  }

  async function updateTicketFields(ticketId, fields) {
    _error.value = null;
    try {
      await window.electron.ipcRenderer.invoke('backlog:updateFields', {
        ticketId,
        fields
      });
      await loadBacklog();
    } catch (e) {
      _error.value = e.message;
      throw e;
    }
  }

  async function promoteToTodo(ticketId) {
    // Find the next ticket to select before promotion changes the list
    const currentIndex = backlogTickets.value.findIndex(t => t.id === ticketId);
    let nextTicketId = null;
    
    if (currentIndex !== -1) {
      if (currentIndex < backlogTickets.value.length - 1) {
        // Select the next ticket (same index after current is removed)
        nextTicketId = backlogTickets.value[currentIndex + 1].id;
      } else if (currentIndex > 0) {
        // Was the last ticket, select the previous one
        nextTicketId = backlogTickets.value[currentIndex - 1].id;
      }
      // If it was the only ticket, nextTicketId remains null
    }
    
    await updateTicketStatus(ticketId, 'todo');
    
    // Update selection to maintain continuity in the detail panel
    if (selectedTicketId.value === ticketId) {
      selectedTicketId.value = nextTicketId;
    }
  }

  async function pickupByAgent(ticketId, agent) {
    _error.value = null;
    try {
      await window.electron.ipcRenderer.invoke('backlog:pickupByAgent', {
        ticketId,
        agent
      });
      await loadBacklog();
    } catch (e) {
      _error.value = e.message;
      throw e;
    }
  }

  async function deleteTicket(ticketId) {
    _error.value = null;
    try {
      await window.electron.ipcRenderer.invoke('backlog:deleteTicket', {
        ticketId
      });
      await loadBacklog();
    } catch (e) {
      _error.value = e.message;
      throw e;
    }
  }

  async function createAdHocFromPrompt(promptText) {
    _error.value = null;
    try {
      const result = await window.electron.ipcRenderer.invoke('backlog:createAdHocFromPrompt', {
        promptText
      });
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid response from ad-hoc ticket creation IPC');
      }
      if (result.success === false) {
        const message = result?.error?.message || 'Failed to create ad-hoc ticket from prompt';
        throw new Error(message);
      }
      return result;
    } catch (e) {
      _error.value = e.message;
      throw e;
    }
  }

  function parseAgentError(error) {
    const message = error?.message || String(error || 'Unknown agent error');
    const match = message.match(/^([A-Z_]+):\s*(.+)$/);
    if (!match) {
      return { code: 'AGENT_ERROR', message };
    }
    return { code: match[1], message: match[2] };
  }

  async function startKimiForTicket(ticketId, { modelId } = {}) {
    _error.value = null;
    try {
      const ticket = _tickets.value.find((entry) => entry.id === ticketId);
      if (!ticket) {
        throw new Error(`Ticket ${ticketId} not found`);
      }

      const ipcPayload = {
        ticketId: ticket.id,
        title: ticket.title || '',
        featureRef: ticket.feature_ref || '',
        repoRoot: ''
      };
      if (modelId) ipcPayload.modelId = modelId;
      const result = await window.electron.ipcRenderer.invoke('agent:startKimiForTicket', ipcPayload);
      await loadBacklog();
      return result;
    } catch (e) {
      const parsed = parseAgentError(e);
      _error.value = parsed.message;
      throw parsed;
    }
  }

  async function startCodexForTicket(ticketId, { modelId } = {}) {
    _error.value = null;
    try {
      const ticket = _tickets.value.find((entry) => entry.id === ticketId);
      if (!ticket) {
        throw new Error(`Ticket ${ticketId} not found`);
      }

      const ipcPayload = {
        ticketId: ticket.id,
        title: ticket.title || '',
        featureRef: ticket.feature_ref || '',
        repoRoot: ''
      };
      if (modelId) ipcPayload.modelId = modelId;
      const result = await window.electron.ipcRenderer.invoke('agent:startCodexForTicket', ipcPayload);
      await loadBacklog();
      return result;
    } catch (e) {
      const parsed = parseAgentError(e);
      _error.value = parsed.message;
      throw parsed;
    }
  }

  async function startClaudeForTicket(ticketId, { modelId } = {}) {
    _error.value = null;
    try {
      const ticket = _tickets.value.find((entry) => entry.id === ticketId);
      if (!ticket) {
        throw new Error(`Ticket ${ticketId} not found`);
      }

      const ipcPayload = {
        ticketId: ticket.id,
        title: ticket.title || '',
        featureRef: ticket.feature_ref || '',
        repoRoot: ''
      };
      if (modelId) ipcPayload.modelId = modelId;
      const result = await window.electron.ipcRenderer.invoke('agent:startClaudeForTicket', ipcPayload);
      await loadBacklog();
      return result;
    } catch (e) {
      const parsed = parseAgentError(e);
      _error.value = parsed.message;
      throw parsed;
    }
  }

  async function startTicketByAssignedAgent(ticketId) {
    const ticket = _tickets.value.find((entry) => entry.id === ticketId);
    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    const rawAssignee = ticket.assignee;
    let assignedAgent;
    let assignedModelId;

    if (rawAssignee && typeof rawAssignee === 'object') {
      assignedAgent = String(rawAssignee.tool || '').trim().toLowerCase();
      assignedModelId = String(rawAssignee.model || '').trim();
    } else {
      assignedAgent = String(rawAssignee || '').trim().toLowerCase();
    }

    if (!assignedAgent) {
      throw new Error(`Ticket ${ticketId} has no assigned agent`);
    }

    const opts = assignedModelId ? { modelId: assignedModelId } : {};

    if (assignedAgent === 'kimi') {
      return startKimiForTicket(ticketId, opts);
    }
    if (assignedAgent === 'codex') {
      return startCodexForTicket(ticketId, opts);
    }
    if (assignedAgent === 'claude') {
      return startClaudeForTicket(ticketId, opts);
    }

    throw new Error(`Unsupported ticket assignee: ${assignedAgent}`);
  }

  async function getRunStatus(ticketId, runId = null) {
    _error.value = null;
    try {
      return await window.electron.ipcRenderer.invoke('agent:getRunStatus', {
        ticketId,
        runId
      });
    } catch (e) {
      const parsed = parseAgentError(e);
      _error.value = parsed.message;
      throw parsed;
    }
  }

  async function readRunLogs(ticketId, runId = null, maxChars = 12000) {
    _error.value = null;
    try {
      return await window.electron.ipcRenderer.invoke('agent:readRunLogs', {
        ticketId,
        runId,
        maxChars
      });
    } catch (e) {
      const parsed = parseAgentError(e);
      _error.value = parsed.message;
      throw parsed;
    }
  }

  function getAgentState(ticketId) {
    const ticket = _tickets.value.find((entry) => entry.id === ticketId);
    return ticket?.agent?.state || null;
  }

  function selectTicket(ticketId) {
    selectedTicketId.value = ticketId;
  }

  return {
    tickets: _tickets,
    updatedAt: _updatedAt,
    backlogTickets,
    kanbanTickets,
    ticketsByStatus,
    selectedTicket,
    selectedTicketId,
    loading: _loading,
    error: _error,
    loadBacklog,
    updateTicketStatus,
    rejectReviewTicket,
    updateTicketAssignee,
    updateTicketFields,
    promoteToTodo,
    pickupByAgent,
    deleteTicket,
    createAdHocFromPrompt,
    startKimiForTicket,
    startCodexForTicket,
    startClaudeForTicket,
    startTicketByAssignedAgent,
    getRunStatus,
    readRunLogs,
    getAgentState,
    selectTicket,
    hasResolvedDependencies
  };
});
