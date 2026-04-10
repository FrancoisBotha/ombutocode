<template>
  <div class="app">
    <div class="app-content">
      <BoardList 
        ref="boardListRef"
        :boards="boards" 
        :current-board="currentBoard"
        :active-view="activeView"
        @select-board="selectBoard"
        @change-view="handleChangeView"
        @delete-board="handleDeleteBoard"
      />
      
      <div v-if="activeView === 'kanban'" class="kanban-board">
        <KanbanColumn
          v-for="column in columns"
          :key="column.id"
          :title="column.title"
          :tasks="getTasksForColumn(column.id)"
          :column-id="column.id"
        />
      </div>
      <RequestsTable v-else-if="activeView === 'requests'" />
      <BacklogTable v-else-if="activeView === 'backlog'" />
      <ArchiveTable v-else-if="activeView === 'archive'" />
      <FeaturesTable v-else-if="activeView === 'features'" />
      <PrdView v-else-if="activeView === 'prd'" />
      <AgentsToolsView v-else-if="activeView === 'agents'" />
      <AutomationView v-else-if="activeView === 'automation'" />
      <LogsTable v-else-if="activeView === 'logs'" />
      <SettingsView v-else-if="activeView === 'settings'" />
      <HelpView v-else-if="activeView === 'help'" />

      <PlanDashboardView v-else-if="activeView === 'plan-dashboard'" />
      <PlanPrdView v-else-if="activeView === 'plan-prd'" @change-view="handleChangeView" />
      <PlanArchitectureView v-else-if="activeView === 'plan-architecture'" @change-view="handleChangeView" />
      <PlanDataModelView v-else-if="activeView === 'plan-data-model'" @change-view="handleChangeView" />
      <PlanEpicsView v-else-if="activeView === 'plan-epics'" @change-view="handleChangeView" />
      <PlanArtifactsView v-else-if="activeView === 'plan-artifacts'" />
      <PlanTreeView v-else-if="activeView === 'plan-tree'" />
      <PlanMockupsView v-else-if="activeView === 'plan-mockups'" />
      <PlanGitView v-else-if="activeView === 'plan-git'" />
      <PlanValidateView v-else-if="activeView === 'plan-validate'" />
      <PlanFilePreviewView v-else-if="activeView === 'plan-file-preview'" :file-path="planFilePath" :key="'fp-' + planFilePath" />
      <PlanStructureView v-else-if="activeView === 'plan-structure'" />
      <PlanUseCasesView v-else-if="activeView === 'plan-use-cases'" />
      <PlanUseCaseDiagramsView v-else-if="activeView === 'plan-use-case-diagrams'" />
      <PlanClassDiagramsView v-else-if="activeView === 'plan-class-diagrams'" />
      <PlanScratchPadView v-else-if="activeView === 'plan-scratchpad'" />
      <PlanSettingsView v-else-if="activeView === 'plan-settings'" />
      <PlanFRView v-else-if="activeView === 'plan-functional-requirements'" />
      <PlanNFRView v-else-if="activeView === 'plan-non-functional-requirements'" />
      <PlanUseCaseEditorView v-else-if="activeView === 'plan-use-case-editor'" :file-path="planFilePath" :key="'uc-' + planFilePath" />
      <PlanUseCaseDiagramEditorView v-else-if="activeView === 'plan-use-case-diagram-editor'" :file-path="planFilePath" :key="'ucd-' + planFilePath" />
      <PlanClassDiagramEditorView v-else-if="activeView === 'plan-class-diagram-editor'" :file-path="planFilePath" :key="'cd-' + planFilePath" />
      <PlanERDiagramView v-else-if="activeView === 'plan-er-diagram'" :file-path="planFilePath" :key="'er-' + planFilePath" />
      <PlanArtifactDetailView v-else-if="activeView === 'plan-artifact-detail'" :file-path="planFilePath" :key="'ad-' + planFilePath" />
      <PlanSkillsView v-else-if="activeView === 'plan-skills'" />
      <WorkspaceView v-show="activeView === 'workspace'" :visible="activeView === 'workspace'" />

    </div>

    <StatusBar />

    <!-- Close Confirmation Dialog -->
    <div v-if="showCloseDialog" class="modal-overlay close-warning-overlay" @click.self="cancelClose">
      <div class="close-dialog" role="dialog" aria-modal="true" aria-labelledby="close-warning-title">
        <div class="close-dialog-header">
          <div class="warning-icon-wrap" aria-hidden="true">
            <svg class="warning-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="close-dialog-title-group">
            <p class="close-dialog-kicker">Unsaved Work Warning</p>
            <h3 id="close-warning-title">Agents Are Still Working</h3>
          </div>
        </div>

        <div class="close-dialog-body">
          <div class="close-dialog-message">
            <p>
              <span class="run-count-pill">{{ closeDialogData.runCount }} active</span>
              {{ closeDialogData.runCount }} agent{{ closeDialogData.runCount > 1 ? 's are' : ' is' }} actively working on ticket{{ closeDialogData.runCount > 1 ? 's' : '' }}.
            </p>
          </div>

          <div class="close-dialog-tickets">
            <p class="tickets-label">Active tickets</p>
            <ul class="tickets-list">
              <li v-for="run in closeDialogData.activeRuns" :key="`${run.ticketId}-${run.agentName}`" class="ticket-item">
                <span class="ticket-id">{{ run.ticketId }}</span>
                <span class="ticket-agent">{{ run.agentName }}</span>
              </li>
            </ul>
          </div>

          <p class="close-dialog-question">Close the app anyway?</p>
        </div>

        <div class="close-dialog-actions">
          <button class="btn btn-secondary" @click="cancelClose">
            Continue Working
          </button>
          <button class="btn btn-danger" @click="confirmClose">
            Close App
          </button>
        </div>
      </div>
    </div>

    <!-- No Agents Connected Dialog -->
    <div v-if="showNoAgentsDialog" class="modal-overlay" @click.self="showNoAgentsDialog = false">
      <div class="no-agents-dialog">
        <div class="no-agents-icon">
          <span class="mdi mdi-robot-off-outline"></span>
        </div>
        <h3>No Coding Agents Detected</h3>
        <p>
          Ombuto Code could not find any connected coding agents (Claude, Codex, or Kimi).
          You need at least one agent CLI installed and authenticated to use automated development features.
        </p>
        <div class="no-agents-actions">
          <button class="btn btn-secondary" @click="showNoAgentsDialog = false">
            Dismiss
          </button>
          <button class="btn btn-primary" @click="showNoAgentsDialog = false; handleChangeView('settings'); $nextTick(() => { /* switch to agents tab handled by settings */ })">
            <span class="mdi mdi-cog-outline"></span>
            Open Settings
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useBoardStore } from '@/stores/boardStore';
import { useBacklogStore } from '@/stores/backlogStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { initAudioContext, playReviewNotification } from '@/utils/notificationSound';
import BoardList from '@/components/BoardList.vue';
import KanbanColumn from '@/components/KanbanColumn.vue';
import BacklogTable from '@/components/BacklogTable.vue';
import ArchiveTable from '@/components/ArchiveTable.vue';
import FeaturesTable from '@/components/FeaturesTable.vue';
import PrdView from '@/components/PrdView.vue';
import AgentsToolsView from '@/components/AgentsToolsView.vue';
import AutomationView from '@/components/AutomationView.vue';
import LogsTable from '@/components/LogsTable.vue';
import RequestsTable from '@/components/RequestsTable.vue';
import SettingsView from '@/components/SettingsView.vue';
import WorkspaceView from '@/components/WorkspaceView.vue';
import StatusBar from '@/components/StatusBar.vue';
import HelpView from '@/components/HelpView.vue';
import PlanDashboardView from '@/views/DashboardView.vue';
import PlanPrdView from '@/components/PlanPrdView.vue';
import PlanArchitectureView from '@/components/PlanArchitectureView.vue';
import PlanDataModelView from '@/components/PlanDataModelView.vue';
import PlanEpicsView from '@/components/PlanEpicsView.vue';
import PlanArtifactsView from '@/views/ArtifactListView.vue';
import PlanTreeView from '@/views/TreeView.vue';
import PlanMockupsView from '@/views/MockupsView.vue';
import PlanGitView from '@/views/GitView.vue';
import PlanValidateView from '@/views/ValidateView.vue';
import PlanFilePreviewView from '@/views/FilePreviewView.vue';
import PlanStructureView from '@/views/ProjectStructureView.vue';
import PlanUseCasesView from '@/views/UseCasesListView.vue';
import PlanUseCaseDiagramsView from '@/views/UseCaseDiagramsView.vue';
import PlanClassDiagramsView from '@/views/ClassDiagramsView.vue';
import PlanScratchPadView from '@/views/ScratchPadView.vue';
import PlanSettingsView from '@/views/SettingsView.vue';
import PlanFRView from '@/views/FunctionalRequirementsView.vue';
import PlanNFRView from '@/views/NonFunctionalRequirementsView.vue';
import PlanUseCaseEditorView from '@/views/UseCaseEditorView.vue';
import PlanUseCaseDiagramEditorView from '@/views/UseCaseDiagramEditorView.vue';
import PlanClassDiagramEditorView from '@/views/ClassDiagramEditorView.vue';
import PlanERDiagramView from '@/views/ERDiagramView.vue';
import PlanArtifactDetailView from '@/views/ArtifactDetailView.vue';
import PlanSkillsView from '@/views/SkillsView.vue';

export default {
  name: 'App',
  components: {
    BoardList,
    KanbanColumn,
    BacklogTable,
    ArchiveTable,
    FeaturesTable,
    PrdView,
    AgentsToolsView,
    RequestsTable,
    AutomationView,
    LogsTable,
    SettingsView,
    WorkspaceView,
    StatusBar,
    HelpView,
    PlanDashboardView,
    PlanPrdView,
    PlanArchitectureView,
    PlanDataModelView,
    PlanEpicsView,
    PlanArtifactsView,
    PlanTreeView,
    PlanMockupsView,
    PlanGitView,
    PlanValidateView,
    PlanFilePreviewView,
    PlanStructureView,
    PlanUseCasesView,
    PlanUseCaseDiagramsView,
    PlanClassDiagramsView,
    PlanScratchPadView,
    PlanSettingsView,
    PlanFRView,
    PlanNFRView,
    PlanUseCaseEditorView,
    PlanUseCaseDiagramEditorView,
    PlanClassDiagramEditorView,
    PlanERDiagramView,
    PlanArtifactDetailView,
    PlanSkillsView
  },
  setup() {
    const boardStore = useBoardStore();
    const backlogStore = useBacklogStore();
    const settingsStore = useSettingsStore();
    const currentBoard = ref(null);
    const activeView = ref('kanban');
    const boardListRef = ref(null);
    const titleBranding = ref('Ombuto Code');
    let pollInterval = null;
    let titleBrandingCleanup = null;
    let closeConfirmCleanup = null;

    // Close confirmation dialog state
    const showCloseDialog = ref(false);
    const closeDialogData = ref({
      runCount: 0,
      activeRuns: []
    });
    let closeDialogResolve = null;

    const columns = ref([
      { id: 'todo', title: 'To Do' },
      { id: 'in_progress', title: 'In Progress' },
      { id: 'test', title: 'Testing' },
      { id: 'eval', title: 'EVAL' },
      { id: 'merging', title: 'Merging' },
      { id: 'review', title: 'Review' },
      { id: 'done', title: 'Done' }
    ]);

    const boards = computed(() => boardStore.boards || []);
    const kanbanPollIntervalMs = computed(() => {
      const seconds = Number(settingsStore.appRefreshInterval);
      if (!Number.isFinite(seconds) || seconds < 1) return 5000;
      return Math.floor(seconds) * 1000;
    });

    function getTasksForColumn(columnId) {
      return backlogStore.ticketsByStatus(columnId);
    }

    async function pollBacklog() {
      try {
        await backlogStore.loadBacklog();
      } catch (e) {
        console.error('Polling error:', e);
      }
    }

    function startPolling() {
      stopPolling();
      pollBacklog();
      pollInterval = setInterval(pollBacklog, kanbanPollIntervalMs.value);
    }

    function stopPolling() {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    }

    watch(activeView, (newView) => {
      if (newView === 'kanban') {
        startPolling();
      } else {
        stopPolling();
      }
    });

    watch(kanbanPollIntervalMs, () => {
      if (activeView.value === 'kanban') {
        startPolling();
      }
    });

    // Track previous ticket statuses to detect moves to review
    const previousTicketStatuses = ref(new Map());

    // Watch for tickets moving to review and play notification sound
    watch(() => backlogStore.tickets, (newTickets, oldTickets) => {
      if (!newTickets || !oldTickets) return;
      
      const currentStatuses = new Map();
      const oldStatuses = previousTicketStatuses.value;
      
      // Build current status map
      for (const ticket of newTickets) {
        if (ticket?.id) {
          currentStatuses.set(ticket.id, ticket.status);
        }
      }
      
      // Check for tickets that moved to review
      let hasNewReviewTicket = false;
      for (const [ticketId, currentStatus] of currentStatuses) {
        const previousStatus = oldStatuses.get(ticketId);
        // Play sound if ticket moved to review and wasn't already in review
        if (currentStatus === 'review' && previousStatus && previousStatus !== 'review') {
          hasNewReviewTicket = true;
        }
      }
      
      // Play notification sound if enabled and a ticket moved to review
      if (hasNewReviewTicket && settingsStore.enableReviewNotificationSound) {
        playReviewNotification(true);
      }
      
      // Update previous statuses for next comparison
      previousTicketStatuses.value = currentStatuses;
    }, { deep: true });

    // Update title bar branding in DOM
    function updateTitleBarBranding(title) {
      titleBranding.value = title;
      // Update document title
      document.title = title;
      // Update title bar span in index.html
      const titleSpan = document.querySelector('.app-title span');
      if (titleSpan) {
        titleSpan.textContent = title;
      }
    }

    // Apply theme to document element reactively
    const theme = computed(() => settingsStore.settings.theme || 'light');
    watch(theme, (newTheme) => {
      document.documentElement.setAttribute('data-theme', newTheme);
    }, { immediate: true });

    onMounted(() => {
      settingsStore.loadSettings().then(() => {
        document.documentElement.setAttribute('data-theme', theme.value);
      }).catch((error) => {
        console.error('Failed to load settings for Kanban polling:', error);
      });

      // Ensure we have at least one board for backend compatibility
      if (boards.value.length === 0) {
        boardStore.addBoard('Board');
      }
      if (!currentBoard.value) {
        currentBoard.value = boards.value[0];
      }

      // Start polling if kanban view is active on mount
      if (activeView.value === 'kanban') {
        startPolling();
      }

      // Listen for title branding changes from main process
      if (window.electron && window.electron.onTitleBrandingChanged) {
        titleBrandingCleanup = window.electron.onTitleBrandingChanged(({ title }) => {
          updateTitleBarBranding(title);
        });
      }

      if (window.electron?.ipcRenderer?.on) {
        closeConfirmCleanup = window.electron.ipcRenderer.on('app:confirmClose', (payload = {}) => {
          const activeRuns = Array.isArray(payload.activeRuns) ? payload.activeRuns : [];
          closeDialogData.value = {
            runCount: activeRuns.length,
            activeRuns
          };
          showCloseDialog.value = true;
        });

        window.electron.ipcRenderer.on('app:noAgentsConnected', () => {
          showNoAgentsDialog.value = true;
        });
      }
    });

    onUnmounted(() => {
      stopPolling();
      if (titleBrandingCleanup) {
        titleBrandingCleanup();
      }
      if (closeConfirmCleanup) {
        closeConfirmCleanup();
      }
    });

    function confirmClose() {
      showCloseDialog.value = false;
      if (window.electron?.ipcRenderer?.send) {
        window.electron.ipcRenderer.send('app:closeConfirmed');
      }
      if (typeof closeDialogResolve === 'function') {
        closeDialogResolve(true);
        closeDialogResolve = null;
      }
    }

    function cancelClose() {
      showCloseDialog.value = false;
      if (window.electron?.ipcRenderer?.send) {
        window.electron.ipcRenderer.send('app:closeCancelled');
      }
      if (typeof closeDialogResolve === 'function') {
        closeDialogResolve(false);
        closeDialogResolve = null;
      }
    }

    function selectBoard(board) {
      activeView.value = 'kanban';
      currentBoard.value = board;
    }

    const planFilePath = ref('');
    const showNoAgentsDialog = ref(false);

    function handleChangeView(view) {
      activeView.value = view;
      // Capture file path set by sidebar for Plan views
      if (view.startsWith('plan-') && window.__planFilePreviewPath) {
        planFilePath.value = window.__planFilePreviewPath;
      }
    }

    // Global navigation function for Plan views that can't emit directly
    window.__planNavigate = (view, filePath) => {
      if (filePath) {
        window.__planFilePreviewPath = filePath;
        planFilePath.value = filePath;
      }
      activeView.value = view;
    };

    const handleDeleteBoard = (boardId) => {
      const boardIdStr = String(boardId);
      if (!boardIdStr) return;
      const success = boardStore.deleteBoard(boardIdStr);
      if (success && currentBoard.value && String(currentBoard.value.id) === boardIdStr) {
        const otherBoards = boardStore.boards.filter(b => b.id !== boardId);
        if (otherBoards.length > 0) {
          selectBoard(otherBoards[0]);
        } else {
          currentBoard.value = null;
        }
      }
    };

    return {
      columns,
      boards,
      currentBoard,
      activeView,
      titleBranding,
      getTasksForColumn,
      selectBoard,
      handleChangeView,
      planFilePath,
      showNoAgentsDialog,
      handleDeleteBoard,
      boardListRef,
      showCloseDialog,
      closeDialogData,
      confirmClose,
      cancelClose
    };
  }
};
</script>

<style>
:root {
  --primary-color: #4a90e2;
  --secondary-color: #f5f7fa;
  --text-color: #2c3e50;
  --border-color: #e1e4e8;
  --danger-color: #e74c3c;
  --success-color: #2ecc71;
  --warning-color: #f39c12;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Roboto', sans-serif;
  color: var(--text-color);
  background-color: #f8f9fa;
  line-height: 1.5;
}

[data-theme="dark"] body {
  background-color: #161a1f;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.app-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.kanban-board {
  display: flex;
  flex: 1;
  padding: 1.5rem;
  gap: 1.5rem;
  overflow-x: auto;
  background-color: var(--secondary-color);
}

.btn {
  padding: 0.5rem 1rem;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.2s ease;
}

.btn-primary {
  background-color: var(--primary-color);
  color: white;
}

.btn-primary:hover {
  background-color: #357abd;
}

.btn-danger {
  background-color: var(--danger-color);
  color: white;
}

.btn-danger:hover {
  background-color: #c0392b;
}

.btn-secondary {
  background-color: #eef1f5;
  color: #1f2c3a;
}

.btn-secondary:hover {
  background-color: #dde3ea;
}

[data-theme="dark"] .btn-secondary {
  background-color: #2d333b;
  color: #d4d8dd;
}

[data-theme="dark"] .btn-secondary:hover {
  background-color: #373d45;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 1200;
}

.close-warning-overlay {
  background:
    radial-gradient(circle at 8% 8%, rgba(255, 181, 71, 0.26), transparent 48%),
    linear-gradient(155deg, rgba(20, 34, 54, 0.72), rgba(13, 22, 36, 0.84));
  backdrop-filter: blur(3px);
}

.close-dialog {
  width: min(660px, 100%);
  border-radius: 16px;
  background: #ffffff;
  border: 1px solid #cfd8e4;
  box-shadow: 0 24px 52px rgba(13, 26, 41, 0.38);
  overflow: hidden;
}

[data-theme="dark"] .close-dialog {
  background: #21262d;
  border-color: #373d45;
}

/* No Agents Dialog */
.no-agents-dialog {
  background: #1e2535;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 2rem;
  width: 440px;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.no-agents-icon {
  margin-bottom: 1rem;
}

.no-agents-icon .mdi {
  font-size: 3rem;
  color: #e5a830;
}

.no-agents-dialog h3 {
  margin: 0 0 0.75rem;
  font-size: 1.15rem;
  color: rgba(255, 255, 255, 0.9);
}

.no-agents-dialog p {
  margin: 0 0 1.5rem;
  font-size: 0.88rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.5);
}

.no-agents-actions {
  display: flex;
  justify-content: center;
  gap: 0.75rem;
}

.no-agents-actions .btn {
  padding: 0.5rem 1.25rem;
  border-radius: 6px;
  font-size: 0.88rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.no-agents-actions .btn-secondary {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.6);
}

.no-agents-actions .btn-secondary:hover {
  background: rgba(255, 255, 255, 0.12);
}

.no-agents-actions .btn-primary {
  background: #4a90e2;
  color: #fff;
}

.no-agents-actions .btn-primary:hover {
  background: #357abd;
}

.close-dialog-header {
  display: flex;
  gap: 0.95rem;
  align-items: flex-start;
  padding: 1.1rem 1.2rem;
  background: linear-gradient(96deg, #fff7e4, #ffefbd);
  border-bottom: 1px solid #e9d6aa;
}

.warning-icon-wrap {
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background-color: #ffd97f;
  color: #7f4e00;
  flex-shrink: 0;
}

.warning-icon {
  width: 1.25rem;
  height: 1.25rem;
}

.close-dialog-title-group {
  min-width: 0;
}

.close-dialog-kicker {
  margin: 0 0 0.15rem;
  color: #845300;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.055em;
  text-transform: uppercase;
}

.close-dialog-title-group h3 {
  margin: 0;
  color: #2b1d06;
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1.3;
}

.close-dialog-body {
  padding: 1.1rem 1.2rem;
  color: #1f2f40;
}

.close-dialog-message {
  margin: 0;
}

.close-dialog-message p {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 0.94rem;
  line-height: 1.45;
  color: #1f3548;
  font-weight: 600;
}

.run-count-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: #ffe4a5;
  border: 1px solid #e6be62;
  color: #5f3c00;
  padding: 0.08rem 0.58rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.025em;
  text-transform: uppercase;
}

.close-dialog-tickets {
  margin-top: 0.95rem;
  border: 1px solid #d3dde8;
  border-radius: 12px;
  background: linear-gradient(180deg, #f8fafd 0%, #f2f6fb 100%);
  padding: 0.75rem;
}

.tickets-label {
  margin: 0 0 0.45rem;
  font-size: 0.74rem;
  color: #3f5670;
  letter-spacing: 0.045em;
  text-transform: uppercase;
  font-weight: 700;
}

.tickets-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  max-height: min(35vh, 220px);
  overflow-y: auto;
}

.ticket-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.65rem;
  border-radius: 9px;
  background: #ffffff;
  border: 1px solid #d2ddea;
  padding: 0.5rem 0.6rem;
}

.ticket-id {
  font-size: 0.83rem;
  font-weight: 700;
  color: #17324a;
  word-break: break-word;
}

.ticket-agent {
  flex-shrink: 0;
  font-size: 0.72rem;
  font-weight: 700;
  color: #294864;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 999px;
  background: #e9f1fa;
  border: 1px solid #c8d9eb;
  padding: 0.12rem 0.45rem;
}

.close-dialog-question {
  margin: 0.95rem 0 0;
  font-size: 0.95rem;
  color: #1b3347;
  font-weight: 600;
}

.close-dialog-actions {
  border-top: 1px solid #dfe6ef;
  padding: 0.9rem 1.2rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  flex-wrap: wrap;
  background: #fbfcfe;
}

.close-dialog-actions .btn {
  min-height: 2.3rem;
  padding: 0.45rem 1.05rem;
  border-radius: 8px;
  font-size: 0.9rem;
}

@media (max-width: 640px) {
  .close-dialog {
    width: 100%;
    border-radius: 14px;
  }

  .close-dialog-header,
  .close-dialog-body,
  .close-dialog-actions {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .close-dialog-header {
    align-items: center;
  }

  .close-dialog-message p {
    font-size: 0.91rem;
  }

  .ticket-item {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.4rem;
  }

  .ticket-agent {
    align-self: flex-start;
  }

  .close-dialog-actions .btn {
    flex: 1 1 calc(50% - 0.3rem);
    justify-content: center;
  }
}

/* Scrollbar styling */
::-webkit-scrollbar {
  height: 8px;
  width: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

[data-theme="dark"] ::-webkit-scrollbar-track {
  background: #2a2f36;
}

[data-theme="dark"] ::-webkit-scrollbar-thumb {
  background: #484e57;
}

[data-theme="dark"] ::-webkit-scrollbar-thumb:hover {
  background: #5a6270;
}

[data-theme="dark"] .close-dialog-body {
  color: #c0c6ce;
}

[data-theme="dark"] .close-dialog-header {
  background: linear-gradient(96deg, #332a10, #3d3010);
  border-bottom-color: #4a3d1a;
}

[data-theme="dark"] .close-dialog-actions {
  border-top-color: #373d45;
  background: #1a1e24;
}

[data-theme="dark"] .close-dialog-tickets {
  border-color: #373d45;
  background: linear-gradient(180deg, #1a1e24 0%, #1e2228 100%);
}

[data-theme="dark"] .ticket-item {
  background: #21262d;
  border-color: #373d45;
}

[data-theme="dark"] .ticket-id {
  color: #d4d8dd;
}

[data-theme="dark"] .ticket-agent {
  color: #8bb8e0;
  background: #1a2a3a;
  border-color: #2a3a4a;
}
</style>
