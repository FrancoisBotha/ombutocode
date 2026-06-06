<template>
  <div class="modal-overlay" @click.self="onCloseRequest">
    <div class="modal-content doctor-modal">
      <div class="modal-header doctor-header">
        <div class="doctor-title-group">
          <span class="mdi mdi-stethoscope doctor-icon"></span>
          <div>
            <h2>Ticket Doctor: {{ ticket?.id }}</h2>
            <p class="doctor-subtitle">{{ ticket?.title || 'Untitled' }}</p>
          </div>
        </div>
        <div class="doctor-header-meta">
          <span class="doctor-chip">{{ defaultAgent || 'no agent' }}</span>
          <span class="doctor-chip doctor-chip-warning" v-if="ticket?.fail_count">
            failed {{ ticket.fail_count }}× ({{ maxRetries }} max)
          </span>
        </div>
      </div>

      <div class="modal-body doctor-body">
        <!-- Pre-session: brief + start button -->
        <div v-if="!sessionStarted" class="doctor-intro">
          <p>
            This ticket exceeded the retry threshold and was removed from the automation pipeline.
            Launching the <strong>Fix Ticket</strong> skill against the default coding agent
            (<strong>{{ defaultAgent || 'not configured' }}</strong>).
          </p>
          <p class="doctor-intro-detail">
            The agent will read the ticket, prior run notes, and the existing branch in the
            ticket's worktree, then diagnose and attempt a fix. You stay in the loop —
            answer its questions in the terminal below. When it reports
            <code>TICKET_DOCTOR_RESULT: SUCCESS</code>, a <strong>Move to Review</strong>
            button will appear here.
          </p>
          <div class="doctor-intro-actions">
            <button
              class="btn btn-primary"
              :disabled="!defaultAgent || !skillLoaded || starting"
              @click="startSession"
            >
              <span class="mdi mdi-play"></span>
              {{ starting ? 'Starting…' : 'Start Doctor Session' }}
            </button>
            <button class="btn btn-secondary" @click="onCloseRequest">Cancel</button>
          </div>
          <p v-if="!defaultAgent" class="doctor-warning">
            <span class="mdi mdi-alert-outline"></span>
            No default coding agent configured. Set one in Settings → Coding Agents.
          </p>
          <p v-else-if="!skillLoaded" class="doctor-warning">
            <span class="mdi mdi-alert-outline"></span>
            Fix Ticket skill not found in docs/Skills/. The session can still start
            without it, but the agent will lack the diagnostic playbook.
          </p>
        </div>

        <!-- Session active: terminal + status banner -->
        <div v-else class="doctor-session">
          <div
            v-if="doctorResult === 'SUCCESS'"
            class="doctor-result-banner doctor-result-success"
          >
            <span class="mdi mdi-check-circle"></span>
            <span>Doctor reported <strong>SUCCESS</strong>. Review the agent's summary above, then move the ticket to Review.</span>
          </div>
          <div
            v-else-if="doctorResult === 'FAIL'"
            class="doctor-result-banner doctor-result-fail"
          >
            <span class="mdi mdi-close-circle"></span>
            <span>Doctor reported <strong>FAIL</strong>. Read its diagnosis and decide next steps.</span>
          </div>
          <div class="doctor-terminal" ref="terminalContainer"></div>
        </div>
      </div>

      <div class="modal-footer doctor-footer">
        <button
          v-if="sessionStarted && doctorResult === 'SUCCESS'"
          class="btn btn-success"
          :disabled="movingToReview"
          @click="moveToReview"
        >
          <span class="mdi mdi-check-bold"></span>
          {{ movingToReview ? 'Moving…' : 'Move to Review' }}
        </button>
        <button
          v-if="sessionStarted"
          class="btn btn-secondary"
          @click="onCloseRequest"
        >
          {{ doctorResult ? 'Close' : 'End Session' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, nextTick, computed } from 'vue';
import { collectSkillFiles } from '@/utils/skills';
import { enableTerminalPaste } from '@/utils/terminalPaste';
import { useSettingsStore } from '@/stores/settingsStore';
import { useBacklogStore } from '@/stores/backlogStore';

let termInstance = null;
let fitAddon = null;
let shellDataCleanup = null;
let shellExitCleanup = null;
let shellCounter = 0;

export default {
  name: 'TicketDoctorDialog',
  props: {
    ticket: { type: Object, required: true },
  },
  emits: ['close', 'moved-to-review'],
  setup(props, { emit }) {
    const settingsStore = useSettingsStore();
    const backlogStore = useBacklogStore();
    const sessionStarted = ref(false);
    const starting = ref(false);
    const movingToReview = ref(false);
    const terminalContainer = ref(null);
    const currentShellId = ref('');
    const skillContent = ref('');
    const skillLoaded = ref(false);
    // Sticky outcome marker — first occurrence wins, so a later "FAIL" can't
    // overwrite an earlier "SUCCESS" (or vice versa) within the same session.
    const doctorResult = ref(null);
    // Buffer for the last ~4KB of output so we can pattern-match the result
    // marker even when it arrives split across pty data chunks.
    let outputBuffer = '';

    const defaultAgent = computed(() =>
      settingsStore.settings.eval_default_agent || settingsStore.settings.ad_hoc_ticket_agent || ''
    );
    const maxRetries = computed(() => settingsStore.maxEvalRetries || 2);

    async function loadSkill() {
      try {
        const tree = await window.electron.ipcRenderer.invoke('filetree:scan');
        const fixTicket = collectSkillFiles(tree).find(f =>
          /^fix[ _-]?ticket\.md$/i.test(f.name)
        );
        if (fixTicket) {
          const content = await window.electron.ipcRenderer.invoke('filetree:readFile', fixTicket.path);
          // Strip YAML frontmatter so it doesn't appear at the top of the prompt.
          skillContent.value = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '').trim();
          skillLoaded.value = true;
        }
      } catch (_) { /* skill not available — session still allowed */ }
    }

    function buildPrompt() {
      const t = props.ticket;
      const ticketSummary = [
        `Ticket ID: ${t.id}`,
        t.title ? `Title: ${t.title}` : null,
        t.epic_ref ? `Epic reference: ${t.epic_ref}` : null,
        typeof t.fail_count === 'number' ? `Prior fail count: ${t.fail_count}` : null,
        typeof t.eval_fail_count === 'number' && t.eval_fail_count > 0 ? `Eval fail count: ${t.eval_fail_count}` : null,
      ].filter(Boolean).join('\n');

      const intro = `You are the Ticket Doctor. The following ticket has failed enough times that the automation pipeline has handed it to you for diagnosis and repair.

${ticketSummary}

You are running inside this ticket's existing git worktree on branch ticket/${t.id}. The branch contains the prior failing run's commits.

Follow the Fix Ticket skill above precisely. End with the structured TICKET_DOCTOR_RESULT marker so the UI can offer the human a Move to Review action.`;

      return skillContent.value
        ? `${skillContent.value}\n\n---\n\n${intro}`
        : intro;
    }

    function watchForResultMarker(chunk) {
      // Strip ANSI escape sequences before pattern-matching so colour codes
      // inserted by the agent's TUI don't break the regex.
      outputBuffer = (outputBuffer + chunk).replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
      if (outputBuffer.length > 8192) outputBuffer = outputBuffer.slice(-8192);
      if (doctorResult.value) return;
      const m = outputBuffer.match(/TICKET_DOCTOR_RESULT:\s*(SUCCESS|FAIL)/i);
      if (m) doctorResult.value = m[1].toUpperCase();
    }

    async function startSession() {
      if (starting.value || sessionStarted.value) return;
      if (!defaultAgent.value) return;
      starting.value = true;

      try {
        sessionStarted.value = true;
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

        const shellId = 'doctor-' + props.ticket.id + '-' + (++shellCounter);
        currentShellId.value = shellId;

        const prompt = buildPrompt();
        const agentCmd = defaultAgent.value;
        let args;
        if (agentCmd === 'claude') {
          args = ['--verbose', '--dangerously-skip-permissions', prompt];
        } else {
          args = [];
        }

        const spawnResult = await window.electron.ipcRenderer.invoke(
          'doctor:spawn', shellId, props.ticket.id, agentCmd, args
        );
        if (!spawnResult?.usedWorktree) {
          term.write('\x1b[33mNote: ticket worktree not found, running in project root instead.\x1b[0m\r\n');
        }

        if (agentCmd !== 'claude') {
          // Stdin-prompt agents (codex, kimi): send the prompt after the agent
          // has had a moment to initialise.
          setTimeout(() => {
            window.electron.ipcRenderer.invoke('workspace:writeShell', shellId, prompt + '\r');
          }, 2000);
        }

        term.onData((data) => {
          window.electron.ipcRenderer.invoke('workspace:writeShell', shellId, data);
        });

        shellDataCleanup = window.electron.ipcRenderer.on('workspace:shellData', ({ shellId: sid, data }) => {
          if (sid !== shellId || !termInstance) return;
          termInstance.write(data);
          watchForResultMarker(data);
        });

        shellExitCleanup = window.electron.ipcRenderer.on('workspace:shellExit', ({ shellId: sid }) => {
          if (sid === shellId && termInstance) {
            termInstance.write('\r\n\x1b[32m✓ Session ended.\x1b[0m\r\n');
          }
        });

        setTimeout(() => { if (fitAddon) fitAddon.fit(); }, 300);
      } catch (e) {
        console.error('[TicketDoctor] Failed to start session:', e);
        sessionStarted.value = false;
      } finally {
        starting.value = false;
      }
    }

    async function moveToReview() {
      if (movingToReview.value) return;
      movingToReview.value = true;
      try {
        await backlogStore.updateTicketStatus(props.ticket.id, 'review');
        emit('moved-to-review', props.ticket.id);
        cleanupSession();
        emit('close');
      } catch (e) {
        console.error('[TicketDoctor] Failed to move ticket to review:', e);
      } finally {
        movingToReview.value = false;
      }
    }

    function cleanupSession() {
      if (currentShellId.value) {
        window.electron.ipcRenderer.invoke('workspace:killShell', currentShellId.value);
        currentShellId.value = '';
      }
      if (shellDataCleanup) { shellDataCleanup(); shellDataCleanup = null; }
      if (shellExitCleanup) { shellExitCleanup(); shellExitCleanup = null; }
      if (termInstance) { termInstance.dispose(); termInstance = null; }
      fitAddon = null;
    }

    function onCloseRequest() {
      // Don't trap the user: closing always works. The pty process is killed
      // so it doesn't keep running in the background after the dialog closes.
      cleanupSession();
      emit('close');
    }

    onMounted(async () => {
      await Promise.all([settingsStore.loadSettings().catch(() => {}), loadSkill()]);
    });
    onBeforeUnmount(() => cleanupSession());

    return {
      sessionStarted, starting, movingToReview,
      terminalContainer, defaultAgent, maxRetries,
      skillLoaded, doctorResult,
      startSession, moveToReview, onCloseRequest,
    };
  },
};
</script>

<style scoped>
.doctor-modal {
  width: 90vw;
  max-width: 1100px;
  height: 80vh;
  max-height: 800px;
  display: flex;
  flex-direction: column;
}

.doctor-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.doctor-title-group {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.doctor-icon {
  font-size: 1.5rem;
  color: #6dd4a0;
  margin-top: 0.15rem;
}

.doctor-header h2 { margin: 0; font-size: 1.1rem; }
.doctor-subtitle { margin: 0.15rem 0 0; color: var(--text-muted); font-size: 0.85rem; }

.doctor-header-meta { display: flex; gap: 0.4rem; flex-wrap: wrap; }
.doctor-chip {
  background: var(--secondary-color);
  color: var(--text-muted);
  padding: 0.15rem 0.55rem;
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 600;
}
.doctor-chip-warning { background: rgba(229, 168, 48, 0.18); color: #b87f0e; }
[data-theme="dark"] .doctor-chip-warning { color: #e5a830; }

.doctor-body { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }

.doctor-intro { padding: 1rem 0.5rem; }
.doctor-intro p { margin: 0 0 0.75rem; line-height: 1.55; }
.doctor-intro-detail { color: var(--text-muted); font-size: 0.9rem; }
.doctor-intro-actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
.doctor-warning {
  margin-top: 0.75rem !important;
  font-size: 0.85rem;
  color: #b87f0e;
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
[data-theme="dark"] .doctor-warning { color: #e5a830; }

.doctor-session { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.doctor-result-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.8rem;
  border-radius: 5px;
  margin-bottom: 0.5rem;
  font-size: 0.85rem;
}
.doctor-result-banner .mdi { font-size: 1.1rem; }
.doctor-result-success {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
}
.doctor-result-fail {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
}
[data-theme="dark"] .doctor-result-success {
  background: rgba(60, 199, 122, 0.12);
  border-color: rgba(60, 199, 122, 0.35);
  color: #6dd4a0;
}
[data-theme="dark"] .doctor-result-fail {
  background: rgba(224, 96, 96, 0.12);
  border-color: rgba(224, 96, 96, 0.35);
  color: #e06060;
}

.doctor-terminal {
  flex: 1;
  background: #0A1220;
  border-radius: 6px;
  position: relative;
  overflow: hidden;
  min-height: 0;
}
.doctor-terminal :deep(.xterm) { position: absolute; inset: 0; padding: 0.5rem; }
.doctor-terminal :deep(.xterm-screen) { height: 100% !important; }
.doctor-terminal :deep(.xterm-viewport) { overflow-y: auto !important; }

.doctor-footer { display: flex; gap: 0.5rem; justify-content: flex-end; }
</style>
