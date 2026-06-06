<template>
  <div class="bdd-view">
    <!-- LIST MODE: header, create card, list table, detail preview -->
    <div class="bdd-list-view" v-if="!sessionActive">
      <div class="bdd-header">
        <div>
          <h1>BDD User Stories</h1>
          <p class="bdd-subtitle">Lightweight As-A / I-Want / So-That stories with Given-When-Then scenarios — a faster path than full epics for single-capability work.</p>
        </div>
      </div>

      <!-- Create card: skill picker + start AI session -->
      <div class="bdd-create-card">
        <div class="bdd-create-row">
          <span class="mdi mdi-format-list-checks bdd-create-icon"></span>
          <div class="bdd-create-text">
            <h3>{{ bddUseCases.length ? 'Create another BDD User Story' : 'Create your first BDD User Story' }}</h3>
            <p>
              Launch an AI session that walks you through the As-A / I-Want / So-That story
              and 2-5 Given-When-Then acceptance scenarios. Each BDD user story becomes the source for
              1-3 implementation tickets via <em>BDD Ticket Generation</em>.
            </p>
            <p class="bdd-agent-info" v-if="defaultAgent">
              Using <strong>{{ defaultAgent }}</strong> as the coding agent.
            </p>
            <p class="bdd-agent-warning" v-else>
              <span class="mdi mdi-alert-outline"></span>
              No default agent configured. Go to Settings &gt; Coding Agents to set one up.
            </p>
          </div>
        </div>

        <div class="bdd-skill-picker">
          <label class="bdd-skill-picker-label">Skill / system prompt</label>
          <select
            class="bdd-skill-picker-select"
            v-model="selectedCreateSkill"
            @change="loadCreateSkillContent"
          >
            <option value="">-- None --</option>
            <optgroup v-for="g in skillGroups" :key="g.category" :label="g.category">
              <option v-for="s in g.skills" :key="s.path" :value="s.path">{{ s.displayName }}</option>
            </optgroup>
          </select>
          <button
            v-if="createSkillContent"
            class="bdd-skill-toggle"
            type="button"
            @click="showCreateSkillPreview = !showCreateSkillPreview"
          >
            <span class="mdi" :class="showCreateSkillPreview ? 'mdi-chevron-up' : 'mdi-chevron-down'"></span>
            {{ showCreateSkillPreview ? 'Hide' : 'Show' }} preview
          </button>
        </div>
        <pre
          v-if="createSkillContent && showCreateSkillPreview"
          class="bdd-skill-preview-inline"
        >{{ createSkillContent }}</pre>

        <div class="bdd-create-actions">
          <button
            class="bdd-btn bdd-btn-primary"
            :disabled="!defaultAgent"
            @click="startCreateSession"
          >
            <span class="mdi mdi-robot-outline"></span>
            Create BDD User Story{{ createSkillContent ? ' with selected skill' : '' }}
          </button>
        </div>
      </div>

      <!-- Listing -->
      <div v-if="bddUseCases.length" class="bdd-list-section">
        <h2>Existing BDD User Stories</h2>
        <div class="bdd-split">
          <table class="bdd-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th class="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="uc in bddUseCases"
                :key="uc.path"
                class="bdd-row"
                :class="{ selected: selectedBdd && selectedBdd.path === uc.path }"
                @click="selectBdd(uc)"
              >
                <td class="col-name">{{ uc.displayName }}</td>
                <td class="col-status">
                  <span class="bdd-status-badge" :class="'status-' + (uc.status || 'NEW').toLowerCase()">{{ uc.status || 'NEW' }}</span>
                </td>
                <td class="col-actions">
                  <button
                    class="bdd-ticket-btn"
                    :disabled="!defaultAgent"
                    :title="defaultAgent ? 'Generate tickets from this BDD User Story' : 'No default agent configured'"
                    @click.stop="startTicketSession(uc)"
                  >
                    <span class="mdi mdi-robot-outline"></span> Create Ticket
                  </button>
                  <button
                    class="bdd-delete-btn"
                    title="Delete BDD User Story"
                    @click.stop="deleteBdd(uc)"
                  >
                    <span class="mdi mdi-delete-outline"></span>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <aside v-if="selectedBdd" class="bdd-detail markdown-body">
            <h3 class="bdd-detail-title">{{ selectedBdd.displayName }}</h3>
            <div class="bdd-detail-meta">
              <span class="bdd-status-badge" :class="'status-' + (selectedBdd.status || 'NEW').toLowerCase()">{{ selectedBdd.status || 'NEW' }}</span>
              <span class="bdd-detail-path">{{ selectedBdd.path }}</span>
            </div>
            <div class="bdd-detail-body" v-html="selectedBddRenderedHtml"></div>
          </aside>
          <aside v-else class="bdd-detail bdd-detail-empty">
            <span class="mdi mdi-arrow-left"></span>
            <p>Select a BDD User Story to preview it here.</p>
          </aside>
        </div>
      </div>
      <div v-else class="bdd-empty">
        <p>No BDD User Stories yet. Use the card above to create one.</p>
      </div>
    </div>

    <!-- SESSION MODE (create OR ticket-gen) -->
    <div class="bdd-session-wrap" v-if="sessionActive">
      <div class="bdd-session-header">
        <span class="mdi mdi-robot-outline"></span>
        <span>{{ sessionMode === 'ticket' ? 'BDD Ticket Generation' : 'AI-Guided BDD User Story Creation' }}</span>
        <span class="bdd-agent-badge">{{ defaultAgent }}</span>
        <span v-if="sessionMode === 'ticket' && currentBdd" class="bdd-session-subject">source: {{ currentBdd.displayName }}</span>
        <div class="bdd-spacer"></div>
        <button class="bdd-btn bdd-btn-sm bdd-btn-secondary" @click="stopSession">
          <span class="mdi mdi-stop"></span> End Session
        </button>
      </div>
      <div class="bdd-split-pane">
        <div class="bdd-context-panel" :style="{ width: panelWidth + 'px' }">
          <div class="bdd-panel-header">
            <label class="bdd-panel-label">Context &amp; Prompt</label>
          </div>
          <div class="bdd-panel-body">
            <div class="bdd-ctx-item" v-if="sessionMode === 'ticket' && currentBdd">
              <span class="mdi mdi-format-list-checks bdd-ctx-icon"></span>
              <span>{{ currentBdd.path }}</span>
            </div>
            <div class="bdd-prompt-section">
              <div class="bdd-panel-label" style="margin-top: 0.75rem;">System Prompt</div>
              <p class="bdd-prompt-text">{{ sessionPrompt }}</p>
            </div>
          </div>
        </div>
        <div class="bdd-resize-handle" @mousedown="startResize"></div>
        <div class="bdd-terminal-panel">
          <div ref="terminalContainer" class="bdd-terminal"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { marked } from 'marked';
import { collectSkillFiles, filterSkillsByCategory, groupSkillFiles } from '@/utils/skills';
import { enableTerminalPaste } from '@/utils/terminalPaste';

let termInstance = null;
let fitAddon = null;
let resizeObserver = null;
let shellCleanup = null;
let exitCleanup = null;
let sessionCounter = 0;

export default {
  name: 'PlanBddUseCasesView',
  emits: ['change-view'],
  props: {
    visible: { type: Boolean, default: true },
  },
  setup(props) {
    const sessionActive = ref(false);
    // 'create' (default for new sessions) or 'ticket' (generating tickets from a UC)
    const sessionMode = ref('create');
    const terminalContainer = ref(null);
    const defaultAgent = ref('');
    const currentShellId = ref('');
    const sessionPrompt = ref('');
    const panelWidth = ref(320);

    const bddUseCases = ref([]);
    const selectedBdd = ref(null);
    const currentBdd = ref(null);   // the UC the active session is operating on (ticket mode)

    const skillFiles = ref([]);
    const skillGroups = computed(() => groupSkillFiles(skillFiles.value));
    const selectedCreateSkill = ref('');
    const createSkillContent = ref('');
    const showCreateSkillPreview = ref(false);
    const ticketGenSkillContent = ref('');   // BDD Ticket Generation, loaded automatically

    const selectedBddRenderedHtml = computed(() =>
      selectedBdd.value && selectedBdd.value.content
        ? marked(selectedBdd.value.content, { breaks: true, gfm: true })
        : ''
    );

    // ── Loaders ──

    async function loadBddUseCases() {
      try {
        const tree = await window.electron.ipcRenderer.invoke('filetree:scan');
        if (!tree || !tree.children) return;
        const folder = tree.children.find(c => c.name === 'BDD Use Cases');
        if (!folder || !folder.children) { bddUseCases.value = []; return; }
        const files = folder.children.filter(f => f.type === 'file' && f.name.toLowerCase().endsWith('.md'));
        const loaded = [];
        for (const f of files) {
          let status = 'NEW';
          let content = '';
          try {
            content = await window.electron.ipcRenderer.invoke('filetree:readFile', f.path);
            const statusLine = content.split(/\r?\n/).find(l => /^status:/i.test(l));
            if (statusLine) {
              const m = statusLine.match(/^status:\s*\*?\*?\s*(.+?)\s*\*?\*?\s*$/i);
              if (m) status = m[1].trim();
            }
          } catch (_) {}
          loaded.push({
            name: f.name,
            path: f.path,
            displayName: f.name.replace(/^bdd_/i, '').replace(/\.md$/i, '').replace(/_/g, ' '),
            status,
            content,
          });
        }
        loaded.sort((a, b) => a.displayName.localeCompare(b.displayName));
        bddUseCases.value = loaded;
        // Refresh the selected UC if it still exists; otherwise drop it.
        if (selectedBdd.value) {
          selectedBdd.value = loaded.find(u => u.path === selectedBdd.value.path) || null;
        }
      } catch (_) {}
    }

    async function loadSkills() {
      try {
        const tree = await window.electron.ipcRenderer.invoke('filetree:scan');
        skillFiles.value = filterSkillsByCategory(collectSkillFiles(tree), 'BDD');
        // Auto-select the creation skill; load the ticket-gen skill in background.
        const createMatch = skillFiles.value.find(s => /simple[ _-]?bdd[ _-]?use[ _-]?case/i.test(s.name))
          || skillFiles.value.find(s => /bdd/i.test(s.name));
        if (createMatch) {
          selectedCreateSkill.value = createMatch.path;
          await loadCreateSkillContent();
        }
        const ticketMatch = skillFiles.value.find(s => /bdd[ _-]?ticket[ _-]?generation/i.test(s.name));
        if (ticketMatch) {
          try {
            const c = await window.electron.ipcRenderer.invoke('filetree:readFile', ticketMatch.path);
            ticketGenSkillContent.value = c.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '').trim();
          } catch (_) {}
        }
      } catch (_) {}
    }

    async function loadCreateSkillContent() {
      if (!selectedCreateSkill.value) { createSkillContent.value = ''; return; }
      try {
        const c = await window.electron.ipcRenderer.invoke('filetree:readFile', selectedCreateSkill.value);
        createSkillContent.value = c.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '').trim();
      } catch (_) { createSkillContent.value = ''; }
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

    // ── List actions ──

    function selectBdd(uc) { selectedBdd.value = uc; }

    async function deleteBdd(uc) {
      if (!confirm(`Delete "${uc.displayName}"? This removes the BDD user story file only — generated tickets stay in the backlog.`)) return;
      try {
        await window.electron.ipcRenderer.invoke('filetree:deleteFile', uc.path);
        bddUseCases.value = bddUseCases.value.filter(u => u.path !== uc.path);
        if (selectedBdd.value && selectedBdd.value.path === uc.path) selectedBdd.value = null;
      } catch (e) {
        console.error('Failed to delete BDD UC:', e);
      }
    }

    // ── Sessions ──

    async function startCreateSession() {
      if (!defaultAgent.value) return;
      sessionMode.value = 'create';
      currentBdd.value = null;
      await openSession();
    }

    async function startTicketSession(uc) {
      if (!defaultAgent.value || !uc) return;
      sessionMode.value = 'ticket';
      currentBdd.value = uc;
      await openSession();
    }

    async function openSession() {
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

      const shellId = 'bdd-' + sessionMode.value + '-' + (++sessionCounter);
      currentShellId.value = shellId;

      // Build prompt by mode.
      let skillBody = '';
      let instruction = '';
      if (sessionMode.value === 'ticket' && currentBdd.value) {
        skillBody = ticketGenSkillContent.value;
        instruction = `Generate tickets from the BDD Use Case at "docs/${currentBdd.value.path}". Read that file in full, propose a 1-3 ticket breakdown plus the mandatory closeout BDD-eval ticket, and follow the BDD Ticket Generation skill above to write them to the backlog. Confirm the ID prefix with me before writing.`;
      } else {
        skillBody = createSkillContent.value;
        instruction = `Apply the Simple BDD Use Case skill above. Ask me one question at a time: the capability, then the As-A/I-Want/So-That, then each acceptance scenario. Write the file to docs/BDD Use Cases/ with Status: NEW only after I confirm the full draft.`;
      }

      const skillPrefix = skillBody ? skillBody + '\n\n---\n\n' : '';
      const prompt = `${skillPrefix}Read the PRD at "docs/Product Requirements Document/PRD.md" and the engineering guide at ".ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md" for context.

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
      // The agent likely wrote a new BDD UC (create mode) or flipped Status to TICKETS
      // (ticket mode); refresh the list so the UI reflects on-disk state.
      loadBddUseCases();
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
      loadBddUseCases();
      loadDefaultAgent();
      loadSkills();
    });

    // v-show: refit + refresh list on revisit.
    watch(() => props.visible, (isVisible) => {
      if (!isVisible) return;
      if (fitAddon) requestAnimationFrame(() => { try { fitAddon.fit(); } catch (_) {} });
      loadBddUseCases();
    });

    onBeforeUnmount(() => {
      if (currentShellId.value) window.electron.ipcRenderer.invoke('workspace:killShell', currentShellId.value);
      cleanup();
    });

    return {
      sessionActive, sessionMode, terminalContainer, defaultAgent, sessionPrompt, panelWidth,
      bddUseCases, selectedBdd, currentBdd, selectedBddRenderedHtml,
      skillFiles, skillGroups, selectedCreateSkill, createSkillContent, showCreateSkillPreview,
      selectBdd, deleteBdd,
      startCreateSession, startTicketSession, stopSession, startResize,
      loadCreateSkillContent,
    };
  },
};
</script>

<style scoped>
.bdd-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-color); color: var(--text-color); }
.bdd-list-view { padding: 2rem; overflow-y: auto; flex: 1; }

.bdd-header { margin-bottom: 1.5rem; }
.bdd-header h1 { margin: 0 0 0.25rem; font-size: 1.5rem; font-weight: 600; }
.bdd-subtitle { margin: 0; color: var(--text-muted); font-size: 0.9rem; }

/* Create card */
.bdd-create-card {
  display: flex; flex-direction: column; gap: 1rem;
  padding: 1.5rem; border-radius: 8px; background: var(--card-bg);
  border: 1px solid var(--border-color); box-shadow: var(--box-shadow); margin-bottom: 1.5rem;
}
.bdd-create-row { display: flex; align-items: flex-start; gap: 1.25rem; }
.bdd-create-icon { font-size: 2rem; color: #6dd4a0; flex-shrink: 0; margin-top: 0.15rem; }
.bdd-create-text { flex: 1; }
.bdd-create-text h3 { margin: 0 0 0.5rem; font-size: 1.05rem; }
.bdd-create-text p { margin: 0 0 0.5rem; font-size: 0.88rem; line-height: 1.6; color: var(--text-muted); font-weight: 300; }
.bdd-create-actions { display: flex; justify-content: flex-end; }

.bdd-agent-info { font-size: 0.82rem; color: var(--text-muted); }
.bdd-agent-warning { display: flex; align-items: center; gap: 0.3rem; font-size: 0.82rem; color: #b87f0e; }
[data-theme="dark"] .bdd-agent-warning { color: #e5a830; }

.bdd-skill-picker { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.bdd-skill-picker-label { font-size: 0.78rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); }
.bdd-skill-picker-select {
  flex: 1; min-width: 200px; padding: 0.4rem 0.55rem;
  border: 1px solid var(--border-color); border-radius: 5px;
  background: var(--bg-color); color: var(--text-color); font-size: 0.85rem; cursor: pointer; outline: none;
}
.bdd-skill-picker-select:focus { border-color: #6dd4a0; }
.bdd-skill-toggle {
  display: inline-flex; align-items: center; gap: 0.25rem;
  padding: 0.35rem 0.65rem; border: 1px solid var(--border-color); border-radius: 5px;
  background: transparent; color: var(--text-muted); cursor: pointer; font-size: 0.78rem;
}
.bdd-skill-toggle:hover { color: var(--text-color); border-color: #6dd4a0; }
.bdd-skill-preview-inline {
  max-height: 320px; overflow-y: auto; margin: 0;
  padding: 0.75rem 1rem; border: 1px solid var(--border-color); border-radius: 5px;
  background: var(--bg-color); color: var(--text-color);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.78rem; line-height: 1.55; white-space: pre-wrap; word-break: break-word;
}

/* Buttons */
.bdd-btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.55rem 1.1rem; border: none; border-radius: 6px; font-size: 0.85rem; font-weight: 500; cursor: pointer; transition: all 0.15s; }
.bdd-btn-primary { background: #6dd4a0; color: #0A1220; }
.bdd-btn-primary:hover:not(:disabled) { background: #86efac; }
.bdd-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.bdd-btn-secondary { background: var(--secondary-color); color: var(--text-muted); }
.bdd-btn-secondary:hover { background: var(--border-color); color: var(--text-color); }
.bdd-btn-sm { padding: 0.35rem 0.75rem; font-size: 0.8rem; }

/* List + detail split */
.bdd-list-section h2 { font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); margin: 0 0 0.5rem; }
.bdd-split { display: grid; grid-template-columns: minmax(280px, 1fr) minmax(320px, 1.4fr); gap: 1rem; }
.bdd-table { width: 100%; border-collapse: collapse; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 6px; overflow: hidden; }
.bdd-table th { text-align: left; padding: 0.5rem 0.75rem; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); border-bottom: 1px solid var(--border-color); }
.bdd-table td { padding: 0.55rem 0.75rem; border-bottom: 1px solid var(--border-color); }
.bdd-row { cursor: pointer; transition: background 0.1s; }
.bdd-row:hover { background: var(--secondary-color); }
.bdd-row.selected { background: var(--secondary-color); }
.col-name { font-size: 0.88rem; color: var(--text-color); font-weight: 400; }
.col-status { width: 110px; }
.col-actions { width: 200px; text-align: right; white-space: nowrap; }

.bdd-status-badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 10px; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
.status-new { background: rgba(91,155,213,0.18); color: #4a90e2; }
.status-tickets { background: rgba(229,168,48,0.18); color: #b87f0e; }
.status-building { background: rgba(109,212,160,0.2); color: #2aa05f; }
.status-done { background: rgba(60,199,122,0.18); color: #2aa05f; }
[data-theme="dark"] .status-building { background: rgba(109,212,160,0.15); color: #6dd4a0; }

.bdd-ticket-btn {
  display: inline-flex; align-items: center; gap: 0.3rem;
  background: transparent; border: 1px solid var(--border-color); color: var(--text-muted);
  cursor: pointer; padding: 0.25rem 0.55rem; border-radius: 4px; font-size: 0.78rem;
  margin-right: 0.4rem; transition: all 0.15s;
}
.bdd-ticket-btn:hover:not(:disabled) { color: #6dd4a0; border-color: #6dd4a0; background: rgba(109,212,160,0.08); }
.bdd-ticket-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bdd-delete-btn { background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 0.2rem; border-radius: 4px; opacity: 0.6; transition: all 0.15s; }
.bdd-row:hover .bdd-delete-btn { opacity: 1; }
.bdd-delete-btn:hover { color: #e06060; background: rgba(224,96,96,0.1); }

/* Detail preview pane */
.bdd-detail {
  padding: 1rem 1.25rem; background: var(--card-bg);
  border: 1px solid var(--border-color); border-radius: 6px;
  font-size: 0.88rem; line-height: 1.6; overflow-y: auto; max-height: 70vh;
}
.bdd-detail-title { margin: 0 0 0.5rem; font-size: 1.05rem; }
.bdd-detail-meta { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; font-size: 0.75rem; color: var(--text-muted); }
.bdd-detail-path { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.72rem; }
.bdd-detail-body :deep(h1) { font-size: 1.1rem; margin: 0.5rem 0 0.4rem; }
.bdd-detail-body :deep(h2) { font-size: 0.95rem; margin: 0.85rem 0 0.4rem; }
.bdd-detail-body :deep(h3) { font-size: 0.88rem; margin: 0.75rem 0 0.3rem; }
.bdd-detail-body :deep(code) { background: var(--secondary-color); padding: 0.08rem 0.3rem; border-radius: 3px; font-size: 0.85em; }
.bdd-detail-body :deep(hr) { border: none; border-top: 1px solid var(--border-color); margin: 0.75rem 0; }
.bdd-detail-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.4rem; color: var(--text-muted); text-align: center; }
.bdd-detail-empty .mdi { font-size: 1.8rem; opacity: 0.4; }

.bdd-empty { padding: 2rem; text-align: center; color: var(--text-muted); font-size: 0.88rem; }

/* Session */
.bdd-session-wrap { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.bdd-session-header {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem;
  background: var(--card-bg); border-bottom: 1px solid var(--border-color);
  font-size: 0.82rem; color: var(--text-color); flex-shrink: 0;
}
.bdd-agent-badge { background: rgba(109,212,160,0.12); color: #6dd4a0; padding: 0.15rem 0.5rem; border-radius: 10px; font-size: 0.72rem; font-weight: 600; }
.bdd-session-subject { color: var(--text-muted); font-size: 0.78rem; }
.bdd-spacer { flex: 1; }
.bdd-split-pane { flex: 1; display: flex; overflow: hidden; }
.bdd-context-panel { display: flex; flex-direction: column; overflow: hidden; background: var(--card-bg); border-right: 1px solid var(--border-color); flex-shrink: 0; color: var(--text-color); }
.bdd-panel-header { padding: 0.75rem; border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
.bdd-panel-label { font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6dd4a0; }
.bdd-panel-body { flex: 1; overflow-y: auto; padding: 1rem; }
.bdd-ctx-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.78rem; color: var(--text-muted); margin-bottom: 0.3rem; }
.bdd-ctx-icon { font-size: 1rem; color: #6dd4a0; }
.bdd-prompt-section { margin-top: 0.5rem; }
.bdd-prompt-text { font-size: 0.75rem; line-height: 1.55; color: var(--text-muted); font-weight: 300; margin: 0.3rem 0 0; white-space: pre-wrap; }

.bdd-resize-handle { width: 6px; cursor: col-resize; background: transparent; flex-shrink: 0; position: relative; }
.bdd-resize-handle::after { content: ''; position: absolute; top: 0; bottom: 0; left: 2px; width: 2px; background: var(--border-color); transition: background 0.15s; }
.bdd-resize-handle:hover::after { background: #6dd4a0; }
.bdd-terminal-panel { flex: 1; display: flex; min-width: 0; }
.bdd-terminal { flex: 1; background: #0A1220; position: relative; }
.bdd-terminal :deep(.xterm) { position: absolute; top: 0; left: 0; right: 0; bottom: 0; padding: 0.5rem; }
.bdd-terminal :deep(.xterm-screen) { height: 100% !important; }
.bdd-terminal :deep(.xterm-viewport) { overflow-y: auto !important; }
</style>
