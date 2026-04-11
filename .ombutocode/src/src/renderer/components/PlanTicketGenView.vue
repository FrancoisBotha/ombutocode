<template>
  <div class="tg-view">
    <div class="tg-list-view" v-if="!sessionActive">
      <div class="tg-header">
        <div>
          <h1>Ticket Generation</h1>
          <p class="tg-subtitle">Generate implementation tickets from epics with status NEW</p>
        </div>
      </div>

      <div v-if="loading" class="tg-loading">Loading epics...</div>

      <div v-else-if="newEpics.length === 0" class="tg-empty">
        <span class="mdi mdi-flag-checkered"></span>
        <p>No epics with status NEW</p>
        <p class="tg-empty-hint">Create epics in Plan &gt; Epic Creation first, then return here to generate tickets.</p>
      </div>

      <div v-else>
        <div class="tg-actions">
          <button class="tg-btn tg-btn-secondary" @click="selectAll">
            {{ selectedEpics.size === newEpics.length ? 'Deselect All' : 'Select All' }}
          </button>
          <button class="tg-btn tg-btn-primary" :disabled="!defaultAgent || selectedEpics.size === 0" @click="startSession">
            <span class="mdi mdi-robot-outline"></span> Generate Tickets ({{ selectedEpics.size }})
          </button>
          <span v-if="defaultAgent" class="tg-agent-info">Using <strong>{{ defaultAgent }}</strong></span>
          <span v-else class="tg-agent-warning"><span class="mdi mdi-alert-outline"></span> No agent configured</span>
        </div>

        <div class="tg-table-section">
          <h2>Epics Ready for Ticket Generation</h2>
          <table class="tg-table">
            <thead>
              <tr>
                <th class="col-select"></th>
                <th>Name</th>
                <th>Status</th>
                <th>File</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="epic in newEpics" :key="epic.path" class="tg-row" @click="toggleSelection(epic.path)">
                <td class="col-select">
                  <input type="checkbox" :checked="selectedEpics.has(epic.path)" @click.stop="toggleSelection(epic.path)" />
                </td>
                <td class="col-name">{{ epic.displayName }}</td>
                <td class="col-status"><span class="tg-status-badge status-new">{{ epic.status }}</span></td>
                <td class="col-path">{{ epic.path }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- AI Session -->
    <div class="tg-session-wrap" v-if="sessionActive">
      <div class="tg-session-header">
        <span class="mdi mdi-robot-outline"></span>
        <span>Ticket Generation</span>
        <span class="tg-agent-badge">{{ defaultAgent }}</span>
        <span class="tg-epic-count">{{ selectedEpics.size }} epic{{ selectedEpics.size > 1 ? 's' : '' }}</span>
        <div class="tg-spacer"></div>
        <button class="tg-btn tg-btn-sm tg-btn-secondary" @click="stopSession">
          <span class="mdi mdi-stop"></span> End Session
        </button>
      </div>
      <div class="tg-split-pane">
        <div class="tg-context-panel" :style="{ width: panelWidth + 'px' }">
          <div class="tg-panel-header">
            <label class="tg-panel-label">Selected Epics</label>
          </div>
          <div class="tg-panel-body">
            <div v-for="path in selectedEpics" :key="path" class="tg-ctx-item">
              <span class="mdi mdi-flag-outline tg-ctx-icon"></span>
              <span>{{ path }}</span>
            </div>
            <div class="tg-prompt-section">
              <div class="tg-panel-label" style="margin-top: 0.75rem;">System Prompt</div>
              <p class="tg-prompt-text">{{ sessionPrompt }}</p>
            </div>
          </div>
        </div>
        <div class="tg-resize-handle" @mousedown="startResize"></div>
        <div class="tg-terminal-panel">
          <div ref="terminalContainer" class="tg-terminal"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';

let termInstance = null;
let fitAddon = null;
let resizeObserver = null;
let shellCleanup = null;
let exitCleanup = null;
let sessionCounter = 0;

export default {
  name: 'PlanTicketGenView',
  emits: ['change-view'],
  setup(props, { emit }) {
    const sessionActive = ref(false);
    const terminalContainer = ref(null);
    const defaultAgent = ref('');
    const currentShellId = ref('');
    const sessionPrompt = ref('');
    const panelWidth = ref(300);
    const loading = ref(true);

    const allEpics = ref([]);
    const selectedEpics = ref(new Set());

    const newEpics = computed(() => allEpics.value.filter(e =>
      e.status.toUpperCase() === 'NEW'
    ));

    async function loadEpics() {
      loading.value = true;
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
                const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
                if (fmMatch) {
                  const sm = fmMatch[1].match(/^status:\s*(.+)/m);
                  if (sm) status = sm[1].trim();
                }
                if (status === 'draft') {
                  const sl = content.match(/^Status:\s*(.+)/m);
                  if (sl) status = sl[1].trim();
                }
              } catch (_) {}
              loaded.push({
                name: f.name,
                path: f.path,
                displayName: f.name.replace('.md', '').replace(/_/g, ' '),
                status,
              });
            }
            allEpics.value = loaded;
          }
        }
      } catch (_) {}
      loading.value = false;
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

    function toggleSelection(path) {
      const s = new Set(selectedEpics.value);
      if (s.has(path)) s.delete(path); else s.add(path);
      selectedEpics.value = s;
    }

    function selectAll() {
      if (selectedEpics.value.size === newEpics.value.length) {
        selectedEpics.value = new Set();
      } else {
        selectedEpics.value = new Set(newEpics.value.map(e => e.path));
      }
    }

    async function startSession() {
      if (!defaultAgent.value || selectedEpics.value.size === 0) return;
      sessionActive.value = true;

      await nextTick();

      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      await import('@xterm/xterm/css/xterm.css');

      const term = new Terminal({
        cursorBlink: true, fontSize: 13,
        fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
        theme: { background: '#0A1220', foreground: '#E8EDF3', cursor: '#4ADE80', selectionBackground: '#1F3A2E' },
      });

      fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalContainer.value);
      fitAddon.fit();
      termInstance = term;

      const shellId = 'ticketgen-' + (++sessionCounter);
      currentShellId.value = shellId;

      const epicPaths = [...selectedEpics.value].map(p => `"docs/${p}"`).join(', ');

      const prompt = `Read the following epic specifications: ${epicPaths}. Also read the engineering guide at ".ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md" to understand the ticket conventions and workflow.

For each epic, generate implementation tickets that break the epic into concrete development tasks. Each ticket should be added to the backlog in ".ombutocode/planning/backlog.yml" with the following fields:
- id: OMBUTO-NNN (sequential)
- title: clear, actionable title
- status: backlog
- assignee: null
- epic_ref: docs/Epics/<epic_file>.md
- acceptance_criteria: list of testable criteria
- dependencies: list of ticket IDs this depends on (if any)

Guidelines:
- Each ticket should be completable by one agent in one session
- Include setup/infrastructure tickets before feature tickets
- Include test tickets where appropriate
- Aim for 3-8 tickets per epic
- After each epic's tickets, update the epic status from NEW to TICKETS

Start by reading all the selected epics. Then propose the tickets for the first epic and ask me to confirm before writing to the backlog.`;

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

    onMounted(() => { loadEpics(); loadDefaultAgent(); });
    onBeforeUnmount(() => {
      if (currentShellId.value) window.electron.ipcRenderer.invoke('workspace:killShell', currentShellId.value);
      cleanup();
    });

    return {
      sessionActive, terminalContainer, defaultAgent, sessionPrompt, panelWidth, loading,
      allEpics, newEpics, selectedEpics,
      toggleSelection, selectAll, startSession, stopSession, startResize,
    };
  }
};
</script>

<style scoped>
.tg-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-color, #161a1f); color: var(--text-color, #d4d8dd); }
.tg-list-view { padding: 2rem; overflow-y: auto; flex: 1; }
.tg-header { margin-bottom: 1.5rem; }
.tg-header h1 { margin: 0 0 0.25rem; font-size: 1.5rem; font-weight: 600; }
.tg-subtitle { margin: 0; color: var(--text-muted, #8b929a); font-size: 0.9rem; }

.tg-loading { color: var(--text-muted); padding: 2rem; text-align: center; }
.tg-empty { display: flex; flex-direction: column; align-items: center; padding: 3rem; text-align: center; color: rgba(255,255,255,0.25); border: 1px dashed rgba(255,255,255,0.08); border-radius: 8px; }
.tg-empty .mdi { font-size: 2.5rem; margin-bottom: 0.75rem; opacity: 0.4; }
.tg-empty p { margin: 0; font-size: 0.88rem; }
.tg-empty-hint { margin-top: 0.5rem !important; font-size: 0.82rem !important; color: rgba(255,255,255,0.18); max-width: 380px; line-height: 1.5; }

/* Table */
.tg-table-section { margin-bottom: 1rem; max-width: 800px; }
.tg-table-section h2 { font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: rgba(255,255,255,0.3); margin: 0 0 0.5rem; }
.tg-table { width: 100%; border-collapse: collapse; }
.tg-table th { text-align: left; padding: 0.5rem 0.75rem; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: rgba(255,255,255,0.35); border-bottom: 1px solid rgba(255,255,255,0.06); }
.tg-table td { padding: 0.55rem 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.04); }
.tg-row { cursor: pointer; transition: background 0.1s; }
.tg-row:hover { background: rgba(255,255,255,0.04); }
.col-select { width: 36px; text-align: center; }
.col-select input[type="checkbox"] { width: 15px; height: 15px; cursor: pointer; accent-color: #6dd4a0; }
.col-name { font-size: 0.88rem; color: rgba(255,255,255,0.75); font-weight: 400; }
.col-status { width: 100px; }
.tg-status-badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 10px; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
.status-new { background: rgba(91,155,213,0.15); color: #7bb8e8; }
.col-path { font-size: 0.72rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: rgba(255,255,255,0.3); }

/* Actions */
.tg-actions { display: flex; align-items: center; gap: 0.75rem; max-width: 800px; margin-bottom: 1rem; }
.tg-agent-info { font-size: 0.82rem; color: rgba(255,255,255,0.4); }
.tg-agent-warning { font-size: 0.82rem; color: #e5a830; display: flex; align-items: center; gap: 0.3rem; }

/* Buttons */
.tg-btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.55rem 1.1rem; border: none; border-radius: 6px; font-size: 0.85rem; font-weight: 500; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
.tg-btn-primary { background: #6dd4a0; color: #0A1220; }
.tg-btn-primary:hover:not(:disabled) { background: #86efac; }
.tg-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.tg-btn-secondary { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); }
.tg-btn-secondary:hover { background: rgba(255,255,255,0.12); }
.tg-btn-sm { padding: 0.35rem 0.75rem; font-size: 0.8rem; }

/* Session */
.tg-session-wrap { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.tg-session-header { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; background: #0d1720; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 0.82rem; color: rgba(255,255,255,0.7); flex-shrink: 0; }
.tg-agent-badge { background: rgba(109,212,160,0.12); color: #6dd4a0; padding: 0.15rem 0.5rem; border-radius: 10px; font-size: 0.72rem; font-weight: 600; }
.tg-epic-count { font-size: 0.72rem; color: rgba(255,255,255,0.4); }
.tg-spacer { flex: 1; }
.tg-split-pane { flex: 1; display: flex; overflow: hidden; }
.tg-context-panel { display: flex; flex-direction: column; overflow: hidden; background: #0d1720; border-right: 1px solid rgba(255,255,255,0.06); flex-shrink: 0; }
.tg-panel-header { padding: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.06); flex-shrink: 0; }
.tg-panel-label { font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6dd4a0; }
.tg-panel-body { flex: 1; overflow-y: auto; padding: 1rem; }
.tg-ctx-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.78rem; color: rgba(255,255,255,0.55); margin-bottom: 0.3rem; }
.tg-ctx-icon { font-size: 1rem; color: #6dd4a0; }
.tg-prompt-text { font-size: 0.75rem; line-height: 1.55; color: rgba(255,255,255,0.35); font-weight: 300; margin: 0.3rem 0 0; white-space: pre-wrap; }
.tg-resize-handle { width: 6px; cursor: col-resize; background: transparent; flex-shrink: 0; position: relative; }
.tg-resize-handle::after { content: ''; position: absolute; top: 0; bottom: 0; left: 2px; width: 2px; background: rgba(255,255,255,0.06); transition: background 0.15s; }
.tg-resize-handle:hover::after { background: #6dd4a0; }
.tg-terminal-panel { flex: 1; display: flex; min-width: 0; }
.tg-terminal { flex: 1; background: #0A1220; position: relative; }
.tg-terminal :deep(.xterm) { position: absolute; top: 0; left: 0; right: 0; bottom: 0; padding: 0.5rem; }
.tg-terminal :deep(.xterm-screen) { height: 100% !important; }
.tg-terminal :deep(.xterm-viewport) { overflow-y: auto !important; }
</style>
