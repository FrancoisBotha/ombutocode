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
          <h3>{{ epics.length ? 'Create Epic' : 'Create Initial Epics' }}</h3>
          <p>
            Launch an AI session to analyse your PRD and break it down into epics —
            each representing a deliverable milestone with clear scope and acceptance criteria.
          </p>

          <div class="epics-context-grid">
            <div class="epics-context-field">
              <label class="epics-context-label">PRD Document</label>
              <select class="epics-context-select" v-model="selectedPrd">
                <option value="">-- None --</option>
                <option v-for="f in prdFiles" :key="f.path" :value="f.path">{{ f.name }}</option>
              </select>
            </div>
            <div class="epics-context-field">
              <label class="epics-context-label">Data Model</label>
              <select class="epics-context-select" v-model="selectedDataModel">
                <option value="">-- None --</option>
                <option v-for="f in dataModelFiles" :key="f.path" :value="f.path">{{ f.name }}</option>
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
              <label class="epics-context-label">Style Guide</label>
              <select class="epics-context-select" v-model="selectedStyleGuide">
                <option value="">-- None --</option>
                <option v-for="f in styleGuideFiles" :key="f.path" :value="f.path">{{ f.name }}</option>
              </select>
            </div>
          </div>

          <p class="epics-agent-info" v-if="defaultAgent">
            Using <strong>{{ defaultAgent }}</strong> as the coding agent.
          </p>
          <p class="epics-agent-warning" v-else>
            <span class="mdi mdi-alert-outline"></span>
            No default agent configured. Go to Settings &gt; Coding Agents to set one up.
          </p>
        </div>
        <button
          class="epics-btn epics-btn-primary"
          :disabled="!defaultAgent || !selectedPrd"
          :title="epics.length ? 'Ask the agent to propose one additional epic that fits the existing set' : 'Ask the agent to break the PRD into the initial epic set'"
          @click="startSession(epics.length ? 'single' : 'bulk')"
        >
          <span class="mdi mdi-robot-outline"></span>
          {{ epics.length ? 'Create One Epic with AI' : 'Create Initial Epics' }}
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
              <td class="col-status"><span class="epic-status-badge" :class="'status-' + (epic.status || 'NEW').toLowerCase()">{{ epic.status || 'NEW' }}</span></td>
              <td class="col-path">{{ epic.path }}</td>
              <td class="col-actions">
                <button
                  class="epics-refine-btn"
                  :disabled="!defaultAgent || !selectedPrd"
                  :title="defaultAgent && selectedPrd ? 'Refine this epic with AI' : 'Select a PRD (and configure an agent) to refine'"
                  @click.stop="startSession('refine', epic.path)"
                >
                  <span class="mdi mdi-robot-outline"></span> Refine
                </button>
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
            <div class="epics-ctx-item" v-if="selectedStyleGuide">
              <span class="mdi mdi-palette-outline epics-ctx-icon"></span>
              <span>{{ selectedStyleGuide }}</span>
            </div>
            <div class="epics-field-group" style="margin-top: 0.75rem;">
              <label class="epics-panel-label">Skill</label>
              <select class="epics-skill-select" v-model="selectedSkill" @change="loadSelectedSkillContent">
                <option value="">— No skill —</option>
                <option v-for="s in skillFiles" :key="s.path" :value="s.path">{{ s.displayName }}</option>
              </select>
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
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';

let termInstance = null;
let fitAddon = null;
let resizeObserver = null;
let shellCleanup = null;
let exitCleanup = null;
let sessionCounter = 0;

const EPIC_TEMPLATE = `# Epic: {NAME}

Status: NEW
Owner: human
Created: ${new Date().toISOString().split('T')[0]}
Last Updated: ${new Date().toISOString().split('T')[0]}

---

## 1. Purpose

_Describe what this epic delivers and why it matters._

---

## 2. User Story

As a [role],
I want [capability],
So that [benefit].

---

## 3. Scope

### In Scope
-

### Out of Scope
-

---

## 4. Functional Requirements

1.

---

## 5. Non-Functional Requirements

-

---

## 6. UI/UX Notes

_Describe key UI elements, layouts, or interactions._

---

## 7. Data Model Impact

_Describe any new entities, field changes, or migrations._

---

## 8. Integration Impact

_List affected systems, APIs, or services._

---

## 9. Acceptance Criteria

Epic is complete when:

- [ ]
- [ ]

---

## 10. Risks & Unknowns

-

---

## 11. Dependencies

-

---

## 12. References

- prd: docs/Product Requirements Document/PRD.md
- architecture: docs/Architecture/Architecture.md

---

## 13. Implementation Notes (For Planning Agent)

Suggested ticket breakdown:

1.

Expected complexity:
Estimated total effort:
`;

export default {
  name: 'PlanEpicsView',
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
    const panelWidth = ref(300);

    const epics = ref([]);
    const prdFiles = ref([]);
    const archFiles = ref([]);
    const dataModelFiles = ref([]);
    const selectedPrd = ref('');
    const selectedArch = ref('');
    const selectedDataModel = ref('');
    const styleGuideFiles = ref([]);
    const selectedStyleGuide = ref('');

    // Skill selection (Epic Generation skill from docs/Skills/)
    const skillFiles = ref([]);
    const selectedSkill = ref('');
    const selectedSkillContent = ref('');

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
              let status = 'NEW';
              try {
                const content = await window.electron.ipcRenderer.invoke('filetree:readFile', f.path);
                // Check frontmatter
                const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
                if (fmMatch) {
                  const statusMatch = fmMatch[1].match(/^status:\s*(.+)/m);
                  if (statusMatch) status = statusMatch[1].trim();
                }
                // Also check "Status: X", "**Status:** X", "- **Status:** X" in markdown body
                const bodyStatus = content.match(/\bStatus:\*?\*?\s*(.+)/im);
                if (bodyStatus) {
                  const parsed = bodyStatus[1].replace(/\*\*/g, '').trim();
                  if (parsed) status = parsed;
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

          const sgFolder = tree.children.find(c => c.name === 'Style Guide');
          if (sgFolder && sgFolder.children) {
            styleGuideFiles.value = sgFolder.children.filter(f => f.type === 'file' && f.name.endsWith('.md'));
            if (styleGuideFiles.value.length === 1) selectedStyleGuide.value = styleGuideFiles.value[0].path;
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

    // Session "mode" decides what we ask the agent to do:
    //   'bulk'    — propose the initial epic set (no epics exist yet)
    //   'single'  — add ONE new epic that complements the existing set
    //   'refine'  — open the named epic file and propose a refined version
    async function startSession(mode = 'bulk', targetEpicPath = null) {
      if (!defaultAgent.value || !selectedPrd.value) return;

      // Pick the most appropriate skill for the chosen mode. Bulk uses the
      // whole-PRD breakdown skill; single/refine uses the focused per-epic
      // skill. Fall back to whatever's currently selected if neither match
      // exists (user may have a custom skill set).
      const preferredSkillKeyword = (mode === 'refine' || mode === 'single') ? 'refinement' : 'generation';
      const skillMatch = skillFiles.value.find(s => s.name.toLowerCase().includes(`epic ${preferredSkillKeyword}`))
        || skillFiles.value.find(s => s.name.toLowerCase().includes(preferredSkillKeyword));
      if (skillMatch && skillMatch.path !== selectedSkill.value) {
        selectedSkill.value = skillMatch.path;
        await loadSelectedSkillContent();
      }

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
      if (selectedStyleGuide.value) contextParts.push(`the Style Guide at "docs/${selectedStyleGuide.value}"`);

      const skillPrefix = selectedSkillContent.value ? selectedSkillContent.value + '\n\n---\n\n' : '';
      const baseContext = `${contextParts.join(', and ')}. Also read the engineering guide at ".ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md" to understand the project conventions and ticket workflow.`;

      // List of existing epic stems so the agent doesn't duplicate work.
      const existingEpicLines = epics.value.length
        ? epics.value.map(e => `- ${e.name.replace(/\.md$/, '')} (${e.status || 'NEW'})`).join('\n')
        : '(none yet)';

      let instruction;
      if (mode === 'refine' && targetEpicPath) {
        instruction = `Refine the epic at "docs/${targetEpicPath}". First, read that file in full. Then propose specific edits to tighten its purpose, scope, acceptance criteria, FR/NFR cross-references, dependencies, and any other section that needs work. Ask me to confirm each significant edit before writing changes. Keep the existing numeric prefix and \`Status:\` value untouched unless I explicitly ask to change them.

Existing epics for context (do not duplicate scope across them):
${existingEpicLines}`;
      } else if (mode === 'single') {
        instruction = `Apply the Epic Generation skill above to propose ONE NEW epic that fills a gap in the existing set. Do NOT redo the whole epic breakdown. Identify what's missing relative to the source documents above, then propose a single epic with title + one-line summary and ask me to confirm before creating the file. Pick the next available numeric prefix (continue from the highest \`epic_NN_\` already in use).

Existing epics (do not duplicate scope):
${existingEpicLines}`;
      } else {
        instruction = `Apply the Epic Generation skill above to produce the initial epic set. Start by proposing the list of epics with a one-line summary for each. Ask me to confirm before creating the files.`;
      }

      const prompt = `${skillPrefix}${baseContext}

${instruction}`;

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

    async function loadSkills() {
      try {
        const tree = await window.electron.ipcRenderer.invoke('filetree:scan');
        if (tree && tree.children) {
          const folder = tree.children.find(c => c.name === 'Skills');
          if (folder && folder.children) {
            skillFiles.value = folder.children
              .filter(f => f.type === 'file' && f.name.endsWith('.md'))
              .map(f => ({ path: f.path, name: f.name, displayName: f.name.replace('.md', '').replace(/_/g, ' ') }));
            // Default to Epic Generation on mount — it's the right starting point
            // for the bulk-create flow on a fresh project. startSession() switches
            // to Epic Refinement when the user picks the single/refine mode.
            const match = skillFiles.value.find(s => s.name.toLowerCase().includes('epic generation'))
              || skillFiles.value.find(s => s.name.toLowerCase().includes('epic'));
            if (match) {
              selectedSkill.value = match.path;
              await loadSelectedSkillContent();
            }
          }
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

    onMounted(() => {
      loadEpics();
      loadContextFiles();
      loadDefaultAgent();
      loadSkills();
    });

    // Refit xterm when this view re-appears (xterm can't measure while display:none).
    // Also pick up a refine handoff set by FilePreviewView's "Refine with AI" button:
    // if `window.__planEpicsRefinePath` is set, launch a refine session for that
    // epic and clear the flag so it fires once per click.
    watch(() => props.visible, (isVisible) => {
      if (!isVisible) return;
      if (fitAddon) {
        requestAnimationFrame(() => { try { fitAddon.fit(); } catch (_) {} });
      }
      // The view stays mounted across Plan navigation (v-show), so onMounted
      // only fires once. Refresh the epic list on every visit so newly-created
      // epics (e.g. from FilePreview or external file changes) show up.
      loadEpics();
      const refinePath = window.__planEpicsRefinePath;
      if (refinePath) {
        window.__planEpicsRefinePath = null;
        // If a refine session is already running, leave the user where they are.
        if (sessionActive.value) return;
        // Defer to next tick so loadEpics() / loadContextFiles() have a chance
        // to populate selectedPrd from defaults on first visit.
        nextTick(() => {
          if (defaultAgent.value && selectedPrd.value) {
            startSession('refine', refinePath);
          } else {
            console.warn('[PlanEpicsView] Refine handoff received but agent or PRD not yet configured; ignoring.');
          }
        });
      }
    });

    onBeforeUnmount(() => {
      if (currentShellId.value) window.electron.ipcRenderer.invoke('workspace:killShell', currentShellId.value);
      cleanup();
    });

    return {
      sessionActive, terminalContainer, defaultAgent, sessionPrompt, panelWidth,
      epics, prdFiles, archFiles, dataModelFiles, styleGuideFiles, selectedPrd, selectedArch, selectedDataModel, selectedStyleGuide,
      skillFiles, selectedSkill, loadSelectedSkillContent,
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
  background: var(--bg-color); color: var(--text-color);
}

.epics-list-view { padding: 2rem; overflow-y: auto; flex: 1; }
.epics-header { margin-bottom: 1.5rem; }
.epics-header h1 { margin: 0 0 0.25rem; font-size: 1.5rem; font-weight: 600; }
.epics-subtitle { margin: 0; color: var(--text-muted); font-size: 0.9rem; }

/* Create card */
.epics-create-card {
  display: flex; align-items: flex-start; gap: 1.25rem; padding: 1.5rem;
  border-radius: 8px; background: var(--card-bg); border: 1px solid var(--border-color); max-width: 100%; margin-bottom: 1.5rem;
  box-shadow: var(--box-shadow);
}
.epics-create-icon { font-size: 2rem; color: #6dd4a0; flex-shrink: 0; margin-top: 0.15rem; }
.epics-create-info { flex: 1; }
.epics-create-info h3 { margin: 0 0 0.5rem; font-size: 1.05rem; }
.epics-create-info p { margin: 0; font-size: 0.88rem; line-height: 1.6; color: var(--text-muted); font-weight: 300; }
.epics-agent-info { margin-top: 0.5rem !important; font-size: 0.82rem !important; color: var(--text-muted) !important; }
.epics-agent-warning { margin-top: 0.5rem !important; font-size: 0.82rem !important; color: #b87f0e !important; display: flex; align-items: center; gap: 0.3rem; }

.epics-context-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 1rem; margin: 0.75rem 0 0; }
.epics-context-field { display: flex; flex-direction: column; gap: 0.2rem; }
.epics-context-label { font-size: 0.72rem; font-weight: 600; color: var(--text-muted); }
.epics-context-select {
  padding: 0.4rem 0.5rem; border: 1px solid var(--border-color); border-radius: 5px;
  background: var(--bg-color); color: var(--text-color); font-size: 0.82rem; cursor: pointer; outline: none; max-width: 350px;
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
.epics-btn-secondary { background: var(--secondary-color); color: var(--text-color); }
.epics-btn-secondary:hover { background: var(--border-color); }
.epics-btn-sm { padding: 0.35rem 0.75rem; font-size: 0.8rem; }

/* Table */
.epics-table-section { margin-bottom: 1.5rem; max-width: 100%; }
.epics-table-section h2 { font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); margin: 0 0 0.5rem; }
.epics-table { width: 100%; border-collapse: collapse; }
.epics-table th {
  text-align: left; padding: 0.5rem 0.75rem; font-size: 0.7rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted);
  border-bottom: 1px solid var(--border-color);
}
.epics-table td { padding: 0.55rem 0.75rem; border-bottom: 1px solid var(--border-color); }
.epics-row { cursor: pointer; transition: background 0.1s; }
.epics-row:hover { background: var(--secondary-color); }
.col-name { font-size: 0.88rem; color: var(--text-color); font-weight: 400; }
.col-path { font-size: 0.72rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--text-muted); }
.col-status { width: 100px; }
.epic-status-badge {
  display: inline-block; padding: 0.15rem 0.5rem; border-radius: 10px;
  font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em;
}
.status-new { background: rgba(91,155,213,0.15); color: #4a90e2; }
.status-draft { background: var(--secondary-color); color: var(--text-muted); }
.status-tickets { background: rgba(229,168,48,0.15); color: #b87f0e; }
/* Default (light mode): darker green for readability on the pale chip bg. */
.status-building { background: rgba(109,212,160,0.2); color: #2aa05f; }
/* Dark mode: restore brand-exact green — readable on its dark background. */
[data-theme="dark"] .status-building { background: rgba(109,212,160,0.15); color: #6dd4a0; }
.status-done { background: rgba(109,212,160,0.25); color: #2aa05f; }
.col-actions { width: 180px; text-align: right; white-space: nowrap; }
.epics-refine-btn {
  display: inline-flex; align-items: center; gap: 0.3rem;
  background: transparent; border: 1px solid var(--border-color); color: var(--text-muted);
  cursor: pointer; padding: 0.25rem 0.55rem; border-radius: 4px; font-size: 0.78rem;
  margin-right: 0.4rem; opacity: 0; transition: all 0.15s;
}
.epics-refine-btn .mdi { font-size: 0.95rem; }
.epics-row:hover .epics-refine-btn { opacity: 1; }
.epics-refine-btn:hover:not(:disabled) { color: #6dd4a0; border-color: #6dd4a0; background: rgba(109,212,160,0.08); }
.epics-refine-btn:disabled { cursor: not-allowed; opacity: 0.3; }
.epics-delete-btn {
  background: transparent; border: none; color: var(--text-muted); cursor: pointer;
  padding: 0.2rem; border-radius: 4px; opacity: 0; transition: all 0.15s;
}
.epics-row:hover .epics-delete-btn { opacity: 1; }
.epics-delete-btn:hover { color: #e06060; background: rgba(224,96,96,0.1); }

/* Manual create */
.epics-manual-create { max-width: 100%; margin-bottom: 1.5rem; }
.epics-new-input-wrap { display: flex; align-items: center; gap: 0.5rem; }
.epics-new-input {
  padding: 0.45rem 0.7rem; border: 1px solid var(--border-color); border-radius: 6px;
  background: var(--card-bg); color: var(--text-color); font-size: 0.88rem; width: 300px; outline: none;
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

.epics-skill-select {
  width: 100%; padding: 0.4rem 0.5rem; border: 1px solid var(--border-color); border-radius: 5px;
  background: var(--bg-color); color: var(--text-color); font-size: 0.82rem; cursor: pointer; outline: none; margin-top: 0.3rem;
}
.epics-skill-select:focus { border-color: #6dd4a0; }
.epics-field-group .epics-panel-label { display: block; }
.epics-resize-handle { width: 6px; cursor: col-resize; background: transparent; flex-shrink: 0; position: relative; }
.epics-resize-handle::after { content: ''; position: absolute; top: 0; bottom: 0; left: 2px; width: 2px; background: rgba(255,255,255,0.06); transition: background 0.15s; }
.epics-resize-handle:hover::after { background: #6dd4a0; }

.epics-terminal-panel { flex: 1; display: flex; min-width: 0; }
.epics-terminal { flex: 1; background: #0A1220; position: relative; }
.epics-terminal :deep(.xterm) { position: absolute; top: 0; left: 0; right: 0; bottom: 0; padding: 0.5rem; }
.epics-terminal :deep(.xterm-screen) { height: 100% !important; }
.epics-terminal :deep(.xterm-viewport) { overflow-y: auto !important; }
</style>
