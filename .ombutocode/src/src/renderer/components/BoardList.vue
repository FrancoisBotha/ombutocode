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
        <span class="mdi" :class="isCollapsed ? 'mdi-chevron-right' : 'mdi-chevron-left'"></span>
      </button>
    </div>

    <!-- ===== PLAN MODE (expanded) ===== -->
    <div class="board-list-content plan-mode-content" v-if="!isCollapsed && sidebarMode === 'plan'">
      <!-- Plan nav icon bar -->
      <div class="plan-nav-icons">
        <button
          v-for="item in planNavIconItems"
          :key="item.view"
          class="plan-nav-btn"
          :class="{ 'is-active': activeView === item.view }"
          :title="item.label"
          @click="$emit('change-view', item.view)"
        >
          <span class="mdi" :class="item.icon"></span>
        </button>
        <button
          class="plan-nav-btn"
          :title="planSortMode === 'alphabetical' ? 'Switch to hierarchical sort' : 'Switch to alphabetical sort'"
          @click="togglePlanSortMode"
        >
          <span class="mdi" :class="planSortMode === 'alphabetical' ? 'mdi-sort-alphabetical-ascending' : 'mdi-sort-variant'"></span>
        </button>
        <button class="plan-nav-btn" title="Refresh file tree" @click="loadFileTree">
          <span class="mdi mdi-refresh"></span>
        </button>
      </div>

      <!-- Plan text menu -->
      <div class="plan-text-menu">
        <div v-for="group in planNavGroups" :key="group.label" class="plan-text-group">
          <div class="plan-text-group-label">{{ group.label }}</div>
          <a
            v-for="item in group.items"
            :key="item.view"
            class="plan-text-link"
            :class="{ 'is-active': activeView === item.view }"
            @click="onTextMenuClick(item)"
          >{{ item.label }}</a>
        </div>
      </div>

      <!-- Filesystem tree -->
      <div class="plan-text-group-label plan-tree-label">Document Explorer</div>
      <div class="plan-file-tree">
        <template v-for="node in planFlatNodes" :key="node.path">
          <div
            v-if="node.type === 'folder'"
            class="plan-tree-node"
            :class="{ 'drop-target': planDropTarget === node.path }"
            :style="{ paddingLeft: node.depth * 16 + 8 + 'px' }"
            @click="togglePlanFolder(node.path)"
            @contextmenu.prevent="onPlanFolderContext($event, node)"
            @dragover.prevent="onPlanDragOver($event, node)"
            @dragleave="planDropTarget = null"
            @drop.prevent="onPlanDrop($event, node)"
          >
            <button class="plan-expand-btn">
              <span class="mdi" :class="planExpandedFolders.has(node.path) ? 'mdi-chevron-down' : 'mdi-chevron-right'"></span>
            </button>
            <span class="mdi plan-node-icon plan-folder-icon" :class="planExpandedFolders.has(node.path) ? 'mdi-folder-open' : 'mdi-folder'"></span>
            <span class="plan-node-title">{{ node.name }}</span>
          </div>
          <div
            v-else
            class="plan-tree-node"
            :class="{ 'is-active': planActivePath === node.path }"
            :style="{ paddingLeft: node.depth * 16 + 8 + 'px' }"
            draggable="true"
            @click="navigatePlanFile(node)"
            @contextmenu.prevent="onPlanFileContext($event, node)"
            @dragstart="onPlanDragStart($event, node)"
          >
            <span class="plan-expand-spacer"></span>
            <span class="mdi plan-node-icon plan-file-icon mdi-file-document-outline"></span>
            <span class="plan-node-title">{{ node.name }}</span>
          </div>
        </template>
      </div>

      <!-- Folder context menu -->
      <div v-if="planContextMenu" class="plan-context-menu" :style="{ left: planContextMenu.x + 'px', top: planContextMenu.y + 'px' }">
        <button class="plan-ctx-item" @click="planCtxAddSubfolder"><span class="mdi mdi-folder-plus"></span> New Sub-folder</button>
        <button v-if="planContextMenu.node.depth > 0" class="plan-ctx-item plan-ctx-delete" @click="planCtxDeleteFolder"><span class="mdi mdi-folder-remove"></span> Delete Folder</button>
      </div>

      <!-- File context menu -->
      <div v-if="planFileContextMenu" class="plan-context-menu" :style="{ left: planFileContextMenu.x + 'px', top: planFileContextMenu.y + 'px' }">
        <button class="plan-ctx-item plan-ctx-delete" @click="planCtxDeleteFile"><span class="mdi mdi-file-remove"></span> Delete File</button>
      </div>

      <!-- New folder input -->
      <div v-if="planNewFolderParent" class="plan-new-folder-bar">
        <input
          :ref="el => { if (el) el.focus() }"
          v-model="planNewFolderName"
          class="plan-new-folder-input"
          placeholder="Folder name"
          @keyup.enter="createPlanSubfolder"
          @keyup.escape="planNewFolderParent = null"
          @blur="createPlanSubfolder"
        />
      </div>
    </div>

    <!-- ===== BUILD MODE (expanded) ===== -->
    <div class="board-list-content plan-mode-content" v-if="!isCollapsed && sidebarMode === 'build'">
      <!-- Build nav icon bar -->
      <div class="plan-nav-icons">
        <button
          v-for="item in buildNavIconItems"
          :key="item.view"
          class="plan-nav-btn"
          :class="{ 'is-active': activeView === item.view }"
          :title="item.label"
          @click="$emit('change-view', item.view)"
        >
          <span class="mdi" :class="item.icon"></span>
        </button>
      </div>

      <!-- Build text menu -->
      <div class="plan-text-menu">
        <div v-for="group in buildNavGroups" :key="group.label" class="plan-text-group">
          <div class="plan-text-group-label">{{ group.label }}</div>
          <a
            v-for="item in group.items"
            :key="item.view"
            class="plan-text-link"
            :class="{ 'is-active': activeView === item.view }"
            @click="$emit('change-view', item.view)"
          >{{ item.label }}</a>
        </div>
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
      <div
        class="board-item"
        :class="{ 'is-active': activeView === 'help' }"
        @click="$emit('change-view', 'help')"
      >
        <span class="board-icon">
          <span class="mdi mdi-help-circle-outline"></span>
        </span>
        <span class="board-name">Help</span>
      </div>
      <div
        class="board-item"
        @click="showAboutModal = true"
      >
        <span class="board-icon">
          <span class="mdi mdi-information-outline"></span>
        </span>
        <span class="board-name">About</span>
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

      <template v-if="sidebarMode === 'plan'">
        <div
          v-for="item in planNavItems"
          :key="item.view"
          class="collapsed-board"
          :class="{ 'is-active': activeView === item.view }"
          @click="$emit('change-view', item.view)"
          :title="item.label"
        >
          <span class="mdi" :class="item.icon"></span>
        </div>
      </template>

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
          :class="{ 'is-active': activeView === 'epics' }"
          @click="$emit('change-view', 'epics')"
          title="Epics"
        >
          <span class="mdi mdi-shape-outline"></span>
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
      <div
        class="collapsed-board"
        :class="{ 'is-active': activeView === 'help' }"
        @click="$emit('change-view', 'help')"
        title="Help"
      >
        <span class="mdi mdi-help-circle-outline"></span>
      </div>
      <div
        class="collapsed-board"
        @click="showAboutModal = true"
        title="About"
      >
        <span class="mdi mdi-information-outline"></span>
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

    <!-- File Delete Confirmation -->
    <Teleport to="body">
      <div v-if="showFileDeleteConfirm" class="plan-delete-overlay" @click.self="showFileDeleteConfirm = false">
        <div class="plan-delete-dialog">
          <div class="plan-delete-icon">
            <span class="mdi mdi-file-remove-outline"></span>
          </div>
          <h3>Delete file?</h3>
          <p>Are you sure you want to delete <strong>{{ fileToDelete?.name }}</strong>? This action cannot be undone.</p>
          <div class="plan-delete-actions">
            <button class="prd-btn prd-btn-secondary" @click="showFileDeleteConfirm = false">Cancel</button>
            <button class="prd-btn prd-btn-danger" @click="confirmDeleteFile">
              <span class="mdi mdi-delete-outline"></span> Delete
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- About Modal -->
    <Teleport to="body">
      <div v-if="showAboutModal" class="about-modal-overlay" @click.self="showAboutModal = false">
        <div class="about-modal">
          <button class="about-modal-close" @click="showAboutModal = false">
            <span class="mdi mdi-close"></span>
          </button>
          <div class="about-modal-hero">
            <img src="../assets/logo.svg" alt="Ombuto Code" class="about-modal-logo" />
            <h2 class="about-modal-name">Ombuto Code</h2>
            <p class="about-modal-tagline">Agentic Software Engineering Workbench</p>
            <p class="about-modal-version" v-if="aboutBuildVersion">Version {{ aboutBuildVersion }}</p>
          </div>
          <div class="about-modal-body">
            <p class="about-modal-copyright">&copy; {{ new Date().getFullYear() }} Francois Botha. Licensed under Apache 2.0.</p>
            <div class="about-modal-section">
              <h3>Open Source Licenses</h3>
              <div class="about-modal-oss-list">
                <div v-for="lib in aboutLibraries" :key="lib.name" class="about-modal-oss-item">
                  <span class="about-modal-oss-name">{{ lib.name }}</span>
                  <span class="about-modal-oss-license">{{ lib.license }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, computed, nextTick } from 'vue';
import { useBoardStore } from '@/stores/boardStore';
import { useSettingsStore } from '@/stores/settingsStore';
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
    const sidebarMode = ref('plan');
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

    const buildNavIconItems = [
      { view: 'workspace', label: 'Workspace', icon: 'mdi-view-dashboard-outline' },
      { view: 'kanban', label: 'Board', icon: 'mdi-view-column' },
      { view: 'epics', label: 'Epics', icon: 'mdi-shape-outline' },
      { view: 'backlog', label: 'Backlog', icon: 'mdi-format-list-bulleted' },
      { view: 'automation', label: 'Automation', icon: 'mdi-lightning-bolt-outline' },
      { view: 'logs', label: 'Logs', icon: 'mdi-text-box-outline' },
      { view: 'archive', label: 'Archive', icon: 'mdi-archive' },
    ];

    const buildNavGroups = [
      {
        label: 'Development',
        items: [
          { view: 'workspace', label: 'Workspace' },
          { view: 'kanban', label: 'Board' },
          { view: 'epics', label: 'Epics' },
          { view: 'backlog', label: 'Backlog' },
          { view: 'requests', label: 'Requests' },
        ]
      },
      {
        label: 'Operations',
        items: [
          { view: 'automation', label: 'Automation' },
          { view: 'logs', label: 'Logs' },
          { view: 'archive', label: 'Archive' },
        ]
      },
    ];

    // About modal
    const showAboutModal = ref(false);
    const aboutBuildVersion = ref('');
    const aboutLibraries = [
      { name: 'Electron', license: 'MIT' },
      { name: 'Vue.js 3', license: 'MIT' },
      { name: 'Pinia', license: 'MIT' },
      { name: 'Vue Router', license: 'MIT' },
      { name: 'Vite', license: 'MIT' },
      { name: 'sql.js', license: 'MIT' },
      { name: 'CodeMirror 6', license: 'MIT' },
      { name: 'marked', license: 'MIT' },
      { name: 'highlight.js', license: 'BSD-3' },
      { name: 'gray-matter', license: 'MIT' },
      { name: 'chokidar', license: 'MIT' },
      { name: 'simple-git', license: 'MIT' },
      { name: 'Tabulator', license: 'MIT' },
      { name: 'xterm.js', license: 'MIT' },
      { name: 'xlsx-js-style', license: 'Apache-2.0' },
      { name: 'node-pty', license: 'MIT' },
      { name: 'Material Design Icons', license: 'Apache-2.0' },
    ];

    // ── Plan mode: nav items and file tree ──
    // Icons shown in the top toolbar
    const planNavIconItems = [
      { view: 'plan-dashboard', label: 'Dashboard', icon: 'mdi-view-dashboard' },
      { view: 'plan-structure', label: 'Structure', icon: 'mdi-sitemap' },
      { view: 'plan-prd', label: 'PRD', icon: 'mdi-file-document-outline' },
      { view: 'plan-mockups', label: 'Mockups', icon: 'mdi-image-multiple' },
      { view: 'plan-skills', label: 'Skills', icon: 'mdi-school-outline' },
      { view: 'plan-scratchpad', label: 'Scratch Pad', icon: 'mdi-note-text' },
    ];

    // Full list for collapsed sidebar view
    const planNavItems = [
      { view: 'plan-dashboard', label: 'Dashboard', icon: 'mdi-view-dashboard' },
      { view: 'plan-prd', label: 'PRD', icon: 'mdi-file-document-outline' },
      { view: 'plan-architecture', label: 'Architecture', icon: 'mdi-layers-outline' },
      { view: 'plan-structure', label: 'Structure', icon: 'mdi-sitemap' },
      { view: 'plan-use-cases', label: 'Use Cases', icon: 'mdi-text-box-multiple-outline' },
      { view: 'plan-use-case-diagrams', label: 'Use Case Diagrams', icon: 'mdi-vector-polygon' },
      { view: 'plan-class-diagrams', label: 'Class Diagrams', icon: 'mdi-shape-outline' },
      { view: 'plan-mockups', label: 'Mockups', icon: 'mdi-image-multiple' },
      { view: 'plan-skills', label: 'Skills', icon: 'mdi-school-outline' },
      { view: 'plan-scratchpad', label: 'Scratch Pad', icon: 'mdi-note-text' },
    ];

    const planNavGroups = [
      {
        label: 'Core',
        items: [
          { view: 'plan-prd', label: 'PRD' },
          { view: 'plan-architecture', label: 'Architecture' },
          { view: 'plan-epics', label: 'Epic Creation' },
          { view: 'plan-ticket-gen', label: 'Ticket Generation' },
        ]
      },
      {
        label: 'Requirements & Design',
        items: [
          { view: 'plan-functional-requirements', label: 'Functional Requirements' },
          { view: 'plan-non-functional-requirements', label: 'Non-Functional Requirements' },
          { view: 'plan-use-case-diagrams', label: 'Use Case Diagrams' },
          { view: 'plan-use-cases', label: 'Use Cases' },
          { view: 'plan-style-guide', label: 'Style Guide' },
          { view: 'plan-mockups', label: 'Mockups' },
          { view: 'plan-class-diagrams', label: 'Class Diagrams' },
          { view: 'plan-data-model', label: 'Data Model' },
        ]
      },
    ];

    // Sort mode for Plan file tree
    const settingsStore = useSettingsStore();
    const planSortMode = computed(() => settingsStore.treeSortMode);

    const HIERARCHICAL_ORDER = [
      'product requirements document',
      'architecture',
      'epics',
      'functional requirements',
      'non-functional requirements',
      'data model',
      'structure',
      'use case diagrams',
      'use cases',
      'class diagrams',
      'style guide',
      'mockups',
      'references',
      'skills',
      'scratchpad',
    ];

    function sortTopLevelFolders(children) {
      const folders = children.filter(n => n.type === 'folder');
      const files = children.filter(n => n.type === 'file');
      folders.sort((a, b) => {
        const aIdx = HIERARCHICAL_ORDER.indexOf(a.name.toLowerCase());
        const bIdx = HIERARCHICAL_ORDER.indexOf(b.name.toLowerCase());
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;
        return a.name.localeCompare(b.name);
      });
      files.sort((a, b) => a.name.localeCompare(b.name));
      return [...folders, ...files];
    }

    function togglePlanSortMode() {
      const next = planSortMode.value === 'alphabetical' ? 'hierarchical' : 'alphabetical';
      settingsStore.saveTreeSortMode(next);
    }

    const planTreeData = ref(null);
    const planExpandedFolders = ref(new Set());
    const planActivePath = ref(null);
    const planContextMenu = ref(null);
    const planNewFolderParent = ref(null);
    const planNewFolderName = ref('');
    const planDropTarget = ref(null);
    let planDragFilePath = null;
    let planWatcherCleanup = null;

    function flattenPlanTree(nodes, depth) {
      const result = [];
      for (const node of nodes) {
        result.push({ name: node.name, path: node.path, type: node.type, depth });
        if (node.type === 'folder' && node.children && planExpandedFolders.value.has(node.path)) {
          result.push(...flattenPlanTree(node.children, depth + 1));
        }
      }
      return result;
    }

    const planFlatNodes = computed(() => {
      if (!planTreeData.value || !planTreeData.value.children) return [];
      let children = planTreeData.value.children;
      if (planSortMode.value === 'hierarchical') {
        children = sortTopLevelFolders(children);
      }
      return flattenPlanTree(children, 0);
    });

    const loadFileTree = async () => {
      try {
        if (window.electron?.ipcRenderer?.invoke) {
          const data = await window.electron.ipcRenderer.invoke('filetree:scan');
          planTreeData.value = data;
        }
      } catch (e) {
        console.error('[BoardList] Failed to load file tree:', e);
      }
    };

    const togglePlanFolder = (path) => {
      if (path === 'ScratchPad') {
        emit('change-view', 'plan-scratchpad');
        return;
      }
      const s = new Set(planExpandedFolders.value);
      if (s.has(path)) s.delete(path); else s.add(path);
      planExpandedFolders.value = s;
    };

    const navigatePlanFile = (node) => {
      planActivePath.value = node.path;
      window.__planFilePreviewPath = node.path;

      // Route to specialized views based on file type/location
      if (node.path.startsWith('Class Diagrams/') && node.path.endsWith('.mmd')) {
        emit('change-view', 'plan-class-diagram-editor');
      } else if (node.path.endsWith('.mmd')) {
        emit('change-view', 'plan-use-case-diagram-editor');
      } else if (node.path === 'Structure/ProjectStructure.md') {
        emit('change-view', 'plan-structure');
      } else if (node.path === 'Functional Requirements/FunctionalRequirements.md') {
        emit('change-view', 'plan-functional-requirements');
      } else if (node.path === 'Non-Functional Requirements/NonFunctionalRequirements.md') {
        emit('change-view', 'plan-non-functional-requirements');
      } else if (node.path.startsWith('Use Cases/') && node.path.endsWith('.md')) {
        emit('change-view', 'plan-use-case-editor');
      } else if (node.path.endsWith('.ddl')) {
        emit('change-view', 'plan-er-diagram');
      } else {
        emit('change-view', 'plan-file-preview');
      }
    };

    // Context menu
    const onPlanFolderContext = (e, node) => {
      planContextMenu.value = { x: e.clientX, y: e.clientY, node };
    };
    const closePlanContextMenu = () => { planContextMenu.value = null; };
    const planCtxAddSubfolder = () => {
      planNewFolderParent.value = planContextMenu.value.node.path;
      planNewFolderName.value = '';
      closePlanContextMenu();
    };
    const planCtxDeleteFolder = async () => {
      const node = planContextMenu.value.node;
      closePlanContextMenu();
      if (node.depth === 0) return;
      try {
        await window.electron.ipcRenderer.invoke('filetree:deleteFolder', node.path);
        loadFileTree();
      } catch (e) { console.error('Failed to delete folder:', e); }
    };
    const createPlanSubfolder = async () => {
      if (!planNewFolderParent.value || !planNewFolderName.value.trim()) {
        planNewFolderParent.value = null;
        return;
      }
      const safeName = planNewFolderName.value.trim().replace(/[<>:"/\\|?*]/g, '_');
      try {
        await window.electron.ipcRenderer.invoke('filetree:createFolder', planNewFolderParent.value + '/' + safeName);
        planExpandedFolders.value = new Set([...planExpandedFolders.value, planNewFolderParent.value]);
        loadFileTree();
      } catch (e) { console.error('Failed to create folder:', e); }
      planNewFolderParent.value = null;
    };

    // Drag and drop
    const onPlanDragStart = (e, node) => {
      planDragFilePath = node.path;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', node.path);
    };
    const onPlanDragOver = (e, node) => {
      if (!planDragFilePath) return;
      const fileDir = planDragFilePath.substring(0, planDragFilePath.lastIndexOf('/'));
      if (node.path === fileDir) return;
      planDropTarget.value = node.path;
      e.dataTransfer.dropEffect = 'move';
    };
    const onPlanDrop = async (e, node) => {
      planDropTarget.value = null;
      if (!planDragFilePath) return;
      const fileName = planDragFilePath.substring(planDragFilePath.lastIndexOf('/') + 1);
      const newPath = node.path + '/' + fileName;
      if (newPath === planDragFilePath) return;
      try {
        await window.electron.ipcRenderer.invoke('filetree:renameFile', planDragFilePath, newPath);
        loadFileTree();
      } catch (err) { console.error('Failed to move file:', err); }
      planDragFilePath = null;
    };

    function onTextMenuClick(item) {
      if (item.filePath) {
        window.__planFilePreviewPath = item.filePath;
      }
      emit('change-view', item.view);
    }

    // File context menu
    const planFileContextMenu = ref(null);
    const showFileDeleteConfirm = ref(false);
    const fileToDelete = ref(null);

    function onPlanFileContext(e, node) {
      closePlanContextMenu();
      planFileContextMenu.value = { x: e.clientX, y: e.clientY, node };
    }

    function closePlanFileContextMenu() {
      planFileContextMenu.value = null;
    }

    function planCtxDeleteFile() {
      fileToDelete.value = planFileContextMenu.value.node;
      closePlanFileContextMenu();
      showFileDeleteConfirm.value = true;
    }

    async function confirmDeleteFile() {
      if (!fileToDelete.value) return;
      try {
        await window.electron.ipcRenderer.invoke('filetree:deleteFile', fileToDelete.value.path);
        loadFileTree();
      } catch (e) {
        console.error('Failed to delete file:', e);
      }
      showFileDeleteConfirm.value = false;
      fileToDelete.value = null;
    }

    const onDocClickPlan = () => { closePlanContextMenu(); closePlanFileContextMenu(); };
    
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

    // Load build version for About modal
    try {
      if (window.electron?.ipcRenderer?.invoke) {
        window.electron.ipcRenderer.invoke('app:getBuildInfo').then(info => {
          if (info) aboutBuildVersion.value = `${info.version} (${info.hash})`;
        });
      }
    } catch (_) { /* ignore */ }

    // Load plan file tree
    loadFileTree();
    if (window.electron?.ipcRenderer?.on) {
      planWatcherCleanup = window.electron.ipcRenderer.on('watcher:fileChanged', () => loadFileTree());
    }
    document.addEventListener('click', onDocClickPlan);

    // Cleanup listener on unmount
    return () => window.removeEventListener('focus', handleFocus);
  });

  onBeforeUnmount(() => {
    if (planWatcherCleanup) planWatcherCleanup();
    document.removeEventListener('click', onDocClickPlan);
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
      switchMode,
      buildNavIconItems,
      buildNavGroups,
      showAboutModal,
      aboutBuildVersion,
      aboutLibraries,
      planNavItems,
      planNavIconItems,
      planNavGroups,
      planSortMode,
      togglePlanSortMode,
      planFlatNodes,
      planExpandedFolders,
      planActivePath,
      planContextMenu,
      planNewFolderParent,
      planNewFolderName,
      planDropTarget,
      loadFileTree,
      togglePlanFolder,
      navigatePlanFile,
      onPlanFolderContext,
      planCtxAddSubfolder,
      planCtxDeleteFolder,
      createPlanSubfolder,
      onPlanDragStart,
      onPlanDragOver,
      onPlanDrop,
      onTextMenuClick,
      planFileContextMenu,
      onPlanFileContext,
      planCtxDeleteFile,
      showFileDeleteConfirm,
      fileToDelete,
      confirmDeleteFile
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
  padding: 0.25rem 0;
  display: flex;
  flex-direction: column;
}

.board-item {
  display: flex;
  align-items: center;
  padding: 0.35rem 1rem;
  margin: 0;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
  border-left: 3px solid transparent;
  border-radius: 0;
  font-size: 0.85rem;
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
  margin: 0.3rem 1rem;
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

/* Bottom section (Settings, Help, About, Auto — always visible) */
.board-list-bottom {
  flex-shrink: 0;
  margin-top: auto;
  padding-bottom: 0.15rem;
}

.board-list-bottom .divider {
  margin: 0.25rem 1rem;
}

.board-list-bottom .board-item {
  padding: 0.3rem 1rem;
}

.board-list-bottom .auto-toggle-item {
  padding: 0.3rem 1rem;
}

/* Auto toggle */
.auto-toggle-spacer {
  flex: 1;
}

.auto-toggle-wrap {
  padding-bottom: 0.15rem;
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

/* ══════════════════════════════════════════════
   Plan mode: nav icons + file tree
   ══════════════════════════════════════════════ */
.plan-mode-content {
  padding: 0;
}

.plan-nav-icons {
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 0.4rem 0.5rem;
  flex-wrap: wrap;
  flex-shrink: 0;
}

/* Text menu below icons */
.plan-text-menu {
  padding: 0.35rem 0.5rem 0.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.plan-text-group {
  margin-bottom: 0.35rem;
}

.plan-text-group:last-child {
  margin-bottom: 0;
}

.plan-text-group-label {
  font-size: 0.6rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.25);
  margin-bottom: 0.1rem;
}

.plan-text-link {
  display: block;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.45);
  cursor: pointer;
  transition: color 0.12s;
  text-decoration: none;
  padding: 0.1rem 0 0.1rem 0.75rem;
  font-weight: 300;
}

.plan-text-link:hover {
  color: rgba(255, 255, 255, 0.8);
}

.plan-text-link.is-active {
  color: #6dd4a0;
  font-weight: 400;
}

.plan-nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  transition: all 0.15s;
  font-size: 1.05rem;
}

.plan-nav-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
}

.plan-nav-btn.is-active {
  background: rgba(109, 212, 160, 0.12);
  color: #6dd4a0;
}

.plan-tree-label {
  padding: 0.35rem 0.5rem 0.1rem;
}

/* File tree */
.plan-file-tree {
  flex: 1;
  overflow-y: auto;
  padding: 0.25rem 0;
}

.plan-file-tree::-webkit-scrollbar {
  width: 4px;
}

.plan-file-tree::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.plan-tree-node {
  display: flex;
  align-items: center;
  min-height: 26px;
  gap: 2px;
  margin: 1px 4px 1px 0;
  cursor: pointer;
  transition: background-color 0.1s;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
  border-radius: 3px;
}

.plan-tree-node:hover {
  background: rgba(255, 255, 255, 0.04);
}

.plan-tree-node.is-active {
  background: rgba(109, 212, 160, 0.1);
}

.plan-tree-node.is-active .plan-node-title {
  color: #6dd4a0;
  font-weight: 500;
}

.plan-tree-node.drop-target {
  background: rgba(109, 212, 160, 0.12);
  outline: 1px dashed #6dd4a0;
  outline-offset: -1px;
}

.plan-expand-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
}

.plan-expand-btn:hover {
  color: rgba(255, 255, 255, 0.7);
}

.plan-expand-btn .mdi {
  font-size: 0.9rem;
}

.plan-expand-spacer {
  width: 16px;
  flex-shrink: 0;
}

.plan-node-icon {
  font-size: 0.85rem;
  flex-shrink: 0;
}

.plan-folder-icon {
  color: #E8EDF3;
}

.plan-file-icon {
  color: #5b9bd5;
}

.plan-node-title {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 300;
}

/* Draggable */
.plan-tree-node[draggable="true"] {
  cursor: grab;
}

.plan-tree-node[draggable="true"]:active {
  cursor: grabbing;
  opacity: 0.6;
}

/* Context menu */
.plan-context-menu {
  position: fixed;
  background: #1e2535;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  z-index: 200;
  padding: 0.25rem 0;
  min-width: 160px;
}

.plan-ctx-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.8rem;
  padding: 0.4rem 0.75rem;
  cursor: pointer;
  text-align: left;
}

.plan-ctx-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.plan-ctx-item .mdi {
  font-size: 0.95rem;
}

.plan-ctx-delete:hover {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.plan-new-folder-bar {
  padding: 0.35rem 0.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.plan-new-folder-input {
  width: 100%;
  padding: 0.3rem 0.5rem;
  border: 1px solid #6dd4a0;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.85);
  font-size: 0.8rem;
  outline: none;
}

/* File delete confirmation */
.plan-delete-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.plan-delete-dialog {
  background: #1e2535;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 2rem;
  width: 380px;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.plan-delete-icon {
  margin-bottom: 0.75rem;
}

.plan-delete-icon .mdi {
  font-size: 2.5rem;
  color: #e06060;
}

.plan-delete-dialog h3 {
  margin: 0 0 0.6rem;
  font-size: 1.1rem;
  color: rgba(255, 255, 255, 0.9);
}

.plan-delete-dialog p {
  margin: 0 0 1.5rem;
  font-size: 0.88rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.5);
}

.plan-delete-dialog strong {
  color: rgba(255, 255, 255, 0.8);
}

.plan-delete-actions {
  display: flex;
  justify-content: center;
  gap: 0.75rem;
}

.prd-btn-secondary {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
  border: none;
  border-radius: 6px;
  padding: 0.5rem 1.1rem;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
}

.prd-btn-secondary:hover {
  background: rgba(255, 255, 255, 0.12);
}

.prd-btn-danger {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: #e06060;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.5rem 1.1rem;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
}

.prd-btn-danger:hover {
  background: #c94040;
}

/* ══════════════════════════════════════════════
   About Modal
   ══════════════════════════════════════════════ */
.about-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.about-modal {
  background: #1e2535;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  width: 420px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  position: relative;
}

.about-modal-close {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.35);
  cursor: pointer;
  font-size: 1.2rem;
  padding: 0.25rem;
  border-radius: 4px;
  display: flex;
  transition: all 0.15s;
}

.about-modal-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
}

.about-modal-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem 2rem 1.25rem;
  text-align: center;
}

.about-modal-logo {
  width: 56px;
  height: 56px;
  margin-bottom: 0.75rem;
}

.about-modal-name {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.about-modal-tagline {
  margin: 0.2rem 0 0;
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.45);
  font-weight: 300;
}

.about-modal-version {
  margin: 0.6rem 0 0;
  font-size: 0.72rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.04);
  padding: 0.2rem 0.6rem;
  border-radius: 10px;
}

.about-modal-body {
  padding: 0 1.5rem 1.5rem;
}

.about-modal-copyright {
  margin: 0 0 1.25rem;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
}

.about-modal-section h3 {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.35);
  margin: 0 0 0.5rem;
}

.about-modal-oss-list {
  display: flex;
  flex-direction: column;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.about-modal-oss-item {
  display: flex;
  justify-content: space-between;
  padding: 0.4rem 0.65rem;
  font-size: 0.75rem;
  background: rgba(255, 255, 255, 0.02);
}

.about-modal-oss-item:nth-child(even) {
  background: rgba(255, 255, 255, 0.04);
}

.about-modal-oss-name {
  color: rgba(255, 255, 255, 0.6);
}

.about-modal-oss-license {
  color: rgba(255, 255, 255, 0.25);
  font-weight: 300;
}

.about-modal::-webkit-scrollbar {
  width: 4px;
}

.about-modal::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}
</style>
