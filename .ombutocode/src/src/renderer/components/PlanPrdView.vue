<template>
  <div class="plan-prd-view">
    <div class="prd-header" v-if="!sessionActive">
      <h1>Product Requirements Document</h1>
      <p class="prd-subtitle">Define the vision, goals, and requirements for your product</p>

      <div class="prd-create">
        <div class="prd-create-card">
          <span class="mdi mdi-file-document-plus-outline prd-create-icon"></span>
          <div>
            <h3>Create a new PRD</h3>
            <p>
              Launch an interactive AI session that guides you through defining your product's
              vision, goals, target users, features, and success metrics.
            </p>
            <p class="prd-agent-info" v-if="defaultAgent">
              Using <strong>{{ defaultAgent }}</strong> as the coding agent.
            </p>
            <p class="prd-agent-warning" v-else>
              <span class="mdi mdi-alert-outline"></span>
              No default agent configured. Go to Settings > Coding Agents to set one up.
            </p>
          </div>
          <button class="prd-btn prd-btn-primary" :disabled="!defaultAgent" @click="startSession">
            <span class="mdi mdi-robot-outline"></span> Create PRD
          </button>
        </div>
      </div>

      <div class="prd-existing" v-if="existingPrd">
        <div class="prd-existing-card">
          <span class="mdi mdi-file-document-check-outline prd-existing-icon"></span>
          <div class="prd-existing-info">
            <strong>PRD exists</strong>
            <span>{{ existingPrd }}</span>
          </div>
          <button class="prd-btn prd-btn-secondary" @click="viewExistingPrd">
            <span class="mdi mdi-eye-outline"></span> View
          </button>
          <button class="prd-btn prd-btn-primary" @click="startSession">
            <span class="mdi mdi-pencil-outline"></span> Refine with AI
          </button>
        </div>
      </div>
    </div>

    <div class="prd-terminal-wrap" v-if="sessionActive">
      <div class="prd-terminal-header">
        <span class="mdi mdi-robot-outline"></span>
        <span>AI-Guided PRD {{ existingPrd ? 'Refinement' : 'Creation' }}</span>
        <span class="prd-terminal-agent">{{ defaultAgent }}</span>
        <div class="prd-terminal-spacer"></div>
        <button class="prd-btn prd-btn-sm prd-btn-secondary" @click="stopSession">
          <span class="mdi mdi-stop"></span> End Session
        </button>
      </div>
      <div class="prd-system-prompt">
        <div class="prd-prompt-icon">
          <span class="mdi mdi-message-text-outline"></span>
        </div>
        <div class="prd-prompt-body">
          <div class="prd-prompt-label">System Prompt</div>
          <div v-if="!promptCollapsed" class="prd-prompt-text">{{ sessionPrompt }}</div>
        </div>
        <button class="prd-prompt-collapse" @click="promptCollapsed = !promptCollapsed" :title="promptCollapsed ? 'Show prompt' : 'Hide prompt'">
          <span class="mdi" :class="promptCollapsed ? 'mdi-chevron-down' : 'mdi-chevron-up'"></span>
        </button>
      </div>
      <div ref="terminalContainer" class="prd-terminal"></div>
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

export default {
  name: 'PlanPrdView',
  emits: ['change-view'],
  setup(props, { emit }) {
    const sessionActive = ref(false);
    const terminalContainer = ref(null);
    const defaultAgent = ref('');
    const existingPrd = ref('');
    const currentShellId = ref('');
    const sessionPrompt = ref('');
    const promptCollapsed = ref(false);

    async function checkExistingPrd() {
      try {
        const tree = await window.electron.ipcRenderer.invoke('filetree:scan');
        if (tree && tree.children) {
          const prdFolder = tree.children.find(c => c.name === 'Product Requirements Document');
          if (prdFolder && prdFolder.children) {
            const mdFile = prdFolder.children.find(f => f.type === 'file' && f.name.endsWith('.md'));
            if (mdFile) {
              existingPrd.value = mdFile.path;
              return;
            }
          }
        }
      } catch (_) {}
      existingPrd.value = '';
    }

    async function loadDefaultAgent() {
      try {
        const results = await window.electron.ipcRenderer.invoke('agent:getStartupResults');
        const settings = await window.electron.ipcRenderer.invoke('settings:read');
        const preferred = settings?.eval_default_agent;

        // Use preferred if connected, otherwise first connected agent
        if (preferred && results?.[preferred]?.status === 'pass') {
          defaultAgent.value = preferred;
        } else {
          for (const id of ['claude', 'codex', 'kimi']) {
            if (results?.[id]?.status === 'pass') {
              defaultAgent.value = id;
              break;
            }
          }
        }
      } catch (_) {}
    }

    function viewExistingPrd() {
      window.__planFilePreviewPath = existingPrd.value;
      emit('change-view', 'plan-file-preview');
    }

    async function startSession() {
      if (!defaultAgent.value) return;
      sessionActive.value = true;

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

      const shellId = 'prd-agent-' + (++sessionCounter);
      currentShellId.value = shellId;

      // Build the prompt
      const prdPath = 'docs/Product Requirements Document/PRD.md';
      let prompt;
      if (existingPrd.value) {
        prompt = `Read the existing PRD at "${prdPath}" and help me refine it. Suggest improvements section by section. After each suggestion, wait for my feedback before making changes. When I approve, update the file.`;
      } else {
        prompt = `Help me create a Product Requirements Document and save it to "${prdPath}". Guide me through defining: 1) Product overview and vision, 2) Goals and objectives, 3) Target users / personas, 4) Key features, 5) Success metrics, 6) Constraints. Ask me about one section at a time, then write the complete PRD file when we are done.`;
      }
      sessionPrompt.value = prompt;
      promptCollapsed.value = false;

      // Launch the agent CLI directly (no shell wrapper)
      const agentCmd = defaultAgent.value;
      let args;
      if (agentCmd === 'claude') {
        args = ['--verbose', '--dangerously-skip-permissions', prompt];
      } else if (agentCmd === 'codex') {
        args = [prompt];
      } else {
        args = [prompt];
      }

      await window.electron.ipcRenderer.invoke('agent:spawnInteractive', shellId, agentCmd, args);

      // Refit after container is visible
      setTimeout(() => {
        if (fitAddon) fitAddon.fit();
      }, 300);

      // Wire terminal I/O
      term.onData((data) => {
        window.electron.ipcRenderer.invoke('workspace:writeShell', shellId, data);
      });

      shellCleanup = window.electron.ipcRenderer.on('workspace:shellData', ({ shellId: sid, data }) => {
        if (sid === shellId && termInstance) {
          termInstance.write(data);
        }
      });

      exitCleanup = window.electron.ipcRenderer.on('workspace:shellExit', ({ shellId: sid }) => {
        if (sid === shellId && termInstance) {
          termInstance.write('\r\n\x1b[32m✓ Session ended.\x1b[0m\r\n');
        }
      });

      resizeObserver = new ResizeObserver(() => {
        try {
          if (fitAddon) fitAddon.fit();
          if (termInstance) {
            window.electron.ipcRenderer.invoke('workspace:resizeShell', shellId, termInstance.cols, termInstance.rows);
          }
        } catch {}
      });
      resizeObserver.observe(terminalContainer.value);
    }

    function stopSession() {
      if (currentShellId.value) {
        window.electron.ipcRenderer.invoke('workspace:killShell', currentShellId.value);
      }
      cleanup();
      sessionActive.value = false;
      checkExistingPrd();
    }

    function cleanup() {
      if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
      if (shellCleanup) { shellCleanup(); shellCleanup = null; }
      if (exitCleanup) { exitCleanup(); exitCleanup = null; }
      if (termInstance) { termInstance.dispose(); termInstance = null; }
      fitAddon = null;
    }

    onMounted(() => {
      checkExistingPrd();
      loadDefaultAgent();
    });

    onBeforeUnmount(() => {
      if (currentShellId.value) {
        window.electron.ipcRenderer.invoke('workspace:killShell', currentShellId.value);
      }
      cleanup();
    });

    return {
      sessionActive, terminalContainer, defaultAgent, existingPrd,
      sessionPrompt, promptCollapsed,
      viewExistingPrd, startSession, stopSession
    };
  }
};
</script>

<style scoped>
.plan-prd-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-color, #161a1f);
  color: var(--text-color, #d4d8dd);
}

.prd-header {
  padding: 2rem;
  overflow-y: auto;
}

.prd-header h1 {
  margin: 0 0 0.25rem;
  font-size: 1.5rem;
  font-weight: 600;
}

.prd-subtitle {
  margin: 0 0 2rem;
  color: var(--text-muted, #8b929a);
  font-size: 0.9rem;
}

/* Create / Existing cards */
.prd-existing + .prd-create {
  margin-top: 1rem;
}

.prd-create-card,
.prd-existing-card {
  display: flex;
  align-items: flex-start;
  gap: 1.25rem;
  padding: 1.5rem;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  max-width: 640px;
}

.prd-create-icon,
.prd-existing-icon {
  font-size: 2rem;
  color: #6dd4a0;
  flex-shrink: 0;
  margin-top: 0.15rem;
}

.prd-create-card h3 {
  margin: 0 0 0.5rem;
  font-size: 1.05rem;
}

.prd-create-card p,
.prd-existing-info span {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.5);
  font-weight: 300;
}

.prd-existing-card {
  align-items: center;
}

.prd-existing-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.prd-existing-info strong {
  color: var(--text-color, #d4d8dd);
  font-size: 0.9rem;
}

.prd-existing-info span {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.78rem;
}

.prd-agent-info {
  margin-top: 0.5rem !important;
  font-size: 0.82rem !important;
  color: rgba(255, 255, 255, 0.4) !important;
}

.prd-agent-warning {
  margin-top: 0.5rem !important;
  font-size: 0.82rem !important;
  color: #e5a830 !important;
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

/* Buttons */
.prd-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 1.1rem;
  border: none;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
}

.prd-btn-primary {
  background: #6dd4a0;
  color: #0A1220;
}

.prd-btn-primary:hover:not(:disabled) {
  background: #86efac;
}

.prd-btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.prd-btn-secondary {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
}

.prd-btn-secondary:hover {
  background: rgba(255, 255, 255, 0.12);
}

.prd-btn-sm {
  padding: 0.35rem 0.75rem;
  font-size: 0.78rem;
}

/* Terminal */
.prd-terminal-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.prd-terminal-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: #0d1720;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.7);
}

.prd-terminal-agent {
  background: rgba(109, 212, 160, 0.12);
  color: #6dd4a0;
  padding: 0.15rem 0.5rem;
  border-radius: 10px;
  font-size: 0.72rem;
  font-weight: 600;
}

.prd-terminal-spacer {
  flex: 1;
}

/* System prompt panel */
.prd-system-prompt {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: #0d1720;
  border-bottom: 1px solid rgba(109, 212, 160, 0.1);
  flex-shrink: 0;
}

.prd-prompt-icon {
  flex-shrink: 0;
  margin-top: 0.1rem;
}

.prd-prompt-icon .mdi {
  font-size: 1.1rem;
  color: #6dd4a0;
}

.prd-prompt-body {
  flex: 1;
  min-width: 0;
}

.prd-prompt-label {
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6dd4a0;
  margin-bottom: 0.3rem;
}

.prd-prompt-text {
  font-size: 0.82rem;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.55);
  font-weight: 300;
}

.prd-prompt-collapse {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  padding: 0.2rem;
  border-radius: 3px;
  flex-shrink: 0;
  align-self: flex-start;
}

.prd-prompt-collapse:hover {
  color: rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.06);
}

.prd-terminal {
  flex: 1;
  background: #0A1220;
  position: relative;
}

.prd-terminal :deep(.xterm) {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 0.5rem;
}

.prd-terminal :deep(.xterm-screen) {
  height: 100% !important;
}

.prd-terminal :deep(.xterm-viewport) {
  overflow-y: auto !important;
}
</style>
