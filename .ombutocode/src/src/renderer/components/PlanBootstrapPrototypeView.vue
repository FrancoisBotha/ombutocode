<template>
  <div class="proto-view">
    <!-- Pre-session card -->
    <div class="proto-list-view" v-if="!sessionActive">
      <div class="proto-header">
        <div>
          <h1>Bootstrap Prototype</h1>
          <p class="proto-subtitle">Fold an existing prototype into the repository as the first increment of the real application</p>
        </div>
      </div>

      <div class="proto-create-card">
        <span class="mdi mdi-rocket-launch-outline proto-create-icon"></span>
        <div class="proto-create-info">
          <h3>Incorporate prototype into the application</h3>
          <p>
            Launch an interactive AI session that reads your prototype folder and the Architecture
            document, then ports the prototype into the project — <strong>staying as true to the
            prototype as possible</strong> while respecting the stack, layout and layering the
            architecture prescribes. The agent finishes by building and running the app so you can
            verify it against the original with your own eyes.
          </p>
          <p class="proto-warning-note">
            <span class="mdi mdi-information-outline"></span>
            Run this after Initiate Stack, as the first step of building the application. The prototype folder is only ever read, never modified.
          </p>

          <div class="proto-context-grid">
            <div class="proto-context-field">
              <label class="proto-context-label">Architecture Document</label>
              <select class="proto-context-select" v-model="selectedArch">
                <option value="">-- None --</option>
                <option v-for="f in archFiles" :key="f.path" :value="f.path">{{ f.name }}</option>
              </select>
            </div>
          </div>

          <!-- Prototype folder picker -->
          <div class="proto-folder-field">
            <label class="proto-context-label">Prototype Folder</label>
            <div class="proto-folder-row">
              <input
                class="proto-folder-input"
                type="text"
                v-model="prototypePath"
                placeholder="Select the folder containing the prototype…"
                spellcheck="false"
              />
              <button class="proto-btn proto-btn-secondary proto-btn-sm" type="button" @click="browsePrototype">
                <span class="mdi mdi-folder-open-outline"></span>
                Browse…
              </button>
            </div>
            <div class="proto-folder-preview" v-if="prototypeEntries.length">
              <span class="proto-folder-preview-label">{{ prototypeName }} contains:</span>
              <span
                v-for="e in prototypeEntries.slice(0, 14)"
                :key="e.name"
                class="proto-chip"
                :class="{ 'proto-chip-folder': e.type === 'folder' }"
              >{{ e.name }}</span>
              <span v-if="prototypeEntries.length > 14" class="proto-chip proto-chip-more">
                +{{ prototypeEntries.length - 14 }} more
              </span>
            </div>
          </div>

          <p class="proto-agent-info" v-if="defaultAgent">
            Using <strong>{{ defaultAgent }}</strong> as the coding agent.
          </p>
          <p class="proto-agent-warning" v-else>
            <span class="mdi mdi-alert-outline"></span>
            No default agent configured. Go to Settings &gt; Coding Agents to set one up.
          </p>

          <!-- Skill picker on the landing card, matching Initiate Stack: choose
               and preview the skill BEFORE the agent launches. -->
          <div class="proto-skill-picker">
            <label class="proto-skill-picker-label">Skill / system prompt</label>
            <select
              class="proto-skill-picker-select"
              v-model="selectedSkill"
              @change="loadSelectedSkillContent"
            >
              <option value="">-- None --</option>
              <optgroup v-for="g in skillGroups" :key="g.category" :label="g.category">
                <option v-for="s in g.skills" :key="s.path" :value="s.path">{{ s.displayName }}</option>
              </optgroup>
            </select>
            <button
              v-if="selectedSkillContent"
              class="proto-skill-toggle"
              type="button"
              @click="showSkillPreview = !showSkillPreview"
            >
              <span class="mdi" :class="showSkillPreview ? 'mdi-chevron-up' : 'mdi-chevron-down'"></span>
              {{ showSkillPreview ? 'Hide' : 'Show' }} preview
            </button>
          </div>
          <pre
            v-if="selectedSkillContent && showSkillPreview"
            class="proto-skill-preview-inline"
          >{{ selectedSkillContent }}</pre>
        </div>
        <button
          class="proto-btn proto-btn-primary"
          :disabled="!defaultAgent || !selectedArch || !prototypePath"
          :title="startButtonTitle"
          @click="startSession"
        >
          <span class="mdi mdi-robot-outline"></span>
          Bootstrap Prototype{{ selectedSkillContent ? ' with selected skill' : '' }}
        </button>
      </div>
    </div>

    <!-- AI Session -->
    <div class="proto-session-wrap" v-if="sessionActive">
      <div class="proto-session-header">
        <span class="mdi mdi-robot-outline"></span>
        <span>AI-Guided Prototype Bootstrap</span>
        <span class="proto-agent-badge">{{ defaultAgent }}</span>
        <div class="proto-spacer"></div>
        <button class="proto-btn proto-btn-sm proto-btn-secondary" @click="stopSession">
          <span class="mdi mdi-stop"></span> End Session
        </button>
      </div>
      <div class="proto-split-pane">
        <div class="proto-context-panel" :style="{ width: panelWidth + 'px' }">
          <div class="proto-panel-header">
            <label class="proto-panel-label">Context &amp; Prompt</label>
          </div>
          <div class="proto-panel-body">
            <div class="proto-ctx-item" v-if="prototypePath">
              <span class="mdi mdi-folder-open-outline proto-ctx-icon"></span>
              <span>{{ prototypePath }}</span>
            </div>
            <div class="proto-ctx-item" v-if="selectedArch">
              <span class="mdi mdi-layers-outline proto-ctx-icon"></span>
              <span>{{ selectedArch }}</span>
            </div>
            <div class="proto-field-group" style="margin-top: 0.75rem;">
              <label class="proto-panel-label">Skill</label>
              <select class="proto-skill-select" v-model="selectedSkill" @change="loadSelectedSkillContent">
                <option value="">— No skill —</option>
                <optgroup v-for="g in skillGroups" :key="g.category" :label="g.category">
                  <option v-for="s in g.skills" :key="s.path" :value="s.path">{{ s.displayName }}</option>
                </optgroup>
              </select>
            </div>
            <div class="proto-prompt-section">
              <div class="proto-panel-label" style="margin-top: 0.75rem;">System Prompt</div>
              <p class="proto-prompt-text">{{ sessionPrompt }}</p>
            </div>
          </div>
        </div>
        <div class="proto-resize-handle" @mousedown="startResize"></div>
        <div class="proto-terminal-panel">
          <div ref="terminalContainer" class="proto-terminal"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { collectSkillFiles, filterSkillsByCategory, groupSkillFiles } from '@/utils/skills';
import { enableTerminalPaste } from '@/utils/terminalPaste';

// Module-scoped so the watchers below can refit / clean up without
// threading them through props.
let termInstance = null;
let fitAddon = null;
let resizeObserver = null;
let shellCleanup = null;
let exitCleanup = null;
let sessionCounter = 0;

export default {
  name: 'PlanBootstrapPrototypeView',
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

    const archFiles = ref([]);
    const selectedArch = ref('');

    // Prototype lives outside docs/, so it is picked from the filesystem
    // rather than the doc tree.
    const prototypePath = ref('');
    const prototypeName = ref('');
    const prototypeEntries = ref([]);
    // The path the listing below was read from — lets us drop a stale preview
    // when the user edits the path by hand instead of browsing.
    const pickedPath = ref('');

    const skillFiles = ref([]);
    const skillGroups = computed(() => groupSkillFiles(skillFiles.value));
    const selectedSkill = ref('');
    const selectedSkillContent = ref('');
    const showSkillPreview = ref(false);

    const startButtonTitle = computed(() => {
      if (!defaultAgent.value) return 'No coding agent configured';
      if (!selectedArch.value) return 'Select an architecture document — it sets the constraints the port must respect';
      if (!prototypePath.value) return 'Select the folder containing the prototype';
      return 'Start the interactive prototype bootstrap session';
    });

    async function loadContextFiles() {
      try {
        const tree = await window.electron.ipcRenderer.invoke('filetree:scan');
        if (!tree || !tree.children) return;

        const archFolder = tree.children.find(c => c.name === 'Architecture');
        if (archFolder && archFolder.children) {
          archFiles.value = archFolder.children.filter(f => f.type === 'file' && f.name.endsWith('.md'));
          if (archFiles.value.length === 1) selectedArch.value = archFiles.value[0].path;
        }
      } catch (_) { /* silent — the user can pick manually */ }
    }

    async function browsePrototype() {
      try {
        const result = await window.electron.ipcRenderer.invoke('dialog:selectDirectory', {
          title: 'Select Prototype Folder',
          defaultPath: prototypePath.value || undefined,
        });
        if (!result || !result.success) return;
        prototypePath.value = result.path;
        pickedPath.value = result.path;
        prototypeName.value = result.name || '';
        prototypeEntries.value = result.entries || [];
      } catch (_) {}
    }

    // A hand-typed path has no listing behind it — drop the stale preview.
    watch(prototypePath, (val) => {
      if (val !== pickedPath.value) {
        prototypeEntries.value = [];
        prototypeName.value = '';
      }
    });

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
        skillFiles.value = filterSkillsByCategory(collectSkillFiles(tree), 'Bootstrapping');
        // Auto-select the Bootstrap Prototype skill — this view exists to drive
        // exactly that flow. Fall back to the first skill if not present.
        const match = skillFiles.value.find(s => /bootstrap[ _-]?prototype/i.test(s.name))
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
      if (!defaultAgent.value || !selectedArch.value || !prototypePath.value) return;
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
      enableTerminalPaste(term);
      termInstance = term;

      const shellId = 'bootstrap-proto-' + (++sessionCounter);
      currentShellId.value = shellId;

      const contextParts = [
        `The prototype to incorporate lives at "${prototypePath.value}" — treat it as READ-ONLY reference material and never write to it`,
        `the Architecture document is at "docs/${selectedArch.value}"`,
      ];

      const skillPrefix = selectedSkillContent.value ? selectedSkillContent.value + '\n\n---\n\n' : '';
      const prompt = `${skillPrefix}${contextParts.join(', and ')}. Also read the engineering guide at ".ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md" to understand the project conventions.

Apply the Bootstrap Prototype skill above to fold the prototype into this repository as the first increment of the real application. This is an INTERACTIVE session — talk to me at each checkpoint and wait for my answer.

Governing principle: stay as TRUE TO THE PROTOTYPE AS POSSIBLE — its screens, layout, copy, flows, behaviour and sample data are the specification — while respecting the constraints set out in the architecture document, which governs language, framework, directory layout, layering, and data access. Where the two collide, the architecture wins on structure and technology, but the prototype's observable behaviour must be preserved, and you must tell me about every such deviation.

Follow every step:
  1. Inventory the prototype and the repository, and report what you found.
  2. Report the fit and the full delta list, then WAIT for me to confirm the plan before writing any code.
  3. Port the prototype screen by screen into the layout the architecture prescribes. Do not "improve" it, do not add features, do not drop rough edges.
  4. Install dependencies and build the project.
  5. BUILD AND RUN the application, tell me the exact command and the URL/window to look at, and ask me to verify it against the prototype. Fix any differences I report and re-run until I confirm. You are not done until I have confirmed.
  6. Write docs/Architecture/prototype-port.md recording the file-by-file map, every deviation and its architectural reason, and the verified build/run commands.
  7. Shut down any dev server or watcher you started, then commit the port with a single clear message.

Do not create epics or backlog tickets. Start with Step 1 and report your inventory, then ask me to confirm the plan.`;

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
    // when the view becomes visible again.
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
      archFiles, selectedArch,
      prototypePath, prototypeName, prototypeEntries, browsePrototype,
      skillFiles, skillGroups, selectedSkill, selectedSkillContent, showSkillPreview, loadSelectedSkillContent,
      startButtonTitle, startSession, stopSession, startResize,
    };
  },
};
</script>

<style scoped>
.proto-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-color); color: var(--text-color); }
.proto-list-view { padding: 2rem; overflow-y: auto; flex: 1; }
.proto-header { margin-bottom: 1.5rem; }
.proto-header h1 { margin: 0 0 0.25rem; font-size: 1.5rem; font-weight: 600; }
.proto-subtitle { margin: 0; color: var(--text-muted); font-size: 0.9rem; }

.proto-create-card {
  display: flex; align-items: flex-start; gap: 1.25rem; padding: 1.5rem;
  border-radius: 8px; background: var(--card-bg); border: 1px solid var(--border-color); max-width: 100%;
  box-shadow: var(--box-shadow);
}
.proto-create-icon { font-size: 2rem; color: #6dd4a0; flex-shrink: 0; margin-top: 0.15rem; }
.proto-create-info { flex: 1; min-width: 0; }
.proto-create-info h3 { margin: 0 0 0.5rem; font-size: 1.05rem; }
.proto-create-info p { margin: 0 0 0.75rem; font-size: 0.88rem; line-height: 1.6; color: var(--text-muted); font-weight: 300; }
.proto-create-info code { background: var(--secondary-color); padding: 0.05rem 0.3rem; border-radius: 3px; font-size: 0.82em; }

.proto-warning-note {
  display: flex; align-items: center; gap: 0.4rem;
  font-size: 0.82rem !important; color: #b87f0e !important;
}
[data-theme="dark"] .proto-warning-note { color: #e5a830 !important; }

.proto-context-grid {
  display: grid; grid-template-columns: 1fr; gap: 0.6rem 1rem; margin: 0.75rem 0;
}
.proto-context-label {
  display: block; font-size: 0.72rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--text-muted); margin-bottom: 0.2rem;
}
.proto-context-select {
  width: 100%; padding: 0.35rem 0.5rem; border: 1px solid var(--border-color); border-radius: 5px;
  background: var(--bg-color); color: var(--text-color); font-size: 0.85rem; cursor: pointer; outline: none;
}
.proto-context-select:focus { border-color: #6dd4a0; }

/* Prototype folder picker */
.proto-folder-field { margin: 0.75rem 0; }
.proto-folder-row { display: flex; align-items: center; gap: 0.5rem; }
.proto-folder-input {
  flex: 1; min-width: 0; padding: 0.4rem 0.55rem;
  border: 1px solid var(--border-color); border-radius: 5px;
  background: var(--bg-color); color: var(--text-color);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.8rem; outline: none;
}
.proto-folder-input:focus { border-color: #6dd4a0; }
.proto-folder-preview {
  display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; margin-top: 0.5rem;
}
.proto-folder-preview-label {
  font-size: 0.72rem; color: var(--text-muted); margin-right: 0.2rem;
}
.proto-chip {
  padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.72rem;
  background: var(--secondary-color); color: var(--text-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.proto-chip-folder { color: #6dd4a0; }
.proto-chip-more { font-style: italic; }

.proto-agent-info { font-size: 0.82rem; color: var(--text-muted); }

/* Skill picker on the landing card */
.proto-skill-picker {
  display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.75rem;
}
.proto-skill-picker-label {
  font-size: 0.78rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--text-muted);
}
.proto-skill-picker-select {
  flex: 1; min-width: 200px; padding: 0.4rem 0.55rem;
  border: 1px solid var(--border-color); border-radius: 5px;
  background: var(--bg-color); color: var(--text-color);
  font-size: 0.85rem; cursor: pointer; outline: none;
}
.proto-skill-picker-select:focus { border-color: #6dd4a0; }
.proto-skill-toggle {
  display: inline-flex; align-items: center; gap: 0.25rem;
  padding: 0.35rem 0.65rem; border: 1px solid var(--border-color); border-radius: 5px;
  background: transparent; color: var(--text-muted); cursor: pointer; font-size: 0.78rem;
}
.proto-skill-toggle:hover { color: var(--text-color); border-color: #6dd4a0; }
.proto-skill-preview-inline {
  max-height: 320px; overflow-y: auto; margin: 0.5rem 0 0; padding: 0.75rem 1rem;
  border: 1px solid var(--border-color); border-radius: 5px; background: var(--bg-color);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.78rem; line-height: 1.55; color: var(--text-color);
  white-space: pre-wrap; word-break: break-word;
}
.proto-agent-warning { display: flex; align-items: center; gap: 0.3rem; font-size: 0.82rem; color: #b87f0e; }
[data-theme="dark"] .proto-agent-warning { color: #e5a830; }

.proto-btn {
  display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.55rem 1.1rem;
  border: none; border-radius: 6px; font-size: 0.85rem; font-weight: 500;
  cursor: pointer; transition: all 0.15s; white-space: nowrap;
}
.proto-btn-primary { background: #6dd4a0; color: #0A1220; }
.proto-btn-primary:hover:not(:disabled) { background: #86efac; }
.proto-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.proto-btn-secondary { background: var(--secondary-color); color: var(--text-muted); }
.proto-btn-secondary:hover { background: var(--border-color); }
.proto-btn-sm { padding: 0.35rem 0.75rem; font-size: 0.8rem; }

/* Session split-pane */
.proto-session-wrap { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.proto-session-header {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem;
  background: var(--card-bg); border-bottom: 1px solid var(--border-color);
  font-size: 0.82rem; color: var(--text-color); flex-shrink: 0;
}
.proto-agent-badge { background: rgba(109,212,160,0.12); color: #6dd4a0; padding: 0.15rem 0.5rem; border-radius: 10px; font-size: 0.72rem; font-weight: 600; }
.proto-spacer { flex: 1; }
.proto-split-pane { flex: 1; display: flex; overflow: hidden; }
.proto-context-panel { display: flex; flex-direction: column; overflow: hidden; background: var(--card-bg); border-right: 1px solid var(--border-color); flex-shrink: 0; color: var(--text-color); }
.proto-panel-header { padding: 0.75rem; border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
.proto-panel-label { font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6dd4a0; }
.proto-panel-body { flex: 1; overflow-y: auto; padding: 1rem; }
.proto-ctx-item { display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.78rem; color: var(--text-muted); margin-bottom: 0.3rem; word-break: break-all; }
.proto-ctx-icon { font-size: 1rem; color: #6dd4a0; flex-shrink: 0; }
.proto-prompt-section { margin-top: 0.5rem; }
.proto-prompt-text { font-size: 0.75rem; line-height: 1.55; color: var(--text-muted); font-weight: 300; margin: 0.3rem 0 0; white-space: pre-wrap; }

.proto-skill-select {
  width: 100%; padding: 0.4rem 0.5rem; border: 1px solid var(--border-color); border-radius: 5px;
  background: var(--bg-color); color: var(--text-color); font-size: 0.82rem; cursor: pointer; outline: none; margin-top: 0.3rem;
}
.proto-skill-select:focus { border-color: #6dd4a0; }
.proto-field-group .proto-panel-label { display: block; }

.proto-resize-handle { width: 6px; cursor: col-resize; background: transparent; flex-shrink: 0; position: relative; }
.proto-resize-handle::after { content: ''; position: absolute; top: 0; bottom: 0; left: 2px; width: 2px; background: var(--border-color); transition: background 0.15s; }
.proto-resize-handle:hover::after { background: #6dd4a0; }
.proto-terminal-panel { flex: 1; display: flex; min-width: 0; }
.proto-terminal { flex: 1; background: #0A1220; position: relative; }
.proto-terminal :deep(.xterm) { position: absolute; top: 0; left: 0; right: 0; bottom: 0; padding: 0.5rem; }
.proto-terminal :deep(.xterm-screen) { height: 100% !important; }
.proto-terminal :deep(.xterm-viewport) { overflow-y: auto !important; }
</style>
