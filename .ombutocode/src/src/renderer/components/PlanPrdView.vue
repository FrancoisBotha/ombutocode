<template>
  <div class="plan-prd-view">
    <div class="prd-header" v-if="!sessionActive">
      <h1>{{ docTitle }}</h1>
      <p class="prd-subtitle">{{ docSubtitle }}</p>

      <div class="prd-create">
        <div class="prd-create-card">
          <span class="mdi mdi-file-document-plus-outline prd-create-icon"></span>
          <div>
            <h3>Create a new {{ docShortName }}</h3>
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
          <button class="prd-btn prd-btn-primary" :disabled="!defaultAgent" @click="confirmCreate">
            <span class="mdi mdi-robot-outline"></span> Create {{ docShortName }}
          </button>
        </div>
      </div>

      <div class="prd-existing" v-if="existingDoc">
        <div class="prd-existing-card">
          <span class="mdi mdi-file-document-check-outline prd-existing-icon"></span>
          <div class="prd-existing-info">
            <strong>{{ docShortName }} exists</strong>
            <span>{{ existingDoc }}</span>
          </div>
          <button class="prd-btn prd-btn-secondary" @click="viewExistingDoc">
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
        <span>AI-Guided {{ docShortName }} {{ sessionMode === 'refine' ? 'Refinement' : 'Creation' }}</span>
        <span class="prd-terminal-agent">{{ defaultAgent }}</span>
        <div class="prd-terminal-spacer"></div>
        <button class="prd-btn prd-btn-sm prd-btn-secondary" @click="stopSession">
          <span class="mdi mdi-stop"></span> End Session
        </button>
      </div>
      <div class="prd-split-pane">
        <!-- Left: Skill selector + preview -->
        <div class="prd-skill-panel" :style="{ width: skillPanelWidth + 'px' }">
          <div class="prd-skill-selector">
            <label class="prd-skill-label">Skill / System Prompt</label>
            <select class="prd-skill-select" v-model="selectedSkillPath" @change="loadSelectedSkill">
              <option value="">-- None --</option>
              <option v-for="s in availableSkills" :key="s.path" :value="s.path">{{ s.displayName }}</option>
            </select>
          </div>
          <div class="prd-skill-preview" v-if="selectedSkillContent">
            <div class="prd-skill-md" v-html="renderedSkillHtml"></div>
          </div>
          <div class="prd-skill-empty" v-else>
            <span class="mdi mdi-school-outline"></span>
            <p>Select a skill to use as system prompt for the AI agent</p>
          </div>
        </div>

        <!-- Resize handle -->
        <div class="prd-resize-handle" @mousedown="startResize"></div>

        <!-- Right: Terminal -->
        <div class="prd-terminal-panel">
          <div ref="terminalContainer" class="prd-terminal"></div>
        </div>
      </div>
    </div>
    <!-- Overwrite confirmation modal -->
    <Teleport to="body">
      <div v-if="showOverwriteConfirm" class="prd-confirm-overlay" @click.self="showOverwriteConfirm = false">
        <div class="prd-confirm-dialog">
          <div class="prd-confirm-icon">
            <span class="mdi mdi-alert-outline"></span>
          </div>
          <h3>Overwrite existing {{ docShortName }}?</h3>
          <p>A {{ docShortName }} already exists. Creating a new one will overwrite the current document. This action cannot be undone.</p>
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
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { marked } from 'marked';

let termInstance = null;
let fitAddon = null;
let resizeObserver = null;
let shellCleanup = null;
let exitCleanup = null;
let sessionCounter = 0;

export default {
  name: 'PlanPrdView',
  emits: ['change-view'],
  props: {
    docTitle: { type: String, default: 'Product Requirements Document' },
    docSubtitle: { type: String, default: 'Define the vision, goals, and requirements for your product' },
    docFolder: { type: String, default: 'Product Requirements Document' },
    docFileName: { type: String, default: 'PRD.md' },
    docShortName: { type: String, default: 'PRD' },
    skillMatch: { type: String, default: 'prd' },
    createInstruction: { type: String, default: '' },
    refineInstruction: { type: String, default: '' },
    contextFiles: { type: Array, default: () => [] },
  },
  setup(props, { emit }) {
    const sessionActive = ref(false);
    const terminalContainer = ref(null);
    const defaultAgent = ref('');
    const existingDoc = ref('');
    const currentShellId = ref('');
    const sessionPrompt = ref('');
    const promptCollapsed = ref(false);
    const sessionMode = ref('create');

    // Skill panel
    const availableSkills = ref([]);
    const selectedSkillPath = ref('');
    const selectedSkillContent = ref('');
    const skillPanelWidth = ref(350);

    const renderedSkillHtml = computed(() => {
      if (!selectedSkillContent.value) return '';
      // Strip frontmatter
      const content = selectedSkillContent.value.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
      return marked.parse(content);
    });

    async function loadAvailableSkills() {
      try {
        const tree = await window.electron.ipcRenderer.invoke('filetree:scan');
        if (tree && tree.children) {
          const skillsFolder = tree.children.find(c => c.name === 'Skills');
          if (skillsFolder && skillsFolder.children) {
            availableSkills.value = skillsFolder.children
              .filter(f => f.type === 'file' && f.name.endsWith('.md'))
              .map(f => ({
                path: f.path,
                name: f.name,
                displayName: f.name.replace('.md', '').replace(/_/g, ' '),
              }));
          }
        }
      } catch (_) {}
    }

    async function loadSelectedSkill() {
      if (!selectedSkillPath.value) {
        selectedSkillContent.value = '';
        return;
      }
      try {
        selectedSkillContent.value = await window.electron.ipcRenderer.invoke('filetree:readFile', selectedSkillPath.value);
      } catch (_) {
        selectedSkillContent.value = '';
      }
    }

    function autoSelectSkill() {
      const match = props.skillMatch.toLowerCase();
      const prdSkill = availableSkills.value.find(s =>
        s.name.toLowerCase().includes(match) || s.displayName.toLowerCase().includes(match)
      );
      if (prdSkill) {
        selectedSkillPath.value = prdSkill.path;
        loadSelectedSkill();
      }
    }

    // Resize handle
    let resizing = false;
    function startResize(e) {
      resizing = true;
      const startX = e.clientX;
      const startW = skillPanelWidth.value;
      function onMove(ev) {
        if (!resizing) return;
        skillPanelWidth.value = Math.max(200, Math.min(600, startW + ev.clientX - startX));
      }
      function onUp() {
        resizing = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        // Refit terminal after resize
        if (fitAddon) setTimeout(() => fitAddon.fit(), 50);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    async function checkExistingDoc() {
      try {
        const tree = await window.electron.ipcRenderer.invoke('filetree:scan');
        if (tree && tree.children) {
          const folder = tree.children.find(c => c.name === props.docFolder);
          if (folder && folder.children) {
            const mdFile = folder.children.find(f => f.type === 'file' && f.name.endsWith('.md'));
            if (mdFile) {
              existingDoc.value = mdFile.path;
              return;
            }
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

    const showOverwriteConfirm = ref(false);

    function confirmCreate() {
      if (existingDoc.value) {
        showOverwriteConfirm.value = true;
      } else {
        startSession('create');
      }
    }

    function onConfirmOverwrite() {
      showOverwriteConfirm.value = false;
      startSession('create');
    }

    function viewExistingDoc() {
      window.__planFilePreviewPath = existingDoc.value;
      emit('change-view', 'plan-file-preview');
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

      const shellId = 'prd-agent-' + (++sessionCounter);
      currentShellId.value = shellId;

      // Build the prompt — use selected skill if available, otherwise default
      const docPath = `docs/${props.docFolder}/${props.docFileName}`;
      let prompt;

      // Strip frontmatter from skill content for the prompt
      const skillText = selectedSkillContent.value
        ? selectedSkillContent.value.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '').trim()
        : '';

      let contextNote = '';
      if (props.contextFiles.length > 0) {
        const files = props.contextFiles.map(f => `"${f}"`).join(', ');
        contextNote = ` For context, also read these related documents: ${files}.`;
      }

      const defaultCreate = `Help me create a new ${props.docTitle} and save it to "${docPath}".${contextNote} Guide me through each section one at a time, then write the complete document when we are done.`;
      const defaultRefine = `Read the existing ${props.docTitle} at "${docPath}" and help me refine it.${contextNote} Suggest improvements section by section. After each suggestion, wait for my feedback before making changes. When I approve, update the file.`;
      const createInstruction = props.createInstruction || defaultCreate;
      const refineInstruction = props.refineInstruction || defaultRefine;
      const instruction = isRefine ? refineInstruction : createInstruction;

      if (skillText) {
        prompt = skillText + '\n\n' + instruction;
      } else {
        prompt = instruction;
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
      checkExistingDoc();
    }

    function cleanup() {
      if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
      if (shellCleanup) { shellCleanup(); shellCleanup = null; }
      if (exitCleanup) { exitCleanup(); exitCleanup = null; }
      if (termInstance) { termInstance.dispose(); termInstance = null; }
      fitAddon = null;
    }

    onMounted(async () => {
      checkExistingDoc();
      loadDefaultAgent();
      await loadAvailableSkills();
      autoSelectSkill();
    });

    onBeforeUnmount(() => {
      if (currentShellId.value) {
        window.electron.ipcRenderer.invoke('workspace:killShell', currentShellId.value);
      }
      cleanup();
    });

    return {
      sessionActive, terminalContainer, defaultAgent, existingDoc,
      sessionPrompt, promptCollapsed, sessionMode,
      availableSkills, selectedSkillPath, selectedSkillContent, renderedSkillHtml,
      skillPanelWidth, loadSelectedSkill, startResize,
      confirmCreate, showOverwriteConfirm, onConfirmOverwrite,
      viewExistingDoc, startSession, stopSession
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

/* Session wrap */
.prd-session-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.prd-session-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: #0d1720;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.7);
  flex-shrink: 0;
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

/* Split pane */
.prd-split-pane {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* Left: Skill panel */
.prd-skill-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #0d1720;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.prd-skill-selector {
  padding: 0.75rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.prd-skill-label {
  display: block;
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6dd4a0;
  margin-bottom: 0.4rem;
}

.prd-skill-select {
  width: 100%;
  padding: 0.4rem 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 5px;
  background: #0A1220;
  color: var(--text-color, #d4d8dd);
  font-size: 0.82rem;
  cursor: pointer;
  outline: none;
}

.prd-skill-select:focus {
  border-color: #6dd4a0;
}

.prd-skill-preview {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.prd-skill-preview::-webkit-scrollbar {
  width: 4px;
}

.prd-skill-preview::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.prd-skill-md {
  font-size: 0.82rem;
  line-height: 1.65;
  color: rgba(255, 255, 255, 0.6);
  font-weight: 300;
}

.prd-skill-md :deep(h1) { font-size: 1.1rem; color: var(--text-color, #d4d8dd); margin: 0 0 0.5rem; font-weight: 600; }
.prd-skill-md :deep(h2) { font-size: 0.95rem; color: var(--text-color, #d4d8dd); margin: 1rem 0 0.4rem; font-weight: 600; }
.prd-skill-md :deep(h3) { font-size: 0.88rem; color: var(--text-color, #d4d8dd); margin: 0.75rem 0 0.3rem; font-weight: 600; }
.prd-skill-md :deep(p) { margin: 0.4rem 0; }
.prd-skill-md :deep(ul), .prd-skill-md :deep(ol) { margin: 0.3rem 0; padding-left: 1.25rem; }
.prd-skill-md :deep(li) { margin: 0.15rem 0; }
.prd-skill-md :deep(code) { background: rgba(255, 255, 255, 0.06); padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.78rem; color: #6dd4a0; }
.prd-skill-md :deep(pre) { background: #0A1220; padding: 0.6rem; border-radius: 5px; overflow-x: auto; margin: 0.5rem 0; }
.prd-skill-md :deep(pre code) { background: none; padding: 0; color: rgba(255, 255, 255, 0.65); }
.prd-skill-md :deep(strong) { color: rgba(255, 255, 255, 0.8); font-weight: 600; }
.prd-skill-md :deep(em) { color: rgba(255, 255, 255, 0.5); }

.prd-skill-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.2);
  text-align: center;
  padding: 2rem;
}

.prd-skill-empty .mdi {
  font-size: 2rem;
  margin-bottom: 0.5rem;
  opacity: 0.4;
}

.prd-skill-empty p {
  margin: 0;
  font-size: 0.8rem;
  max-width: 200px;
}

/* Resize handle */
.prd-resize-handle {
  width: 6px;
  cursor: col-resize;
  background: transparent;
  flex-shrink: 0;
  position: relative;
}

.prd-resize-handle::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 2px;
  width: 2px;
  background: rgba(255, 255, 255, 0.06);
  transition: background 0.15s;
}

.prd-resize-handle:hover::after {
  background: #6dd4a0;
}

/* Right: Terminal panel */
.prd-terminal-panel {
  flex: 1;
  display: flex;
  min-width: 0;
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

/* Overwrite confirmation modal */
.prd-confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.prd-confirm-dialog {
  background: #1e2535;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 2rem;
  width: 400px;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.prd-confirm-icon {
  margin-bottom: 0.75rem;
}

.prd-confirm-icon .mdi {
  font-size: 2.5rem;
  color: #e5a830;
}

.prd-confirm-dialog h3 {
  margin: 0 0 0.6rem;
  font-size: 1.1rem;
  color: rgba(255, 255, 255, 0.9);
}

.prd-confirm-dialog p {
  margin: 0 0 1.5rem;
  font-size: 0.88rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.5);
}

.prd-confirm-actions {
  display: flex;
  justify-content: center;
  gap: 0.75rem;
}

.prd-btn-danger {
  background: #e06060;
  color: #fff;
}

.prd-btn-danger:hover {
  background: #c94040;
}
</style>
