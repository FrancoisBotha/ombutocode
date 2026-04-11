<template>
  <div class="view-container" v-if="!sessionActive">
    <div class="mockups-header">
      <div>
        <h1>Mockups</h1>
        <p class="text-muted">UI mockups from docs/Mockups/</p>
      </div>
      <div class="mockups-header-actions">
        <button class="mockup-gen-btn" :disabled="agents.length === 0" @click="showGenPanel = !showGenPanel">
          <span class="mdi mdi-robot-outline"></span> Generate Mockup with AI
        </button>
      </div>
    </div>

    <!-- Generate panel -->
    <div v-if="showGenPanel" class="mockup-gen-panel">
      <div class="mockup-gen-field">
        <label>Coding Agent</label>
        <select v-model="selectedAgent" class="mockup-gen-select">
          <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </div>
      <div class="mockup-gen-field">
        <label>Description</label>
        <input v-model="mockupDescription" class="mockup-gen-input" placeholder="e.g. Dashboard page with sidebar, header, and analytics cards" />
      </div>
      <div class="mockup-gen-field">
        <label>Save as</label>
        <input v-model="mockupFilename" class="mockup-gen-input" placeholder="Mockup_Dashboard.png" />
      </div>
      <div class="mockup-gen-actions">
        <button class="mockup-gen-btn-primary" :disabled="!selectedAgent || !mockupDescription.trim()" @click="startGenSession">
          <span class="mdi mdi-creation"></span> Generate
        </button>
        <button class="mockup-gen-btn-secondary" @click="showGenPanel = false">Cancel</button>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading mockups…</div>
    <div v-else-if="mockups.length === 0" class="empty">No image files found in docs/Mockups/</div>

    <div v-else class="gallery">
      <div
        v-for="m in mockups"
        :key="m.path"
        class="mockup-card"
        @click="openLightbox(m)"
      >
        <img v-if="m.dataUrl" :src="m.dataUrl" :alt="m.name" class="thumb" />
        <div class="mockup-name">{{ m.name }}</div>
      </div>
    </div>

    <!-- Lightbox overlay -->
    <div v-if="lightbox" class="lightbox" @click="lightbox = null">
      <img :src="lightbox.dataUrl" :alt="lightbox.name" class="lightbox-img" />
      <div class="lightbox-caption">{{ lightbox.name }}</div>
    </div>
  </div>

  <!-- AI Session -->
  <div class="mockup-session-wrap" v-if="sessionActive">
    <div class="mockup-session-header">
      <span class="mdi mdi-robot-outline"></span>
      <span>AI Mockup Generation</span>
      <span class="mockup-agent-badge">{{ selectedAgent }}</span>
      <div class="mockup-spacer"></div>
      <button class="mockup-gen-btn-secondary mockup-btn-sm" @click="stopSession">
        <span class="mdi mdi-stop"></span> End Session
      </button>
    </div>
    <div class="mockup-split-pane">
      <div class="mockup-context-panel" :style="{ width: panelWidth + 'px' }">
        <div class="mockup-panel-header">
          <label class="mockup-panel-label">Generation Details</label>
        </div>
        <div class="mockup-panel-body">
          <div class="mockup-detail-item">
            <span class="mockup-detail-label">Description</span>
            <p class="mockup-detail-value">{{ mockupDescription }}</p>
          </div>
          <div class="mockup-detail-item">
            <span class="mockup-detail-label">Save to</span>
            <p class="mockup-detail-value"><code>docs/Mockups/{{ mockupFilename }}</code></p>
          </div>
          <div class="mockup-detail-item" style="margin-top: 0.75rem;">
            <span class="mockup-panel-label">System Prompt</span>
            <p class="mockup-prompt-text">{{ sessionPrompt }}</p>
          </div>
        </div>
      </div>
      <div class="mockup-resize-handle" @mousedown="startResize"></div>
      <div class="mockup-terminal-panel">
        <div ref="terminalContainer" class="mockup-terminal"></div>
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

export default {
  name: 'MockupsView',
  setup() {
    const mockups = ref([]);
    const loading = ref(true);
    const lightbox = ref(null);

    // Gen panel
    const showGenPanel = ref(false);
    const agents = ref([]);
    const selectedAgent = ref('');
    const mockupDescription = ref('');
    const mockupFilename = ref('');

    // Session
    const sessionActive = ref(false);
    const terminalContainer = ref(null);
    const currentShellId = ref('');
    const sessionPrompt = ref('');
    const panelWidth = ref(300);

    async function loadMockups() {
      try {
        const list = await window.electron.ipcRenderer.invoke('filetree:scanMockups');
        const loaded = await Promise.all(
          list.map(async (item) => {
            const dataUrl = await window.electron.ipcRenderer.invoke('filetree:readImage', item.path);
            return { ...item, dataUrl };
          })
        );
        mockups.value = loaded;
      } catch (e) {
        console.error('Failed to load mockups:', e);
      } finally {
        loading.value = false;
      }
    }

    async function loadAgents() {
      try {
        const results = await window.electron.ipcRenderer.invoke('agent:getStartupResults');
        const connected = [];
        for (const [id, r] of Object.entries(results || {})) {
          if (r.status === 'pass') connected.push({ id, name: id.charAt(0).toUpperCase() + id.slice(1) });
        }
        agents.value = connected;
        if (connected.length > 0) {
          const settings = await window.electron.ipcRenderer.invoke('settings:read');
          selectedAgent.value = settings?.eval_default_agent && connected.some(a => a.id === settings.eval_default_agent)
            ? settings.eval_default_agent
            : connected[0].id;
        }
      } catch (_) {}
    }

    function openLightbox(m) {
      lightbox.value = m;
    }

    async function startGenSession() {
      if (!selectedAgent.value || !mockupDescription.value.trim()) return;

      const filename = mockupFilename.value.trim() || 'Mockup_' + mockupDescription.value.trim().replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40) + '.png';
      mockupFilename.value = filename;
      sessionActive.value = true;
      showGenPanel.value = false;

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

      const shellId = 'mockup-gen-' + (++sessionCounter);
      currentShellId.value = shellId;

      const prompt = `Generate a UI mockup image based on this description: "${mockupDescription.value.trim()}"

Save the generated image to "docs/Mockups/${filename}".

Before saving, confirm the file path with me and let me modify it if needed.

Guidelines:
- Create a clean, professional UI mockup
- Use a dark theme consistent with the application's color palette
- Include realistic placeholder content
- Show the layout clearly with proper spacing and hierarchy`;

      sessionPrompt.value = prompt;

      const agentCmd = selectedAgent.value;
      const args = agentCmd === 'claude'
        ? ['--verbose', '--dangerously-skip-permissions', prompt]
        : [prompt];

      await window.electron.ipcRenderer.invoke('agent:spawnInteractive', shellId, agentCmd, args);
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
      loadMockups();
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

    onMounted(() => { loadMockups(); loadAgents(); });
    onBeforeUnmount(() => {
      if (currentShellId.value) window.electron.ipcRenderer.invoke('workspace:killShell', currentShellId.value);
      cleanup();
    });

    return {
      mockups, loading, lightbox, openLightbox,
      showGenPanel, agents, selectedAgent, mockupDescription, mockupFilename,
      sessionActive, terminalContainer, sessionPrompt, panelWidth,
      startGenSession, stopSession, startResize,
    };
  },
};
</script>

<style scoped>
.view-container {
  max-width: 100%;
  padding: 1rem;
}

.view-container h1 {
  margin-bottom: 0.5rem;
  color: var(--text-color);
}

.loading, .empty {
  margin-top: 2rem;
  color: var(--text-muted);
}

.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
  margin-top: 1.5rem;
}

.mockup-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  overflow: hidden;
  cursor: pointer;
  box-shadow: var(--box-shadow);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.mockup-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.thumb {
  width: 100%;
  display: block;
  object-fit: contain;
  background: #1a1a1a;
}

.mockup-name {
  padding: 0.5rem 0.75rem;
  font-size: 0.8rem;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Lightbox */
.lightbox {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  cursor: pointer;
}

.lightbox-img {
  max-width: 90vw;
  max-height: 85vh;
  object-fit: contain;
}

.lightbox-caption {
  margin-top: 0.75rem;
  color: #ccc;
  font-size: 0.9rem;
}

/* Header with generate button */
.mockups-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 0.5rem; }
.mockups-header h1 { margin-bottom: 0.25rem; }

.mockup-gen-btn {
  display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.5rem 1rem; border: none;
  border-radius: 6px; background: #6dd4a0; color: #0A1220; font-size: 0.85rem; font-weight: 500; cursor: pointer; transition: all 0.15s;
}
.mockup-gen-btn:hover:not(:disabled) { background: #86efac; }
.mockup-gen-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* Generate panel */
.mockup-gen-panel {
  padding: 1rem; margin-bottom: 1rem; border-radius: 8px;
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
}
.mockup-gen-field { margin-bottom: 0.6rem; }
.mockup-gen-field label { display: block; font-size: 0.72rem; font-weight: 600; color: rgba(255,255,255,0.4); margin-bottom: 0.2rem; }
.mockup-gen-select, .mockup-gen-input {
  width: 100%; max-width: 400px; padding: 0.4rem 0.5rem; border: 1px solid rgba(255,255,255,0.1);
  border-radius: 5px; background: #0A1220; color: var(--text-color, #d4d8dd); font-size: 0.85rem; outline: none;
}
.mockup-gen-select:focus, .mockup-gen-input:focus { border-color: #6dd4a0; }
.mockup-gen-actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
.mockup-gen-btn-primary {
  display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.5rem 1rem; border: none;
  border-radius: 6px; background: #6dd4a0; color: #0A1220; font-size: 0.85rem; font-weight: 500; cursor: pointer;
}
.mockup-gen-btn-primary:hover:not(:disabled) { background: #86efac; }
.mockup-gen-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.mockup-gen-btn-secondary {
  padding: 0.5rem 1rem; border: none; border-radius: 6px;
  background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); font-size: 0.85rem; cursor: pointer;
}
.mockup-gen-btn-secondary:hover { background: rgba(255,255,255,0.12); }
.mockup-btn-sm { padding: 0.35rem 0.75rem; font-size: 0.8rem; }

/* Session layout */
.mockup-session-wrap { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-color, #161a1f); }
.mockup-session-header {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem;
  background: #0d1720; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 0.82rem; color: rgba(255,255,255,0.7); flex-shrink: 0;
}
.mockup-agent-badge { background: rgba(109,212,160,0.12); color: #6dd4a0; padding: 0.15rem 0.5rem; border-radius: 10px; font-size: 0.72rem; font-weight: 600; }
.mockup-spacer { flex: 1; }
.mockup-split-pane { flex: 1; display: flex; overflow: hidden; }
.mockup-context-panel { display: flex; flex-direction: column; overflow: hidden; background: #0d1720; border-right: 1px solid rgba(255,255,255,0.06); flex-shrink: 0; }
.mockup-panel-header { padding: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.06); flex-shrink: 0; }
.mockup-panel-label { font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6dd4a0; }
.mockup-panel-body { flex: 1; overflow-y: auto; padding: 1rem; }
.mockup-detail-item { margin-bottom: 0.6rem; }
.mockup-detail-label { font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: rgba(255,255,255,0.35); display: block; margin-bottom: 0.15rem; }
.mockup-detail-value { margin: 0; font-size: 0.82rem; color: rgba(255,255,255,0.6); font-weight: 300; }
.mockup-detail-value code { background: rgba(255,255,255,0.06); padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.78rem; color: #6dd4a0; }
.mockup-prompt-text { font-size: 0.75rem; line-height: 1.55; color: rgba(255,255,255,0.35); font-weight: 300; margin: 0.3rem 0 0; white-space: pre-wrap; }
.mockup-resize-handle { width: 6px; cursor: col-resize; background: transparent; flex-shrink: 0; position: relative; }
.mockup-resize-handle::after { content: ''; position: absolute; top: 0; bottom: 0; left: 2px; width: 2px; background: rgba(255,255,255,0.06); transition: background 0.15s; }
.mockup-resize-handle:hover::after { background: #6dd4a0; }
.mockup-terminal-panel { flex: 1; display: flex; min-width: 0; }
.mockup-terminal { flex: 1; background: #0A1220; position: relative; }
.mockup-terminal :deep(.xterm) { position: absolute; top: 0; left: 0; right: 0; bottom: 0; padding: 0.5rem; }
.mockup-terminal :deep(.xterm-screen) { height: 100% !important; }
.mockup-terminal :deep(.xterm-viewport) { overflow-y: auto !important; }
</style>
