<template>
  <div class="init-view">
    <!-- Pre-session card -->
    <div class="init-list-view" v-if="!sessionActive">
      <div class="init-header">
        <div>
          <h1>Initiate Stack</h1>
          <p class="init-subtitle">Bootstrap the project's tech stack from the PRD and Architecture documents</p>
        </div>
      </div>

      <div class="init-create-card">
        <span class="mdi mdi-cog-play-outline init-create-icon"></span>
        <div class="init-create-info">
          <h3>Initialise project stack</h3>
          <p>
            Launch an AI session that reads the PRD and Architecture, then bootstraps the project:
            creates the source/test directory layout, installs dependencies, writes a stack-appropriate
            <code>.gitignore</code>, and authors <code>docs/Test Strategy/test-strategy.md</code> — the
            playbook every future test-phase agent will read before running tests.
          </p>
          <p class="init-warning-note">
            <span class="mdi mdi-information-outline"></span>
            Run this once, after PRD and Architecture are signed off, and before generating epics.
          </p>

          <div class="init-context-grid">
            <div class="init-context-field">
              <label class="init-context-label">PRD Document</label>
              <select class="init-context-select" v-model="selectedPrd">
                <option value="">-- None --</option>
                <option v-for="f in prdFiles" :key="f.path" :value="f.path">{{ f.name }}</option>
              </select>
            </div>
            <div class="init-context-field">
              <label class="init-context-label">Architecture Document</label>
              <select class="init-context-select" v-model="selectedArch">
                <option value="">-- None --</option>
                <option v-for="f in archFiles" :key="f.path" :value="f.path">{{ f.name }}</option>
              </select>
            </div>
            <div class="init-context-field">
              <label class="init-context-label">Data Model</label>
              <select class="init-context-select" v-model="selectedDataModel">
                <option value="">-- None --</option>
                <option v-for="f in dataModelFiles" :key="f.path" :value="f.path">{{ f.name }}</option>
              </select>
            </div>
            <div class="init-context-field">
              <label class="init-context-label">Style Guide</label>
              <select class="init-context-select" v-model="selectedStyleGuide">
                <option value="">-- None --</option>
                <option v-for="f in styleGuideFiles" :key="f.path" :value="f.path">{{ f.name }}</option>
              </select>
            </div>
          </div>

          <p class="init-agent-info" v-if="defaultAgent">
            Using <strong>{{ defaultAgent }}</strong> as the coding agent.
          </p>
          <p class="init-agent-warning" v-else>
            <span class="mdi mdi-alert-outline"></span>
            No default agent configured. Go to Settings &gt; Coding Agents to set one up.
          </p>
        </div>
        <button
          class="init-btn init-btn-primary"
          :disabled="!defaultAgent || !selectedPrd || !selectedArch"
          :title="!selectedArch ? 'Select an architecture document — the stack is read from it' : 'Start the AI bootstrap session'"
          @click="startSession"
        >
          <span class="mdi mdi-robot-outline"></span> Initialise Stack
        </button>
      </div>
    </div>

    <!-- AI Session -->
    <div class="init-session-wrap" v-if="sessionActive">
      <div class="init-session-header">
        <span class="mdi mdi-robot-outline"></span>
        <span>AI-Guided Stack Initialisation</span>
        <span class="init-agent-badge">{{ defaultAgent }}</span>
        <div class="init-spacer"></div>
        <button class="init-btn init-btn-sm init-btn-secondary" @click="stopSession">
          <span class="mdi mdi-stop"></span> End Session
        </button>
      </div>
      <div class="init-split-pane">
        <div class="init-context-panel" :style="{ width: panelWidth + 'px' }">
          <div class="init-panel-header">
            <label class="init-panel-label">Context &amp; Prompt</label>
          </div>
          <div class="init-panel-body">
            <div class="init-ctx-item" v-if="selectedPrd">
              <span class="mdi mdi-file-document-outline init-ctx-icon"></span>
              <span>{{ selectedPrd }}</span>
            </div>
            <div class="init-ctx-item" v-if="selectedArch">
              <span class="mdi mdi-layers-outline init-ctx-icon"></span>
              <span>{{ selectedArch }}</span>
            </div>
            <div class="init-ctx-item" v-if="selectedDataModel">
              <span class="mdi mdi-database-outline init-ctx-icon"></span>
              <span>{{ selectedDataModel }}</span>
            </div>
            <div class="init-ctx-item" v-if="selectedStyleGuide">
              <span class="mdi mdi-palette-outline init-ctx-icon"></span>
              <span>{{ selectedStyleGuide }}</span>
            </div>
            <div class="init-field-group" style="margin-top: 0.75rem;">
              <label class="init-panel-label">Skill</label>
              <select class="init-skill-select" v-model="selectedSkill" @change="loadSelectedSkillContent">
                <option value="">— No skill —</option>
                <option v-for="s in skillFiles" :key="s.path" :value="s.path">{{ s.displayName }}</option>
              </select>
            </div>
            <div class="init-prompt-section">
              <div class="init-panel-label" style="margin-top: 0.75rem;">System Prompt</div>
              <p class="init-prompt-text">{{ sessionPrompt }}</p>
            </div>
          </div>
        </div>
        <div class="init-resize-handle" @mousedown="startResize"></div>
        <div class="init-terminal-panel">
          <div ref="terminalContainer" class="init-terminal"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';

// Module-scoped so the watchers below can refit / clean up without
// threading them through props.
let termInstance = null;
let fitAddon = null;
let resizeObserver = null;
let shellCleanup = null;
let exitCleanup = null;
let sessionCounter = 0;

export default {
  name: 'PlanInitiateStackView',
  emits: ['change-view'],
  props: {
    // App.vue toggles this via v-show so the agent terminal survives navigation.
    visible: { type: Boolean, default: true },
  },
  setup(props, { emit }) {
    const sessionActive = ref(false);
    const terminalContainer = ref(null);
    const defaultAgent = ref('');
    const currentShellId = ref('');
    const sessionPrompt = ref('');
    const panelWidth = ref(320);

    const prdFiles = ref([]);
    const archFiles = ref([]);
    const dataModelFiles = ref([]);
    const styleGuideFiles = ref([]);
    const selectedPrd = ref('');
    const selectedArch = ref('');
    const selectedDataModel = ref('');
    const selectedStyleGuide = ref('');

    const skillFiles = ref([]);
    const selectedSkill = ref('');
    const selectedSkillContent = ref('');

    async function loadContextFiles() {
      try {
        const tree = await window.electron.ipcRenderer.invoke('filetree:scan');
        if (!tree || !tree.children) return;

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

        const sgFolder = tree.children.find(c => c.name === 'Style Guide');
        if (sgFolder && sgFolder.children) {
          styleGuideFiles.value = sgFolder.children.filter(f => f.type === 'file' && f.name.endsWith('.md'));
          if (styleGuideFiles.value.length === 1) selectedStyleGuide.value = styleGuideFiles.value[0].path;
        }
      } catch (_) { /* silent — the user can pick manually */ }
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

    async function loadSkills() {
      try {
        const tree = await window.electron.ipcRenderer.invoke('filetree:scan');
        if (!tree || !tree.children) return;
        const folder = tree.children.find(c => c.name === 'Skills');
        if (!folder || !folder.children) return;
        skillFiles.value = folder.children
          .filter(f => f.type === 'file' && f.name.endsWith('.md'))
          .map(f => ({ path: f.path, name: f.name, displayName: f.name.replace('.md', '').replace(/_/g, ' ') }));
        // Auto-select the Initiate Stack skill — this view exists to drive
        // exactly that flow. Fall back to the first skill if not present.
        const match = skillFiles.value.find(s => /initiate[ _-]?stack/i.test(s.name))
          || skillFiles.value[0];
        if (match) {
          selectedSkill.value = match.path;
          await loadSelectedSkillContent();
        }
      } catch (_) {}
    }

    async function loadSelectedSkillContent() {
      if (!selectedSkill.value) { selectedSkillContent.value = ''; return; }
      try {
        const content = await window.electron.ipcRenderer.invoke('filetree:readFile', selectedSkill.value);
        selectedSkillContent.value = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '').trim();
      } catch (_) { selectedSkillContent.value = ''; }
    }

    async function startSession() {
      if (!defaultAgent.value || !selectedPrd.value || !selectedArch.value) return;
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

      const shellId = 'init-stack-' + (++sessionCounter);
      currentShellId.value = shellId;

      const contextParts = [
        `Read the PRD at "docs/${selectedPrd.value}"`,
        `the Architecture document at "docs/${selectedArch.value}"`,
      ];
      if (selectedDataModel.value) contextParts.push(`the Data Model at "docs/${selectedDataModel.value}"`);
      if (selectedStyleGuide.value) contextParts.push(`the Style Guide at "docs/${selectedStyleGuide.value}"`);

      const skillPrefix = selectedSkillContent.value ? selectedSkillContent.value + '\n\n---\n\n' : '';
      const prompt = `${skillPrefix}${contextParts.join(', and ')}. Also read the engineering guide at ".ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md" to understand the project conventions.

Apply the Initiate Stack skill above to bootstrap the project. Follow every step:
  1. Confirm the stack with me before scaffolding.
  2. Create the source tree using idiomatic commands.
  3. Install dependencies.
  4. Write/extend a stack-appropriate .gitignore.
  5. Author docs/Test Strategy/test-strategy.md as the test playbook for every future ticket.
  6. Verify the project builds and the test runner works.
  7. Commit the scaffold with a clear single message.

Start by stating what stack you read from the architecture document, then ask me to confirm before doing anything else.`;

      sessionPrompt.value = prompt;

      const agentCmd = defaultAgent.value;
      let args;
      if (agentCmd === 'claude') {
        args = ['--verbose', '--dangerously-skip-permissions', prompt];
      } else {
        args = [];
      }

      await window.electron.ipcRenderer.invoke('agent:spawnInteractive', shellId, agentCmd, args);

      if (agentCmd !== 'claude') {
        setTimeout(() => {
          window.electron.ipcRenderer.invoke('workspace:writeShell', shellId, prompt + '\r');
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
      loadContextFiles();
      loadDefaultAgent();
      loadSkills();
    });

    // v-show: terminal survives navigation, so refit + refresh context files
    // when the view becomes visible again (a Style Guide may have been added
    // in another view in the meantime).
    watch(() => props.visible, (isVisible) => {
      if (!isVisible) return;
      if (fitAddon) {
        requestAnimationFrame(() => { try { fitAddon.fit(); } catch (_) {} });
      }
      loadContextFiles();
    });

    onBeforeUnmount(() => {
      if (currentShellId.value) window.electron.ipcRenderer.invoke('workspace:killShell', currentShellId.value);
      cleanup();
    });

    return {
      sessionActive, terminalContainer, defaultAgent, sessionPrompt, panelWidth,
      prdFiles, archFiles, dataModelFiles, styleGuideFiles,
      selectedPrd, selectedArch, selectedDataModel, selectedStyleGuide,
      skillFiles, selectedSkill, loadSelectedSkillContent,
      startSession, stopSession, startResize,
    };
  },
};
</script>

<style scoped>
.init-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-color); color: var(--text-color); }
.init-list-view { padding: 2rem; overflow-y: auto; flex: 1; }
.init-header { margin-bottom: 1.5rem; }
.init-header h1 { margin: 0 0 0.25rem; font-size: 1.5rem; font-weight: 600; }
.init-subtitle { margin: 0; color: var(--text-muted); font-size: 0.9rem; }

.init-create-card {
  display: flex; align-items: flex-start; gap: 1.25rem; padding: 1.5rem;
  border-radius: 8px; background: var(--card-bg); border: 1px solid var(--border-color); max-width: 100%;
  box-shadow: var(--box-shadow);
}
.init-create-icon { font-size: 2rem; color: #6dd4a0; flex-shrink: 0; margin-top: 0.15rem; }
.init-create-info { flex: 1; }
.init-create-info h3 { margin: 0 0 0.5rem; font-size: 1.05rem; }
.init-create-info p { margin: 0 0 0.75rem; font-size: 0.88rem; line-height: 1.6; color: var(--text-muted); font-weight: 300; }
.init-create-info code { background: var(--secondary-color); padding: 0.05rem 0.3rem; border-radius: 3px; font-size: 0.82em; }

.init-warning-note {
  display: flex; align-items: center; gap: 0.4rem;
  font-size: 0.82rem !important; color: #b87f0e !important;
}
[data-theme="dark"] .init-warning-note { color: #e5a830 !important; }

.init-context-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem 1rem; margin: 0.75rem 0;
}
.init-context-label {
  display: block; font-size: 0.72rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--text-muted); margin-bottom: 0.2rem;
}
.init-context-select {
  width: 100%; padding: 0.35rem 0.5rem; border: 1px solid var(--border-color); border-radius: 5px;
  background: var(--bg-color); color: var(--text-color); font-size: 0.85rem; cursor: pointer; outline: none;
}
.init-context-select:focus { border-color: #6dd4a0; }

.init-agent-info { font-size: 0.82rem; color: var(--text-muted); }
.init-agent-warning { display: flex; align-items: center; gap: 0.3rem; font-size: 0.82rem; color: #b87f0e; }
[data-theme="dark"] .init-agent-warning { color: #e5a830; }

.init-btn {
  display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.55rem 1.1rem;
  border: none; border-radius: 6px; font-size: 0.85rem; font-weight: 500;
  cursor: pointer; transition: all 0.15s; white-space: nowrap;
}
.init-btn-primary { background: #6dd4a0; color: #0A1220; }
.init-btn-primary:hover:not(:disabled) { background: #86efac; }
.init-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.init-btn-secondary { background: var(--secondary-color); color: var(--text-muted); }
.init-btn-secondary:hover { background: var(--border-color); }
.init-btn-sm { padding: 0.35rem 0.75rem; font-size: 0.8rem; }

/* Session split-pane (left context panel intentionally dark — terminal-adjacent) */
.init-session-wrap { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.init-session-header {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem;
  background: var(--card-bg); border-bottom: 1px solid var(--border-color);
  font-size: 0.82rem; color: var(--text-color); flex-shrink: 0;
}
.init-agent-badge { background: rgba(109,212,160,0.12); color: #6dd4a0; padding: 0.15rem 0.5rem; border-radius: 10px; font-size: 0.72rem; font-weight: 600; }
.init-spacer { flex: 1; }
.init-split-pane { flex: 1; display: flex; overflow: hidden; }
.init-context-panel { display: flex; flex-direction: column; overflow: hidden; background: var(--card-bg); border-right: 1px solid var(--border-color); flex-shrink: 0; color: var(--text-color); }
.init-panel-header { padding: 0.75rem; border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
.init-panel-label { font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6dd4a0; }
.init-panel-body { flex: 1; overflow-y: auto; padding: 1rem; }
.init-ctx-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.78rem; color: var(--text-muted); margin-bottom: 0.3rem; }
.init-ctx-icon { font-size: 1rem; color: #6dd4a0; }
.init-prompt-section { margin-top: 0.5rem; }
.init-prompt-text { font-size: 0.75rem; line-height: 1.55; color: var(--text-muted); font-weight: 300; margin: 0.3rem 0 0; white-space: pre-wrap; }

.init-skill-select {
  width: 100%; padding: 0.4rem 0.5rem; border: 1px solid var(--border-color); border-radius: 5px;
  background: var(--bg-color); color: var(--text-color); font-size: 0.82rem; cursor: pointer; outline: none; margin-top: 0.3rem;
}
.init-skill-select:focus { border-color: #6dd4a0; }
.init-field-group .init-panel-label { display: block; }

.init-resize-handle { width: 6px; cursor: col-resize; background: transparent; flex-shrink: 0; position: relative; }
.init-resize-handle::after { content: ''; position: absolute; top: 0; bottom: 0; left: 2px; width: 2px; background: var(--border-color); transition: background 0.15s; }
.init-resize-handle:hover::after { background: #6dd4a0; }
.init-terminal-panel { flex: 1; display: flex; min-width: 0; }
.init-terminal { flex: 1; background: #0A1220; position: relative; }
.init-terminal :deep(.xterm) { position: absolute; top: 0; left: 0; right: 0; bottom: 0; padding: 0.5rem; }
.init-terminal :deep(.xterm-screen) { height: 100% !important; }
.init-terminal :deep(.xterm-viewport) { overflow-y: auto !important; }
</style>
