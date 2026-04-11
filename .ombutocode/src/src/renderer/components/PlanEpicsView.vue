<template>
  <div class="epics-view">
    <!-- List view -->
    <div class="epics-list-view" v-if="!sessionActive">
      <div class="epics-header">
        <div>
          <h1>Epics</h1>
          <p class="epics-subtitle">Break down your PRD into deliverable milestones</p>
        </div>
      </div>

      <!-- Create initial epics card -->
      <div class="epics-create-card">
        <span class="mdi mdi-flag-outline epics-create-icon"></span>
        <div class="epics-create-info">
          <h3>{{ epics.length ? 'Create more Epics' : 'Create Initial Epics' }}</h3>
          <p>
            Launch an AI session to analyse your PRD and break it down into epics —
            each representing a deliverable milestone with clear scope and acceptance criteria.
          </p>

          <div class="epics-context-field">
            <label class="epics-context-label">PRD Document</label>
            <select class="epics-context-select" v-model="selectedPrd">
              <option value="">-- None --</option>
              <option v-for="f in prdFiles" :key="f.path" :value="f.path">{{ f.name }}</option>
            </select>
          </div>

          <div class="epics-context-field">
            <label class="epics-context-label">Architecture Document</label>
            <select class="epics-context-select" v-model="selectedArch">
              <option value="">-- None --</option>
              <option v-for="f in archFiles" :key="f.path" :value="f.path">{{ f.name }}</option>
            </select>
          </div>

          <div class="epics-context-field">
            <label class="epics-context-label">Data Model</label>
            <select class="epics-context-select" v-model="selectedDataModel">
              <option value="">-- None --</option>
              <option v-for="f in dataModelFiles" :key="f.path" :value="f.path">{{ f.name }}</option>
            </select>
          </div>

          <p class="epics-agent-info" v-if="defaultAgent">
            Using <strong>{{ defaultAgent }}</strong> as the coding agent.
          </p>
          <p class="epics-agent-warning" v-else>
            <span class="mdi mdi-alert-outline"></span>
            No default agent configured. Go to Settings &gt; Coding Agents to set one up.
          </p>
        </div>
        <button class="epics-btn epics-btn-primary" :disabled="!defaultAgent || !selectedPrd" @click="startSession">
          <span class="mdi mdi-robot-outline"></span> {{ epics.length ? 'Create Epics' : 'Create Initial Epics' }}
        </button>
      </div>

      <!-- Manual epic create (top of page) -->
      <div class="epics-manual-create">
        <div v-if="showNewInput" class="epics-new-input-wrap">
          <input
            ref="newNameInput"
            v-model="newName"
            class="epics-new-input"
            placeholder="Epic name (e.g. User Authentication)"
            @keyup.enter="createManualEpic"
            @keyup.escape="showNewInput = false"
          />
          <button class="epics-btn epics-btn-primary epics-btn-sm" @click="createManualEpic" :disabled="!newName.trim()">Create</button>
          <button class="epics-btn epics-btn-secondary epics-btn-sm" @click="showNewInput = false">Cancel</button>
        </div>
        <button v-else class="epics-btn epics-btn-secondary" @click="onNewEpic">
          <span class="mdi mdi-plus"></span> New Epic (manual)
        </button>
      </div>

      <!-- Epics table -->
      <div v-if="epics.length" class="epics-table-section">
        <h2>Existing Epics</h2>
        <table class="epics-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>File</th>
              <th class="col-actions"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="epic in epics" :key="epic.path" @click="openEpic(epic)" class="epics-row">
              <td class="col-name">{{ epic.displayName }}</td>
              <td class="col-status"><span class="epic-status-badge" :class="'status-' + (epic.status || 'draft').toLowerCase()">{{ epic.status || 'draft' }}</span></td>
              <td class="col-path">{{ epic.path }}</td>
              <td class="col-actions">
                <button class="epics-delete-btn" @click.stop="deleteEpic(epic)" title="Delete epic">
                  <span class="mdi mdi-delete-outline"></span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- AI Session -->
    <div class="epics-session-wrap" v-if="sessionActive">
      <div class="epics-session-header">
        <span class="mdi mdi-robot-outline"></span>
        <span>AI-Guided Epic Creation</span>
        <span class="epics-agent-badge">{{ defaultAgent }}</span>
        <div class="epics-spacer"></div>
        <button class="epics-btn epics-btn-sm epics-btn-secondary" @click="stopSession">
          <span class="mdi mdi-stop"></span> End Session
        </button>
      </div>
      <div class="epics-split-pane">
        <div class="epics-context-panel" :style="{ width: panelWidth + 'px' }">
          <div class="epics-panel-header">
            <label class="epics-panel-label">Context &amp; Prompt</label>
          </div>
          <div class="epics-panel-body">
            <div class="epics-ctx-item" v-if="selectedPrd">
              <span class="mdi mdi-file-document-outline epics-ctx-icon"></span>
              <span>{{ selectedPrd }}</span>
            </div>
            <div class="epics-ctx-item" v-if="selectedArch">
              <span class="mdi mdi-layers-outline epics-ctx-icon"></span>
              <span>{{ selectedArch }}</span>
            </div>
            <div class="epics-ctx-item" v-if="selectedDataModel">
              <span class="mdi mdi-database-outline epics-ctx-icon"></span>
              <span>{{ selectedDataModel }}</span>
            </div>
            <div class="epics-prompt-section">
              <div class="epics-panel-label" style="margin-top: 0.75rem;">System Prompt</div>
              <p class="epics-prompt-text">{{ sessionPrompt }}</p>
            </div>
          </div>
        </div>
        <div class="epics-resize-handle" @mousedown="startResize"></div>
        <div class="epics-terminal-panel">
          <div ref="terminalContainer" class="epics-terminal"></div>
        </div>
      </div>
    </div>
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

const EPIC_TEMPLATE = `---
status: draft
---

# {NAME}

## Overview

_Describe what this epic delivers and why it matters._

## Scope

### In Scope
-

### Out of Scope
-

## Acceptance Criteria
- [ ]
- [ ]

## Dependencies
-

## Notes
-
`;

export default {
  name: 'PlanEpicsView',
  emits: ['change-view'],
  setup(props, { emit }) {
    const sessionActive = ref(false);
    const terminalContainer = ref(null);
    const defaultAgent = ref('');
    const currentShellId = ref('');
    const sessionPrompt = ref('');
    const panelWidth = ref(300);

    const epics = ref([]);
    const prdFiles = ref([]);
    const archFiles = ref([]);
    const dataModelFiles = ref([]);
    const selectedPrd = ref('');
    const selectedArch = ref('');
    const selectedDataModel = ref('');

    const showNewInput = ref(false);
    const newName = ref('');
    const newNameInput = ref(null);

    async function loadEpics() {
      try {
        const tree = await window.electron.ipcRenderer.invoke('filetree:scan');
        if (tree && tree.children) {
          const folder = tree.children.find(c => c.name === 'Epics');
          if (folder && folder.children) {
            const files = folder.children.filter(f => f.type === 'file' && f.name.endsWith('.md'));
            const loaded = [];
            for (const f of files) {
              let status = 'draft';
              try {
                const content = await window.electron.ipcRenderer.invoke('filetree:readFile', f.path);
                // Check frontmatter
                const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
                if (fmMatch) {
                  const statusMatch = fmMatch[1].match(/^status:\s*(.+)/m);
                  if (statusMatch) status = statusMatch[1].trim();
                }
                // Also check "Status:" line outside frontmatter
                if (status === 'draft') {
                  const statusLine = content.match(/^Status:\s*(.+)/m);
                  if (statusLine) status = statusLine[1].trim();
                }
              } catch (_) {}
              loaded.push({
                name: f.name,
                path: f.path,
                displayName: f.name.replace('.md', '').replace(/_/g, ' '),
                status,
              });
            }
            epics.value = loaded;
          } else {
            epics.value = [];
          }
        }
      } catch (_) {}
    }

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

          const dmFolder = tree.children.find(c => c.name === 'Data Model');
          if (dmFolder && dmFolder.children) {
            dataModelFiles.value = dmFolder.children.filter(f => f.type === 'file');
            if (dataModelFiles.value.length === 1) selectedDataModel.value = dataModelFiles.value[0].path;
          }
        }
      } catch (_) {}
    }

    async function loadDefaultAgent() {
      try {
        const results = await window.electron.ipcRenderer.invoke('agent:getStartupResults');
        const settings = await window.electron.ipcRenderer.invoke('settings:read');
        const preferred = settings?.eval_default_agent;
        if (preferred && results?.[preferred]?.status === 'pass') {
          defaultAgent.value = preferred;
        } else {
          for (const id of ['claude', 'codex', 'kimi']) {
            if (results?.[id]?.status === 'pass') { defaultAgent.value = id; break; }
          }
        }
      } catch (_) {}
    }

    function openEpic(epic) {
      if (window.__planNavigate) {
        window.__planNavigate('plan-file-preview', epic.path);
      }
    }

    async function deleteEpic(epic) {
      if (!confirm(`Delete "${epic.displayName}"?`)) return;
      try {
        await window.electron.ipcRenderer.invoke('filetree:deleteFile', epic.path);
        epics.value = epics.value.filter(e => e.path !== epic.path);
      } catch (e) {
        console.error('Failed to delete epic:', e);
      }
    }

    async function onNewEpic() {
      showNewInput.value = true;
      newName.value = '';
      await nextTick();
      if (newNameInput.value) newNameInput.value.focus();
    }

    async function createManualEpic() {
      const name = newName.value.trim();
      if (!name) return;
      const safeName = name.replace(/[<>:"/\\|?*]/g, '_');
      const filePath = 'Epics/' + safeName + '.md';
      const content = EPIC_TEMPLATE.replace('{NAME}', name);
      try {
        await window.electron.ipcRenderer.invoke('filetree:writeFile', filePath, content);
        showNewInput.value = false;
        newName.value = '';
        if (window.__planNavigate) {
          window.__planNavigate('plan-file-preview', filePath);
        }
        loadEpics();
      } catch (e) {
        console.error('Failed to create epic:', e);
      }
    }

    async function startSession() {
      if (!defaultAgent.value || !selectedPrd.value) return;
      sessionActive.value = true;

      await nextTick();

      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      await import('@xterm/xterm/css/xterm.css');

      const term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
        theme: { background: '#0A1220', foreground: '#E8EDF3', cursor: '#4ADE80', selectionBackground: '#1F3A2E' },
      });

      fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalContainer.value);
      fitAddon.fit();
      termInstance = term;

      const shellId = 'epics-agent-' + (++sessionCounter);
      currentShellId.value = shellId;

      const contextParts = [`Read the PRD at "docs/${selectedPrd.value}"`];
      if (selectedArch.value) contextParts.push(`the Architecture document at "docs/${selectedArch.value}"`);
      if (selectedDataModel.value) contextParts.push(`the Data Model at "docs/${selectedDataModel.value}"`);

      const prompt = `${contextParts.join(', and ')}. Also read the engineering guide at ".ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md" to understand the project conventions and ticket workflow.

Break the requirements down into epics. Each epic represents a deliverable milestone that can be independently developed and verified. For each epic:

1. Create a separate Markdown file in "docs/Epics/" with the naming convention "epic_EPIC_NAME.md"
2. Each epic file must contain:
   - A title (# Epic: Name)
   - Status: NEW
   - Overview — what this epic delivers and why
   - Scope — what is in scope and out of scope
   - Functional Requirements — specific requirements this epic addresses
   - Acceptance Criteria — a checklist of verifiable criteria
   - Dependencies — other epics or external dependencies
   - Tickets — a list of implementation tickets (to be created later)

3. Epics should be sized so that each can be broken into 3-8 development tickets
4. Follow the conventions in the engineering guide for naming and structure
5. Epic statuses follow: NEW → TICKETS → BUILDING → DONE

Start by proposing the list of epics with a one-line summary for each. Ask me to confirm before creating the files.`;

      sessionPrompt.value = prompt;

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
      loadEpics();
    }

    function cleanup() {
      if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
      if (shellCleanup) { shellCleanup(); shellCleanup = null; }
      if (exitCleanup) { exitCleanup(); exitCleanup = null; }
      if (termInstance) { termInstance.dispose(); termInstance = null; }
      fitAddon = null;
    }

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
      loadEpics();
      loadContextFiles();
      loadDefaultAgent();
    });

    onBeforeUnmount(() => {
      if (currentShellId.value) window.electron.ipcRenderer.invoke('workspace:killShell', currentShellId.value);
      cleanup();
    });

    return {
      sessionActive, terminalContainer, defaultAgent, sessionPrompt, panelWidth,
      epics, prdFiles, archFiles, dataModelFiles, selectedPrd, selectedArch, selectedDataModel,
      showNewInput, newName, newNameInput,
      openEpic, deleteEpic, onNewEpic, createManualEpic,
      startSession, stopSession, startResize,
    };
  }
};
</script>

<style scoped>
.epics-view {
  flex: 1; display: flex; flex-direction: column; overflow: hidden;
  background: var(--bg-color, #161a1f); color: var(--text-color, #d4d8dd);
}

.epics-list-view { padding: 2rem; overflow-y: auto; flex: 1; }
.epics-header { margin-bottom: 1.5rem; }
.epics-header h1 { margin: 0 0 0.25rem; font-size: 1.5rem; font-weight: 600; }
.epics-subtitle { margin: 0; color: var(--text-muted, #8b929a); font-size: 0.9rem; }

/* Create card */
.epics-create-card {
  display: flex; align-items: flex-start; gap: 1.25rem; padding: 1.5rem;
  border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); max-width: 700px; margin-bottom: 1.5rem;
}
.epics-create-icon { font-size: 2rem; color: #6dd4a0; flex-shrink: 0; margin-top: 0.15rem; }
.epics-create-info { flex: 1; }
.epics-create-info h3 { margin: 0 0 0.5rem; font-size: 1.05rem; }
.epics-create-info p { margin: 0; font-size: 0.88rem; line-height: 1.6; color: rgba(255,255,255,0.5); font-weight: 300; }
.epics-agent-info { margin-top: 0.5rem !important; font-size: 0.82rem !important; color: rgba(255,255,255,0.4) !important; }
.epics-agent-warning { margin-top: 0.5rem !important; font-size: 0.82rem !important; color: #e5a830 !important; display: flex; align-items: center; gap: 0.3rem; }

.epics-context-field { display: flex; flex-direction: column; gap: 0.2rem; margin: 0.75rem 0 0; }
.epics-context-label { font-size: 0.72rem; font-weight: 600; color: rgba(255,255,255,0.4); }
.epics-context-select {
  padding: 0.4rem 0.5rem; border: 1px solid rgba(255,255,255,0.1); border-radius: 5px;
  background: #0A1220; color: var(--text-color, #d4d8dd); font-size: 0.82rem; cursor: pointer; outline: none; max-width: 350px;
}
.epics-context-select:focus { border-color: #6dd4a0; }

/* Buttons */
.epics-btn {
  display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.55rem 1.1rem; border: none;
  border-radius: 6px; font-size: 0.85rem; font-weight: 500; cursor: pointer; transition: all 0.15s; white-space: nowrap; flex-shrink: 0;
}
.epics-btn-primary { background: #6dd4a0; color: #0A1220; }
.epics-btn-primary:hover:not(:disabled) { background: #86efac; }
.epics-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.epics-btn-secondary { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); }
.epics-btn-secondary:hover { background: rgba(255,255,255,0.12); }
.epics-btn-sm { padding: 0.35rem 0.75rem; font-size: 0.8rem; }

/* Table */
.epics-table-section { margin-bottom: 1.5rem; max-width: 700px; }
.epics-table-section h2 { font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: rgba(255,255,255,0.3); margin: 0 0 0.5rem; }
.epics-table { width: 100%; border-collapse: collapse; }
.epics-table th {
  text-align: left; padding: 0.5rem 0.75rem; font-size: 0.7rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.04em; color: rgba(255,255,255,0.35);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.epics-table td { padding: 0.55rem 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.04); }
.epics-row { cursor: pointer; transition: background 0.1s; }
.epics-row:hover { background: rgba(255,255,255,0.04); }
.col-name { font-size: 0.88rem; color: rgba(255,255,255,0.75); font-weight: 400; }
.col-path { font-size: 0.72rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: rgba(255,255,255,0.3); }
.col-status { width: 100px; }
.epic-status-badge {
  display: inline-block; padding: 0.15rem 0.5rem; border-radius: 10px;
  font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em;
}
.status-new { background: rgba(91,155,213,0.15); color: #7bb8e8; }
.status-draft { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.4); }
.status-tickets { background: rgba(229,168,48,0.15); color: #e5a830; }
.status-building { background: rgba(109,212,160,0.15); color: #6dd4a0; }
.status-done { background: rgba(109,212,160,0.25); color: #3cc77a; }
.col-actions { width: 40px; text-align: right; }
.epics-delete-btn {
  background: transparent; border: none; color: rgba(255,255,255,0.15); cursor: pointer;
  padding: 0.2rem; border-radius: 4px; opacity: 0; transition: all 0.15s;
}
.epics-row:hover .epics-delete-btn { opacity: 1; }
.epics-delete-btn:hover { color: #e06060; background: rgba(224,96,96,0.1); }

/* Manual create */
.epics-manual-create { max-width: 700px; margin-bottom: 1.5rem; }
.epics-new-input-wrap { display: flex; align-items: center; gap: 0.5rem; }
.epics-new-input {
  padding: 0.45rem 0.7rem; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px;
  background: rgba(255,255,255,0.04); color: var(--text-color, #d4d8dd); font-size: 0.88rem; width: 300px; outline: none;
}
.epics-new-input:focus { border-color: #6dd4a0; }

/* Session */
.epics-session-wrap { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.epics-session-header {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem;
  background: #0d1720; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 0.82rem; color: rgba(255,255,255,0.7); flex-shrink: 0;
}
.epics-agent-badge { background: rgba(109,212,160,0.12); color: #6dd4a0; padding: 0.15rem 0.5rem; border-radius: 10px; font-size: 0.72rem; font-weight: 600; }
.epics-spacer { flex: 1; }
.epics-split-pane { flex: 1; display: flex; overflow: hidden; }

.epics-context-panel { display: flex; flex-direction: column; overflow: hidden; background: #0d1720; border-right: 1px solid rgba(255,255,255,0.06); flex-shrink: 0; }
.epics-panel-header { padding: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.06); flex-shrink: 0; }
.epics-panel-label { font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6dd4a0; }
.epics-panel-body { flex: 1; overflow-y: auto; padding: 1rem; }
.epics-ctx-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: rgba(255,255,255,0.55); margin-bottom: 0.3rem; }
.epics-ctx-icon { font-size: 1rem; color: #6dd4a0; }
.epics-prompt-text { font-size: 0.78rem; line-height: 1.55; color: rgba(255,255,255,0.4); font-weight: 300; margin: 0.3rem 0 0; }

.epics-resize-handle { width: 6px; cursor: col-resize; background: transparent; flex-shrink: 0; position: relative; }
.epics-resize-handle::after { content: ''; position: absolute; top: 0; bottom: 0; left: 2px; width: 2px; background: rgba(255,255,255,0.06); transition: background 0.15s; }
.epics-resize-handle:hover::after { background: #6dd4a0; }

.epics-terminal-panel { flex: 1; display: flex; min-width: 0; }
.epics-terminal { flex: 1; background: #0A1220; position: relative; }
.epics-terminal :deep(.xterm) { position: absolute; top: 0; left: 0; right: 0; bottom: 0; padding: 0.5rem; }
.epics-terminal :deep(.xterm-screen) { height: 100% !important; }
.epics-terminal :deep(.xterm-viewport) { overflow-y: auto !important; }
</style>
