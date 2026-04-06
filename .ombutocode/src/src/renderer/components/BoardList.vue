<template>
  <div class="board-list" :class="{ 'is-collapsed': isCollapsed }">
    <div class="board-list-header">
      <template v-if="!isCollapsed">
        <div class="sidebar-tabs">
          <button
            class="sidebar-tab"
            :class="{ 'is-active': sidebarMode === 'plan' }"
            @click="switchMode('plan')"
          >
            <span class="mdi mdi-map-outline"></span>
            Plan
          </button>
          <button
            class="sidebar-tab"
            :class="{ 'is-active': sidebarMode === 'build' }"
            @click="switchMode('build')"
          >
            <span class="mdi mdi-hammer-wrench"></span>
            Build
          </button>
        </div>
      </template>
      <template v-else>
        <span></span>
      </template>
      <button @click="toggleCollapse" class="collapse-btn" :title="isCollapsed ? 'Expand' : 'Collapse'">
        <span class="mdi" :class="isCollapsed ? 'mdi-chevron-left' : 'mdi-chevron-right'"></span>
      </button>
    </div>

    <!-- ===== PLAN MODE (expanded) — placeholder for future ===== -->
    <div class="board-list-content" v-if="!isCollapsed && sidebarMode === 'plan'">
      <div class="plan-placeholder">
        <span class="mdi mdi-map-outline plan-placeholder-icon"></span>
        <p>Planning tools coming soon</p>
      </div>
    </div>

    <!-- ===== BUILD MODE (expanded) ===== -->
    <div class="board-list-content" v-if="!isCollapsed && sidebarMode === 'build'">
      <div
        class="board-item"
        :class="{ 'is-active': activeView === 'workspace' }"
        @click="$emit('change-view', 'workspace')"
      >
        <span class="board-icon">
          <span class="mdi mdi-view-dashboard-outline"></span>
        </span>
        <span class="board-name">Workspace</span>
      </div>

      <div
        class="board-item"
        :class="{ 'is-active': activeView === 'kanban' }"
        @click="$emit('change-view', 'kanban')"
      >
        <span class="board-icon">
          <span class="mdi mdi-view-column"></span>
        </span>
        <span class="board-name">Board</span>
      </div>

      <div
        class="board-item"
        :class="{ 'is-active': activeView === 'requests' }"
        @click="$emit('change-view', 'requests')"
      >
        <span class="board-icon">
          <span class="mdi mdi-message-text-outline"></span>
        </span>
        <span class="board-name">Requests</span>
      </div>

      <div
        class="board-item"
        :class="{ 'is-active': activeView === 'features' }"
        @click="$emit('change-view', 'features')"
      >
        <span class="board-icon">
          <span class="mdi mdi-shape-outline"></span>
        </span>
        <span class="board-name">Features</span>
      </div>

      <div
        class="board-item"
        :class="{ 'is-active': activeView === 'prd' }"
        @click="$emit('change-view', 'prd')"
      >
        <span class="board-icon">
          <span class="mdi mdi-file-document-outline"></span>
        </span>
        <span class="board-name">PRD</span>
      </div>

      <div
        class="board-item"
        :class="{ 'is-active': activeView === 'backlog' }"
        @click="$emit('change-view', 'backlog')"
      >
        <span class="board-icon">
          <span class="mdi mdi-format-list-bulleted"></span>
        </span>
        <span class="board-name">Backlog</span>
      </div>

      <div class="divider"></div>

      <div
        class="board-item"
        :class="{ 'is-active': activeView === 'agents' }"
        @click="$emit('change-view', 'agents')"
      >
        <span class="board-icon">
          <span class="mdi mdi-robot-outline"></span>
        </span>
        <span class="board-name">Coding Agents</span>
      </div>

      <div
        class="board-item"
        :class="{ 'is-active': activeView === 'automation' }"
        @click="$emit('change-view', 'automation')"
      >
        <span class="board-icon">
          <span class="mdi mdi-lightning-bolt-outline"></span>
        </span>
        <span class="board-name">Automation</span>
      </div>

      <div
        class="board-item"
        :class="{ 'is-active': activeView === 'logs' }"
        @click="$emit('change-view', 'logs')"
      >
        <span class="board-icon">
          <span class="mdi mdi-text-box-outline"></span>
        </span>
        <span class="board-name">Logs</span>
      </div>

      <div class="divider"></div>

      <div
        class="board-item"
        :class="{ 'is-active': activeView === 'archive' }"
        @click="$emit('change-view', 'archive')"
      >
        <span class="board-icon">
          <span class="mdi mdi-archive"></span>
        </span>
        <span class="board-name">Archive</span>
      </div>

    </div>

    <!-- ===== Bottom section (always visible, both tabs) ===== -->
    <div v-if="!isCollapsed" class="board-list-bottom">
      <div class="divider"></div>
      <div
        class="board-item"
        :class="{ 'is-active': activeView === 'settings' }"
        @click="$emit('change-view', 'settings')"
      >
        <span class="board-icon">
          <span class="mdi mdi-cog-outline"></span>
        </span>
        <span class="board-name">Settings</span>
      </div>

      <div v-if="showAutoToggle" class="auto-toggle-wrap">
        <div class="divider"></div>
        <div class="auto-toggle-item" @click="toggleAutoMode">
          <span class="board-icon">
            <span class="mdi" :class="autoRunning ? 'mdi-lightning-bolt' : 'mdi-lightning-bolt-outline'"></span>
          </span>
          <span class="board-name">Auto</span>
          <span class="auto-indicator" :class="{ 'is-on': autoRunning }">{{ autoRunning ? 'ON' : 'OFF' }}</span>
        </div>
      </div>
    </div>

    <!-- ===== COLLAPSED VIEW ===== -->
    <div v-if="isCollapsed" class="collapsed-view">
      <div
        class="collapsed-board collapsed-tab"
        :class="{ 'is-active': sidebarMode === 'plan' }"
        @click="switchMode('plan')"
        title="Plan"
      >
        <span class="mdi mdi-map-outline"></span>
      </div>
      <div
        class="collapsed-board collapsed-tab"
        :class="{ 'is-active': sidebarMode === 'build' }"
        @click="switchMode('build')"
        title="Build"
      >
        <span class="mdi mdi-hammer-wrench"></span>
      </div>
      <div class="divider collapsed-divider"></div>

      <template v-if="sidebarMode === 'build'">
        <div
          class="collapsed-board"
          :class="{ 'is-active': activeView === 'workspace' }"
          @click="$emit('change-view', 'workspace')"
          title="Workspace"
        >
          <span class="mdi mdi-view-dashboard-outline"></span>
        </div>
        <div
          class="collapsed-board"
          :class="{ 'is-active': activeView === 'kanban' }"
          @click="$emit('change-view', 'kanban')"
          title="Board"
        >
          <span class="mdi mdi-view-column"></span>
        </div>
        <div
          class="collapsed-board"
          :class="{ 'is-active': activeView === 'requests' }"
          @click="$emit('change-view', 'requests')"
          title="Requests"
        >
          <span class="mdi mdi-message-text-outline"></span>
        </div>
        <div
          class="collapsed-board"
          :class="{ 'is-active': activeView === 'features' }"
          @click="$emit('change-view', 'features')"
          title="Features"
        >
          <span class="mdi mdi-shape-outline"></span>
        </div>
        <div
          class="collapsed-board"
          :class="{ 'is-active': activeView === 'prd' }"
          @click="$emit('change-view', 'prd')"
          title="PRD"
        >
          <span class="mdi mdi-file-document-outline"></span>
        </div>
        <div
          class="collapsed-board"
          :class="{ 'is-active': activeView === 'backlog' }"
          @click="$emit('change-view', 'backlog')"
          title="Backlog"
        >
          <span class="mdi mdi-format-list-bulleted"></span>
        </div>
        <div
          class="collapsed-board"
          :class="{ 'is-active': activeView === 'agents' }"
          @click="$emit('change-view', 'agents')"
          title="Coding Agents"
        >
          <span class="mdi mdi-robot-outline"></span>
        </div>
        <div
          class="collapsed-board"
          :class="{ 'is-active': activeView === 'automation' }"
          @click="$emit('change-view', 'automation')"
          title="Automation"
        >
          <span class="mdi mdi-lightning-bolt-outline"></span>
        </div>
        <div
          class="collapsed-board"
          :class="{ 'is-active': activeView === 'logs' }"
          @click="$emit('change-view', 'logs')"
          title="Logs"
        >
          <span class="mdi mdi-text-box-outline"></span>
        </div>
        <div
          class="collapsed-board"
          :class="{ 'is-active': activeView === 'archive' }"
          @click="$emit('change-view', 'archive')"
          title="Archive"
        >
          <span class="mdi mdi-archive"></span>
        </div>
      </template>

      <div class="auto-toggle-spacer"></div>
      <div
        class="collapsed-board"
        :class="{ 'is-active': activeView === 'settings' }"
        @click="$emit('change-view', 'settings')"
        title="Settings"
      >
        <span class="mdi mdi-cog-outline"></span>
      </div>
      <div v-if="showAutoToggle" class="collapsed-auto-wrap">
        <div
          class="collapsed-board"
          :class="{ 'auto-active': autoRunning }"
          @click="toggleAutoMode"
          :title="autoRunning ? 'Auto: ON' : 'Auto: OFF'"
        >
          <span class="mdi" :class="autoRunning ? 'mdi-lightning-bolt' : 'mdi-lightning-bolt-outline'"></span>
        </div>
      </div>
    </div>
    
  </div>
</template>

<script>
import { ref, onMounted, computed, nextTick } from 'vue';
import { useBoardStore } from '@/stores/boardStore';
import { useDropbox } from '@/utils/dropbox';

export default {
  name: 'BoardList',
  props: {
    boards: {
      type: Array,
      required: true
    },
    currentBoard: {
      type: Object,
      default: null
    },
    activeView: {
      type: String,
      default: 'kanban'
    }
  },
  emits: {
    'select-board': (board) => {
      console.log('select-board emitted with:', board);
      return true;
    },
    'delete-board': (boardId) => {
      console.log('delete-board emitted with:', boardId);
      return true;
    },
    'change-view': (view) => {
      return true;
    }
  },
  setup(props, { emit }) {
    const isCollapsed = ref(false);
    const sidebarMode = ref('build');
    const boardToDelete = ref(null);
    const dropbox = useDropbox();
    const boardStore = useBoardStore();
    const isConnecting = ref(false);
    const dropboxError = ref(null);
    const editingBoardId = ref(null);
    const editedBoardName = ref('');
    const autoRunning = ref(false);
    const showAutoToggle = computed(() => props.activeView !== 'agents');

    const switchMode = (mode) => {
      sidebarMode.value = mode;
    };
    
    // Track authentication state
  const authState = ref(0);
  const isDropboxConnected = ref(false);

  // Function to update the connection status
  const updateConnectionStatus = async () => {
    try {
      isDropboxConnected.value = await dropbox.isAuthenticated();
      console.log('Dropbox connection status updated:', isDropboxConnected.value);
    } catch (error) {
      console.error('Error checking Dropbox connection:', error);
      isDropboxConnected.value = false;
    }
  };

  // Handle component mount logic
  onMounted(async () => {
    
    // Initial connection check
    await updateConnectionStatus();
    // Load scheduler auto mode status
    await loadSchedulerStatus();
    console.log('Component mounted, initial Dropbox connection status:', isDropboxConnected.value);

    // Set up event listener to refresh status on window focus
    const handleFocus = () => {
      console.log('Window focused, re-checking Dropbox connection status...');
      updateConnectionStatus();
    };

    window.addEventListener('focus', handleFocus);
    
    // Cleanup listener on unmount
    return () => window.removeEventListener('focus', handleFocus);
  });
  
    const toggleCollapse = () => {
      isCollapsed.value = !isCollapsed.value;
    };

    const loadSchedulerStatus = async () => {
      try {
        const status = await window.electron.ipcRenderer.invoke('scheduler:status');
        autoRunning.value = status?.status === 'running' || status?.status === 'paused';
      } catch (e) {
        console.error('[BoardList] Failed to load scheduler status:', e);
      }
    };

    const toggleAutoMode = async () => {
      try {
        const channel = autoRunning.value ? 'scheduler:stop' : 'scheduler:start';
        const status = await window.electron.ipcRenderer.invoke(channel);
        autoRunning.value = status?.status === 'running' || status?.status === 'paused';
      } catch (e) {
        console.error('[BoardList] Failed to toggle auto mode:', e);
      }
    };
    
    const selectBoard = (board) => {
      emit('change-view', 'kanban');
      emit('select-board', board);
    };

    const onBoardClick = (board) => {
      if (editingBoardId.value === board.id) return; // ignore clicks while editing this row
      if (editingBoardId.value) return; // avoid switching while editing another row
      selectBoard(board);
    };

    const startEditingBoard = async (board) => {
      editingBoardId.value = board.id;
      editedBoardName.value = board.name || '';
      await nextTick();
    };

    const saveBoardEdit = (board) => {
      const name = (editedBoardName.value || '').trim();
      if (name && name !== board.name) {
        try {
          boardStore.updateBoard({ id: board.id, name });
        } catch (e) {
          console.error('Failed to rename board:', e);
        }
      }
      cancelBoardEdit();
    };

    const cancelBoardEdit = () => {
      editingBoardId.value = null;
      editedBoardName.value = '';
    };
    
    const connectDropbox = async () => {
      console.log('=== DROPBOX CONNECTION STARTED ===');
      console.log('Current connection status:', isDropboxConnected.value ? 'Connected' : 'Disconnected');
      
      if (isDropboxConnected.value) {
        console.log('Already connected to Dropbox, no action needed');
        return true;
      }
      
      isConnecting.value = true;
      dropboxError.value = null;
      console.log('Initiating Dropbox authentication flow...');
      
      try {
        console.log('Calling dropbox.authenticate()...');
        const result = await dropbox.authenticate();
        console.log('Authentication result:', result);
        
        if (result && result.success) {
          console.log('Successfully authenticated with Dropbox');
          await updateConnectionStatus(); // Update the connection status
          return true;
        } else {
          throw new Error(result?.error || 'Authentication failed');
        }
      } catch (error) {
        console.error('=== DROPBOX AUTHENTICATION ERROR ===');
        console.error('Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
        
        dropboxError.value = error.message || 'Failed to connect to Dropbox';
        console.error('Error message set in UI:', dropboxError.value);
        
        console.log('=== DROPBOX CONNECTION FAILED ===');
        return false;
      } finally {
        isConnecting.value = false;
        console.log('Connection attempt completed, isConnecting set to false');
      }
    };
    
    const disconnectDropbox = async () => {
      console.log('Disconnecting from Dropbox...');
      isConnecting.value = true;
      dropboxError.value = null;
      try {
        await dropbox.disconnect();
        await updateConnectionStatus();
        console.log('Successfully disconnected from Dropbox.');
      } catch (error) {
        console.error('Error during Dropbox disconnection:', error);
        dropboxError.value = 'Failed to disconnect. Please try again.';
      } finally {
        isConnecting.value = false;
      }
    };
    
    const exportBoards = async () => {
      if (!isDropboxConnected.value) {
        const connected = await connectDropbox();
        if (!connected) return;
      }
      
      try {
        // Build full backup payload using boards from props and tasks from the store
        const boards = props.boards || [];
        const tasks = {};
        for (const b of boards) {
          tasks[b.id] = boardStore.getTasks(b.id) || [];
        }
        const backupPayload = {
          boards,
          tasks,
          timestamp: new Date().toISOString()
        };
        
        const result = await dropbox.backupData(backupPayload, 'jeffcode-backup.json');
        if (result.success) {
          alert('Successfully backed up to Dropbox!');
        } else {
          throw new Error(result.error || 'Failed to back up to Dropbox');
        }
      } catch (error) {
        console.error('Backup error:', error);
        alert(`Backup failed: ${error.message}`);
      }
    };
    
    const importBoards = async () => {
      if (!isDropboxConnected.value) {
        const connected = await connectDropbox();
        if (!connected) return;
      }
      
      try {
        console.log('[Import] Starting import...');
        // Prefer the default backup filename
        const defaultPath = '/jeffcode-backup.json';
        let backupData = null;
        
        // Try to fetch the default backup first
        try {
          console.log('[Import] Trying default backup path:', defaultPath);
          const dl = await dropbox.restoreData(defaultPath);
          console.log('[Import] Default restore result:', dl);
          if (dl?.success && dl.data) {
            backupData = dl.data;
          }
        } catch (e) {
          console.warn('[Import] Default backup not available, will list backups. Error:', e);
        }
        
        // If default not found, list and pick the latest JSON backup
        if (!backupData) {
          console.log('[Import] Listing backups...');
          const list = await dropbox.listBackups();
          console.log('[Import] listBackups result:', list);
          if (!list.success) throw new Error(list.error || 'Failed to list backups');
          if (!list.backups || list.backups.length === 0) {
            throw new Error('No backups found in Dropbox');
          }
          const latest = list.backups[0];
          const idOrPath = latest.id || latest.path;
          console.log('[Import] Using latest backup:', latest);
          console.log('[Import] Passing id/path to restoreData:', idOrPath);
          const dl2 = await dropbox.restoreData(idOrPath);
          console.log('[Import] Download result:', dl2);
          if (!dl2.success) throw new Error(dl2.error || 'Failed to download backup');
          backupData = dl2.data;
        }
        
        // Basic validation
        console.log('[Import] Backup payload preview:', {
          hasBoards: Array.isArray(backupData?.boards),
          boardCount: Array.isArray(backupData?.boards) ? backupData.boards.length : 0,
          hasTasks: !!backupData && typeof backupData.tasks === 'object'
        });
        if (!backupData || !Array.isArray(backupData.boards) || typeof backupData.tasks !== 'object') {
          throw new Error('Invalid backup format');
        }
        
        // Confirm overwrite
        const proceed = confirm('Importing will replace your current boards and tasks. Continue?');
        if (!proceed) return;
        
        console.log('[Import] Restoring into store...');
        const ok = boardStore.restoreFromBackup(backupData);
        console.log('[Import] Restore flag:', ok);
        if (ok) {
          alert('Import successful!');
        } else {
          throw new Error('Restore failed');
        }
      } catch (error) {
        console.error('[Import] Import error:', error);
        alert(`Import failed: ${error.message}`);
      }
    };
    
    const confirmDelete = (board) => {
      console.log('confirmDelete called with board:', board);
      boardToDelete.value = board;
    };

    const cancelDelete = () => {
      console.log('Delete cancelled by user');
      boardToDelete.value = null;
    };

    const deleteBoard = () => {
      const board = boardToDelete.value;
      if (!board) return;
      console.log('Emitting delete-board event with id:', board.id);
      // Emit the event with the board ID as a string
      emit('delete-board', String(board.id));

      // If we're deleting the currently selected board, select another one
      if (props.currentBoard && props.currentBoard.id === board.id) {
        const otherBoards = props.boards.filter(b => b.id !== board.id);
        console.log('Other available boards:', otherBoards);
        if (otherBoards.length > 0) {
          console.log('Selecting new board:', otherBoards[0].id);
          emit('select-board', otherBoards[0]);
        }
      }

      boardToDelete.value = null;
    };
    
    // Focus directive for inline inputs
    const vFocus = {
      mounted(el) { el.focus(); }
    };

    // Test event handler
    onMounted(() => {
      // @ts-ignore - for testing only
      window.testEmitDelete = (boardId) => {
        console.log('Test emitting delete event with:', boardId);
        emit('delete-board', boardId);
      };
      
      // Test if the component is properly emitting events
      console.log('BoardList mounted, testing event emission...');
      // @ts-ignore
      window.testBoardListEmit = (event, ...args) => {
        console.log(`Manually emitting ${event} with args:`, args);
        emit(event, ...args);
      };
    });
    
    return {
      isCollapsed,
      boardToDelete,
      isDropboxConnected,
      isConnecting,
      dropboxError,
      toggleCollapse,
      selectBoard,
      onBoardClick,
      confirmDelete,
      cancelDelete,
      deleteBoard,
      connectDropbox,
      disconnectDropbox,
      exportBoards,
      importBoards,
      editingBoardId,
      editedBoardName,
      startEditingBoard,
      saveBoardEdit,
      cancelBoardEdit,
      vFocus,
      autoRunning,
      showAutoToggle,
      toggleAutoMode,
      sidebarMode,
      switchMode
    };
  }
};
</script>

<style scoped>
.board-list {
  width: 250px;
  background-color: #1a2030;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
  overflow: hidden;
  height: 100%;
  color: rgba(255, 255, 255, 0.7);
}

.board-list.is-collapsed {
  width: 50px;
}

/* ── Sidebar tabs ── */
.sidebar-tabs {
  display: flex;
  gap: 2px;
  flex: 1;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 6px;
  padding: 2px;
}

.sidebar-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0.35rem 0.5rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: rgba(255, 255, 255, 0.45);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.sidebar-tab:hover {
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.06);
}

.sidebar-tab.is-active {
  background: rgba(255, 255, 255, 0.1);
  color: #6dd4a0;
}

.sidebar-tab .mdi {
  font-size: 1rem;
}

.board-list-header {
  padding: 0.75rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  min-height: 48px;
}

.board-list-header h3 {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.collapse-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.35);
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.collapse-btn:hover {
  background-color: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
}

.board-list-content {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 0;
  display: flex;
  flex-direction: column;
}

.board-item {
  display: flex;
  align-items: center;
  padding: 0.55rem 1rem;
  margin: 1px 0;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
  border-left: 3px solid transparent;
  border-radius: 0;
  font-size: 0.9rem;
  font-weight: 300;
}

.board-item:hover {
  background-color: rgba(255, 255, 255, 0.05);
}

.board-item.is-active {
  background-color: rgba(109, 212, 160, 0.08);
  color: #6dd4a0;
  font-weight: 400;
  border-left-color: #6dd4a0;
}

.board-icon {
  margin-right: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 1.05rem;
}

.board-item.is-active .board-icon {
  color: #6dd4a0;
}

.board-item:hover .board-icon {
  color: rgba(255, 255, 255, 0.6);
}

.board-item.is-active:hover .board-icon {
  color: #6dd4a0;
}

.board-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.board-name-input {
  flex: 1;
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  font-size: 0.9rem;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.85);
}

/* Collapsed delete button hover behavior */
.collapsed-board .delete-board-btn {
  opacity: 0;
  transition: opacity 0.2s;
}

.collapsed-board:hover .delete-board-btn,
.collapsed-board .delete-board-btn:focus-visible {
  opacity: 1;
}

.delete-board {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.35);
  cursor: pointer;
  opacity: 0;
  padding: 0.25rem;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  margin-left: 0.5rem;
}

.board-item:hover .delete-board {
  opacity: 1;
}

.delete-board:hover {
  color: #e74c3c;
  background-color: rgba(231, 76, 60, 0.15);
}

.add-board-btn {
  width: calc(100% - 1rem);
  margin: 0.5rem;
  padding: 0.5rem;
  border: 1px dashed rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  background: none;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.add-board-btn:hover {
  background-color: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.25);
}

.add-board-btn .mdi {
  margin-right: 0.5rem;
  font-size: 1.1rem;
}

.section-label {
  padding: 0.25rem 1rem;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.3);
}

.divider {
  height: 1px;
  background-color: rgba(255, 255, 255, 0.06);
  margin: 0.5rem 1rem;
}

.board-actions {
  padding: 0.5rem 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: none;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.2s;
  width: 100%;
  text-align: left;
  color: rgba(255, 255, 255, 0.7);
}

.action-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
}

.action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.action-btn.connected {
  background: rgba(109, 212, 160, 0.12);
  color: #6dd4a0;
  border: 1px solid rgba(109, 212, 160, 0.2);
}

.action-btn.connected:hover {
  background: rgba(109, 212, 160, 0.18);
}

.connected-text {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.check-icon {
  color: #6dd4a0;
  font-size: 1.1em;
  margin-left: 0.25rem;
}

.action-btn .mdi {
  font-size: 1.25rem;
  color: rgba(255, 255, 255, 0.5);
}

.action-btn.connected .mdi {
  color: #5b9bd5;
}

.dropbox-connected,
.dropbox-connect {
  width: 100%;
}

.error-message {
  color: #ef5350;
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  background: rgba(239, 83, 80, 0.12);
  border-radius: 4px;
  margin-top: 0.25rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  border-top-color: rgba(255, 255, 255, 0.8);
  animation: spin 1s ease-in-out infinite;
  margin-left: 8px;
}

/* Collapsed view */
.collapsed-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.5rem 0;
  flex: 1;
}

.collapsed-board {
  width: 36px;
  height: 36px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 1px 0;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.4);
  transition: all 0.15s;
}

.collapsed-board:hover {
  background-color: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.7);
}

.collapsed-board.is-active {
  background-color: rgba(109, 212, 160, 0.1);
  color: #6dd4a0;
}

.collapsed-tab {
  font-size: 1.1rem;
}

/* Plan placeholder */
.plan-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 2rem 1rem;
  color: rgba(255, 255, 255, 0.25);
  text-align: center;
}

.plan-placeholder-icon {
  font-size: 2rem;
  margin-bottom: 0.75rem;
  opacity: 0.5;
}

.plan-placeholder p {
  margin: 0;
  font-size: 0.8rem;
}

.collapsed-divider {
  width: 24px;
  margin: 0.35rem auto;
}

.collapsed-add {
  width: 36px;
  height: 36px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0.5rem 0 0;
  background: none;
  border: 1px dashed rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.35);
  cursor: pointer;
  transition: all 0.2s;
}

.collapsed-add:hover {
  background-color: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.25);
}

/* Bottom section (Settings + Auto, always visible) */
.board-list-bottom {
  flex-shrink: 0;
  padding-bottom: 0.5rem;
}

/* Auto toggle */
.auto-toggle-spacer {
  flex: 1;
}

.auto-toggle-wrap {
  padding-bottom: 0.5rem;
}

.auto-toggle-item {
  display: flex;
  align-items: center;
  padding: 0.55rem 1rem;
  margin: 1px 0;
  cursor: pointer;
  transition: all 0.15s;
  border-left: 3px solid transparent;
  font-weight: 300;
}

.auto-toggle-item:hover {
  background-color: rgba(255, 255, 255, 0.05);
}

.auto-toggle-item .board-icon {
  margin-right: 0.75rem;
}

.auto-indicator {
  margin-left: auto;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 0.15rem 0.45rem;
  border-radius: 3px;
  background-color: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.4);
}

.auto-indicator.is-on {
  background-color: rgba(109, 212, 160, 0.15);
  color: #6dd4a0;
}

.collapsed-auto-wrap {
  margin-top: auto;
}

.collapsed-board.auto-active {
  background-color: rgba(109, 212, 160, 0.12);
  color: #6dd4a0;
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background-color: #1e2535;
  border-radius: 8px;
  padding: 1.5rem;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.modal h4 {
  margin-top: 0;
  margin-bottom: 1rem;
  color: rgba(255, 255, 255, 0.9);
}

.modal p {
  margin: 0 0 1.5rem;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-cancel {
  background-color: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
}

.btn-cancel:hover {
  background-color: rgba(255, 255, 255, 0.12);
}

.btn-danger {
  background-color: #e74c3c;
  color: white;
}

.btn-danger:hover {
  background-color: #c0392b;
}

/* Scrollbar styling */
.board-list-content::-webkit-scrollbar {
  width: 4px;
}

.board-list-content::-webkit-scrollbar-track {
  background: transparent;
}

.board-list-content::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.board-list-content::-webkit-scrollbar-thumb:hover {
  background-color: rgba(255, 255, 255, 0.2);
}
</style>
