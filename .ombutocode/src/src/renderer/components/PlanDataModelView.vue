<template>
  <div class="plan-prd-view">
    <div class="prd-header" v-if="!sessionActive">
      <h1>Data Model</h1>
      <p class="prd-subtitle">Generate a PostgreSQL DDL schema from your requirements and architecture</p>

      <div class="prd-create">
        <div class="prd-create-card">
          <span class="mdi mdi-database-outline prd-create-icon"></span>
          <div>
            <h3>Create a new Data Model</h3>
            <p>
              Select your PRD and Architecture documents as context, then launch an AI session
              to generate a DDL schema based on your requirements.
            </p>

            <!-- Context file selectors -->
            <div class="dm-context-selectors">
              <div class="dm-context-field">
                <label class="dm-context-label">PRD Document</label>
                <select class="dm-context-select" v-model="selectedPrd">
                  <option value="">-- None --</option>
                  <option v-for="f in prdFiles" :key="f.path" :value="f.path">{{ f.name }}</option>
                </select>
              </div>
              <div class="dm-context-field">
                <label class="dm-context-label">Architecture Document</label>
                <select class="dm-context-select" v-model="selectedArch">
                  <option value="">-- None --</option>
                  <option v-for="f in archFiles" :key="f.path" :value="f.path">{{ f.name }}</option>
                </select>
              </div>
            </div>

            <p class="prd-agent-info" v-if="defaultAgent">
              Using <strong>{{ defaultAgent }}</strong> as the coding agent.
            </p>
            <p class="prd-agent-warning" v-else>
              <span class="mdi mdi-alert-outline"></span>
              No default agent configured. Go to Settings > Coding Agents to set one up.
            </p>
          </div>
          <button class="prd-btn prd-btn-primary" :disabled="!defaultAgent" @click="confirmCreate">
            <span class="mdi mdi-robot-outline"></span> Create Data Model
          </button>
        </div>
      </div>

      <div class="prd-existing" v-if="existingDoc">
        <div class="prd-existing-card">
          <span class="mdi mdi-database-check-outline prd-existing-icon"></span>
          <div class="prd-existing-info">
            <strong>Data Model exists</strong>
            <span>{{ existingDoc }}</span>
          </div>
          <button class="prd-btn prd-btn-secondary" @click="viewExisting">
            <span class="mdi mdi-eye-outline"></span> View
          </button>
          <button class="prd-btn prd-btn-primary" @click="startSession('refine')">
            <span class="mdi mdi-pencil-outline"></span> Refine with AI
          </button>
        </div>
      </div>
    </div>

    <div class="prd-session-wrap" v-if="sessionActive">
      <div class="prd-session-header">
        <span class="mdi mdi-robot-outline"></span>
        <span>AI-Guided Data Model {{ sessionMode === 'refine' ? 'Refinement' : 'Creation' }}</span>
        <span class="prd-terminal-agent">{{ defaultAgent }}</span>
        <div class="prd-terminal-spacer"></div>
        <button class="prd-btn prd-btn-sm prd-btn-secondary" @click="stopSession">
          <span class="mdi mdi-stop"></span> End Session
        </button>
      </div>
      <div class="prd-split-pane">
        <!-- Left: context summary -->
        <div class="prd-skill-panel" :style="{ width: panelWidth + 'px' }">
          <div class="prd-skill-selector">
            <label class="prd-skill-label">Context Documents</label>
          </div>
          <div class="prd-skill-preview">
            <div class="dm-context-summary">
              <div class="dm-context-item" v-if="selectedPrd">
                <span class="mdi mdi-file-document-outline dm-ctx-icon"></span>
                <span>{{ selectedPrd }}</span>
              </div>
              <div class="dm-context-item" v-if="selectedArch">
                <span class="mdi mdi-layers-outline dm-ctx-icon"></span>
                <span>{{ selectedArch }}</span>
              </div>
              <div class="dm-context-item" v-if="!selectedPrd && !selectedArch">
                <span class="dm-ctx-none">No context documents selected</span>
              </div>
            </div>
            <div class="dm-prompt-section">
              <div class="prd-skill-label" style="margin-top: 1rem;">System Prompt</div>
              <p class="dm-prompt-text">{{ sessionPrompt }}</p>
            </div>
          </div>
        </div>

        <div class="prd-resize-handle" @mousedown="startResize"></div>

        <div class="prd-terminal-panel">
          <div ref="terminalContainer" class="prd-terminal"></div>
        </div>
      </div>
    </div>

    <!-- Overwrite confirmation -->
    <Teleport to="body">
      <div v-if="showOverwriteConfirm" class="prd-confirm-overlay" @click.self="showOverwriteConfirm = false">
        <div class="prd-confirm-dialog">
          <div class="prd-confirm-icon">
            <span class="mdi mdi-alert-outline"></span>
          </div>
          <h3>Overwrite existing Data Model?</h3>
          <p>A Data Model already exists. Creating a new one will overwrite the current schema. This action cannot be undone.</p>
          <div class="prd-confirm-actions">
            <button class="prd-btn prd-btn-secondary" @click="showOverwriteConfirm = false">Cancel</button>
            <button class="prd-btn prd-btn-danger" @click="onConfirmOverwrite">
              <span class="mdi mdi-file-replace-outline"></span> Overwrite &amp; Create
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';

let termInstance = null;
let fitAddon = null;
let resizeObserver = null;
let shellCleanup = null;
let exitCleanup = null;
let sessionCounter = 0;

export default {
  name: 'PlanDataModelView',
  emits: ['change-view'],
  setup(props, { emit }) {
    const sessionActive = ref(false);
    const terminalContainer = ref(null);
    const defaultAgent = ref('');
    const existingDoc = ref('');
    const currentShellId = ref('');
    const sessionPrompt = ref('');
    const sessionMode = ref('create');
    const showOverwriteConfirm = ref(false);
    const panelWidth = ref(300);

    // Context file selectors
    const prdFiles = ref([]);
    const archFiles = ref([]);
    const selectedPrd = ref('');
    const selectedArch = ref('');

    const DOC_PATH = 'Data Model/Schema.ddl';

    async function loadContextFiles() {
      try {
        const tree = await window.electron.ipcRenderer.invoke('filetree:scan');
        if (tree && tree.children) {
          const prdFolder = tree.children.find(c => c.name === 'Product Requirements Document');
          if (prdFolder && prdFolder.children) {
            prdFiles.value = prdFolder.children.filter(f => f.type === 'file' && f.name.endsWith('.md'));
            if (prdFiles.value.length === 1) selectedPrd.value = prdFiles.value[0].path;
          }

          const archFolder = tree.children.find(c => c.name === 'Architecture');
          if (archFolder && archFolder.children) {
            archFiles.value = archFolder.children.filter(f => f.type === 'file' && f.name.endsWith('.md'));
            if (archFiles.value.length === 1) selectedArch.value = archFiles.value[0].path;
          }
        }
      } catch (_) {}
    }

    async function checkExistingDoc() {
      try {
        const tree = await window.electron.ipcRenderer.invoke('filetree:scan');
        if (tree && tree.children) {
          const folder = tree.children.find(c => c.name === 'Data Model');
          if (folder && folder.children) {
            const ddl = folder.children.find(f => f.type === 'file' && f.name.endsWith('.ddl'));
            if (ddl) { existingDoc.value = ddl.path; return; }
          }
        }
      } catch (_) {}
      existingDoc.value = '';
    }

    async function loadDefaultAgent() {
      try {
        const results = await window.electron.ipcRenderer.invoke('agent:getStartupResults');
        const settings = await window.electron.ipcRenderer.invoke('settings:read');
        const preferred = settings?.eval_default_agent;
        if (preferred && results?.[preferred]?.status === 'pass') {
          defaultAgent.value = preferred;
        } else if (agentCmd === 'codex') {
          for (const id of ['claude', 'codex', 'kimi']) {
            if (results?.[id]?.status === 'pass') { defaultAgent.value = id; break; }
          }
        }
      } catch (_) {}
    }

    function viewExisting() {
      window.__planFilePreviewPath = existingDoc.value;
      emit('change-view', 'plan-er-diagram');
    }

    function confirmCreate() {
      if (existingDoc.value) {
        showOverwriteConfirm.value = true;
      } else if (agentCmd === 'codex') {
        startSession('create');
      }
    }

    function onConfirmOverwrite() {
      showOverwriteConfirm.value = false;
      startSession('create');
    }

    async function startSession(mode = 'create') {
      if (!defaultAgent.value) return;
      sessionActive.value = true;
      sessionMode.value = mode;
      const isRefine = mode === 'refine';

      await nextTick();

      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      await import('@xterm/xterm/css/xterm.css');

      const term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
        theme: {
          background: '#0A1220',
          foreground: '#E8EDF3',
          cursor: '#4ADE80',
          selectionBackground: '#1F3A2E',
        },
      });

      fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalContainer.value);
      fitAddon.fit();
      termInstance = term;

      const shellId = 'dm-agent-' + (++sessionCounter);
      currentShellId.value = shellId;

      // Build context
      const contextParts = [];
      if (selectedPrd.value) contextParts.push(`"docs/${selectedPrd.value}"`);
      if (selectedArch.value) contextParts.push(`"docs/${selectedArch.value}"`);
      const contextNote = contextParts.length > 0
        ? ` First, read these context documents: ${contextParts.join(' and ')}.`
        : '';

      let prompt;
      if (isRefine) {
        prompt = `Read the existing data model at "docs/${DOC_PATH}" and help me refine it.${contextNote} Suggest improvements to the schema — missing tables, better constraints, indexing, normalisation issues. After each suggestion, wait for my feedback before making changes.`;
      } else if (agentCmd === 'codex') {
        prompt = `Create a PostgreSQL DDL data model and save it to "docs/${DOC_PATH}".${contextNote} Based on the requirements and architecture, design a complete database schema with tables, columns, primary keys, foreign keys, indexes, and constraints. Use proper data types and naming conventions. Ask me clarifying questions about the domain before writing the schema.`;
      }
      sessionPrompt.value = prompt;

      // Launch agent
      const agentCmd = defaultAgent.value;
      let args;
      if (agentCmd === 'claude') {
        args = ['--verbose', '--dangerously-skip-permissions', prompt];
      } else if (agentCmd === 'codex') {
        args = [prompt];
      } else {
        args = [];
      }

      await window.electron.ipcRenderer.invoke('agent:spawnInteractive', shellId, agentCmd, args);

      if (agentCmd !== 'claude' && agentCmd !== 'codex') {
        setTimeout(() => {
          window.electron.ipcRenderer.invoke('workspace:writeShell', shellId, prompt + '\n');
        }, 2000);
      }
      setTimeout(() => { if (fitAddon) fitAddon.fit(); }, 300);

      term.onData((data) => {
        window.electron.ipcRenderer.invoke('workspace:writeShell', shellId, data);
      });

      shellCleanup = window.electron.ipcRenderer.on('workspace:shellData', ({ shellId: sid, data }) => {
        if (sid === shellId && termInstance) termInstance.write(data);
      });

      exitCleanup = window.electron.ipcRenderer.on('workspace:shellExit', ({ shellId: sid }) => {
        if (sid === shellId && termInstance) termInstance.write('\r\n\x1b[32m✓ Session ended.\x1b[0m\r\n');
      });

      resizeObserver = new ResizeObserver(() => {
        try {
          if (fitAddon) fitAddon.fit();
          if (termInstance) window.electron.ipcRenderer.invoke('workspace:resizeShell', shellId, termInstance.cols, termInstance.rows);
        } catch {}
      });
      resizeObserver.observe(terminalContainer.value);
    }

    function stopSession() {
      if (currentShellId.value) window.electron.ipcRenderer.invoke('workspace:killShell', currentShellId.value);
      cleanup();
      sessionActive.value = false;
      checkExistingDoc();
    }

    function cleanup() {
      if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
      if (shellCleanup) { shellCleanup(); shellCleanup = null; }
      if (exitCleanup) { exitCleanup(); exitCleanup = null; }
      if (termInstance) { termInstance.dispose(); termInstance = null; }
      fitAddon = null;
    }

    // Resize
    function startResize(e) {
      const startX = e.clientX;
      const startW = panelWidth.value;
      function onMove(ev) { panelWidth.value = Math.max(200, Math.min(500, startW + ev.clientX - startX)); }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (fitAddon) setTimeout(() => fitAddon.fit(), 50);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    onMounted(() => {
      checkExistingDoc();
      loadDefaultAgent();
      loadContextFiles();
    });

    onBeforeUnmount(() => {
      if (currentShellId.value) window.electron.ipcRenderer.invoke('workspace:killShell', currentShellId.value);
      cleanup();
    });

    return {
      sessionActive, terminalContainer, defaultAgent, existingDoc,
      sessionPrompt, sessionMode, showOverwriteConfirm, panelWidth,
      prdFiles, archFiles, selectedPrd, selectedArch,
      confirmCreate, onConfirmOverwrite, viewExisting, startSession, stopSession, startResize,
    };
  }
};
</script>

<style scoped>
/* Reuse PlanPrdView styles — import via the same class names */

.plan-prd-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-color, #161a1f);
  color: var(--text-color, #d4d8dd);
}

.prd-header { padding: 2rem; overflow-y: auto; }
.prd-header h1 { margin: 0 0 0.25rem; font-size: 1.5rem; font-weight: 600; }
.prd-subtitle { margin: 0 0 2rem; color: var(--text-muted, #8b929a); font-size: 0.9rem; }

.prd-create { margin-bottom: 1rem; }
.prd-existing + .prd-create { margin-top: 1rem; }

.prd-create-card, .prd-existing-card {
  display: flex; align-items: flex-start; gap: 1.25rem; padding: 1.5rem;
  border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); max-width: 700px;
}
.prd-create-icon, .prd-existing-icon { font-size: 2rem; color: #6dd4a0; flex-shrink: 0; margin-top: 0.15rem; }
.prd-create-card h3 { margin: 0 0 0.5rem; font-size: 1.05rem; }
.prd-create-card p, .prd-existing-info span { margin: 0; font-size: 0.88rem; line-height: 1.6; color: rgba(255,255,255,0.5); font-weight: 300; }
.prd-existing-card { align-items: center; }
.prd-existing-info { flex: 1; display: flex; flex-direction: column; gap: 0.15rem; }
.prd-existing-info strong { color: var(--text-color, #d4d8dd); font-size: 0.9rem; }
.prd-existing-info span { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.78rem; }
.prd-agent-info { margin-top: 0.5rem !important; font-size: 0.82rem !important; color: rgba(255,255,255,0.4) !important; }
.prd-agent-warning { margin-top: 0.5rem !important; font-size: 0.82rem !important; color: #e5a830 !important; display: flex; align-items: center; gap: 0.3rem; }

/* Context selectors */
.dm-context-selectors { display: flex; flex-direction: column; gap: 0.5rem; margin: 0.75rem 0; }
.dm-context-field { display: flex; flex-direction: column; gap: 0.2rem; }
.dm-context-label { font-size: 0.72rem; font-weight: 600; color: rgba(255,255,255,0.4); }
.dm-context-select {
  padding: 0.4rem 0.5rem; border: 1px solid rgba(255,255,255,0.1); border-radius: 5px;
  background: #0A1220; color: var(--text-color, #d4d8dd); font-size: 0.82rem; cursor: pointer; outline: none;
}
.dm-context-select:focus { border-color: #6dd4a0; }

/* Context summary in session */
.dm-context-summary { display: flex; flex-direction: column; gap: 0.4rem; }
.dm-context-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: rgba(255,255,255,0.55); }
.dm-ctx-icon { font-size: 1rem; color: #6dd4a0; }
.dm-ctx-none { color: rgba(255,255,255,0.25); font-style: italic; font-size: 0.8rem; }
.dm-prompt-section { margin-top: 1rem; }
.dm-prompt-text { font-size: 0.78rem; line-height: 1.55; color: rgba(255,255,255,0.4); font-weight: 300; margin: 0.3rem 0 0; }

/* Buttons */
.prd-btn {
  display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.55rem 1.1rem; border: none;
  border-radius: 6px; font-size: 0.85rem; font-weight: 500; cursor: pointer; transition: all 0.15s; white-space: nowrap; flex-shrink: 0;
}
.prd-btn-primary { background: #6dd4a0; color: #0A1220; }
.prd-btn-primary:hover:not(:disabled) { background: #86efac; }
.prd-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.prd-btn-secondary { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); }
.prd-btn-secondary:hover { background: rgba(255,255,255,0.12); }
.prd-btn-sm { padding: 0.35rem 0.75rem; font-size: 0.78rem; }
.prd-btn-danger { background: #e06060; color: #fff; }
.prd-btn-danger:hover { background: #c94040; }

/* Session layout */
.prd-session-wrap { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.prd-session-header {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem;
  background: #0d1720; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 0.82rem; color: rgba(255,255,255,0.7); flex-shrink: 0;
}
.prd-terminal-agent { background: rgba(109,212,160,0.12); color: #6dd4a0; padding: 0.15rem 0.5rem; border-radius: 10px; font-size: 0.72rem; font-weight: 600; }
.prd-terminal-spacer { flex: 1; }
.prd-split-pane { flex: 1; display: flex; overflow: hidden; }
.prd-skill-panel { display: flex; flex-direction: column; overflow: hidden; background: #0d1720; border-right: 1px solid rgba(255,255,255,0.06); flex-shrink: 0; }
.prd-skill-selector { padding: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.06); flex-shrink: 0; }
.prd-skill-label { display: block; font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6dd4a0; margin-bottom: 0.4rem; }
.prd-skill-preview { flex: 1; overflow-y: auto; padding: 1rem; }
.prd-resize-handle { width: 6px; cursor: col-resize; background: transparent; flex-shrink: 0; position: relative; }
.prd-resize-handle::after { content: ''; position: absolute; top: 0; bottom: 0; left: 2px; width: 2px; background: rgba(255,255,255,0.06); transition: background 0.15s; }
.prd-resize-handle:hover::after { background: #6dd4a0; }
.prd-terminal-panel { flex: 1; display: flex; min-width: 0; }
.prd-terminal { flex: 1; background: #0A1220; position: relative; }
.prd-terminal :deep(.xterm) { position: absolute; top: 0; left: 0; right: 0; bottom: 0; padding: 0.5rem; }
.prd-terminal :deep(.xterm-screen) { height: 100% !important; }
.prd-terminal :deep(.xterm-viewport) { overflow-y: auto !important; }

/* Confirm modal */
.prd-confirm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.prd-confirm-dialog { background: #1e2535; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 2rem; width: 400px; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
.prd-confirm-icon { margin-bottom: 0.75rem; }
.prd-confirm-icon .mdi { font-size: 2.5rem; color: #e5a830; }
.prd-confirm-dialog h3 { margin: 0 0 0.6rem; font-size: 1.1rem; color: rgba(255,255,255,0.9); }
.prd-confirm-dialog p { margin: 0 0 1.5rem; font-size: 0.88rem; line-height: 1.6; color: rgba(255,255,255,0.5); }
.prd-confirm-actions { display: flex; justify-content: center; gap: 0.75rem; }
</style>
