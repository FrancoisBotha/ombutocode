<template>
  <div class="workspace-view" @mousemove="onMouseMove" @mouseup="onMouseUp">
    <!-- Panel 1: Git -->
    <div class="ws-panel" :style="{ width: panelWidths[0] + 'px' }">
      <div class="panel-header"><span class="mdi mdi-source-branch"></span> Git</div>
      <div class="panel-body">
        <div class="ws-section" ref="changesSectionRef" :style="changesHeight != null ? { flex: 'none', height: changesHeight + 'px', overflow: 'auto' } : {}">
          <div class="ws-section-header" @click="changesOpen = !changesOpen">
            <span class="mdi" :class="changesOpen ? 'mdi-chevron-down' : 'mdi-chevron-right'"></span>
            <span class="ws-section-title">CHANGES</span>
          </div>
          <div v-if="changesOpen" class="ws-section-body">
            <textarea v-model="commitMessage" class="commit-input"
              placeholder="Commit message (Ctrl+Enter)" rows="2" @keydown="onCommitKeyDown"></textarea>
            <div class="commit-actions">
              <button class="commit-btn" @click="doCommit" :disabled="!commitMessage.trim() || committing">
                <span class="mdi mdi-check"></span> {{ committing ? 'Committing...' : 'Commit' }}
              </button>
              <button class="push-btn" @click="doPush" :disabled="pushing">
                <span class="mdi mdi-arrow-up"></span> {{ pushing ? 'Pushing...' : 'Push' }}
              </button>
            </div>
            <div v-if="commitResult" class="commit-result" :class="commitResult.success ? 'result-ok' : 'result-err'">
              {{ commitResult.message }}
            </div>
            <div class="changes-header">
              <span>Changes</span>
              <span class="changes-count">{{ changedFiles.length }}</span>
            </div>
            <div v-if="changedFiles.length === 0" class="changes-empty">No changes</div>
            <div v-else class="changes-list">
              <div v-for="f in changedFiles" :key="f.file" class="change-item">
                <span class="change-status" :class="'cs-' + f.status.replace(/\?/g, 'q')">{{ f.status }}</span>
                <span class="change-file">{{ f.file }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="h-divider" @mousedown="startVResize($event)"></div>

        <div class="ws-section graph-section">
          <div class="ws-section-header" @click="graphOpen = !graphOpen">
            <span class="mdi" :class="graphOpen ? 'mdi-chevron-down' : 'mdi-chevron-right'"></span>
            <span class="ws-section-title">GRAPH</span>
            <button class="refresh-btn" @click.stop="loadData" title="Refresh">
              <span class="mdi mdi-refresh"></span>
            </button>
          </div>
          <div v-if="graphOpen" class="graph-body">
            <div v-for="entry in gitLog" :key="entry.hash" class="graph-entry">
              <span class="graph-dot"></span>
              <span class="graph-message">{{ entry.message }}</span>
              <span v-if="entry.refs" class="graph-refs">
                <span v-for="r in parseRefs(entry.refs)" :key="r" class="graph-ref" :class="refClass(r)">{{ r }}</span>
              </span>
              <span class="graph-author">{{ entry.author }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="divider" @mousedown="startResize(0, $event)"></div>

    <!-- Panel 2: Terminal 1 -->
    <div class="ws-panel" :style="{ width: panelWidths[1] + 'px' }">
      <div class="panel-header"><span class="mdi mdi-console"></span> Terminal 1</div>
      <div class="terminal-body" ref="term1Container"></div>
    </div>

    <div class="divider" @mousedown="startResize(1, $event)"></div>

    <!-- Panel 3: Terminal 2 -->
    <div class="ws-panel" style="flex:1">
      <div class="panel-header"><span class="mdi mdi-console"></span> Terminal 2</div>
      <div class="terminal-body" ref="term2Container"></div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

let shellCounter = 0;

function createTerminal(container, shellId) {
  const term = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
    theme: {
      background: '#1e1e2e',
      foreground: '#c9d1d9',
      cursor: '#58a6ff',
      selectionBackground: '#264f78',
    },
  });
  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(container);
  fitAddon.fit();

  window.electron.ipcRenderer.invoke('workspace:spawnShell', shellId);

  // Direct passthrough — real PTY handles echo, line editing, etc.
  term.onData((data) => {
    window.electron.ipcRenderer.invoke('workspace:writeShell', shellId, data);
  });

  // Sync terminal size with PTY on resize
  const ro = new ResizeObserver(() => {
    try {
      fitAddon.fit();
      window.electron.ipcRenderer.invoke('workspace:resizeShell', shellId, term.cols, term.rows);
    } catch {}
  });
  ro.observe(container);

  return { term, fitAddon, ro, shellId };
}

/**
 * Re-fit terminals after the view becomes visible again.
 * xterm can't measure when display:none, so we wait a frame after v-show shows us.
 */
function refitTerminals(...terminals) {
  requestAnimationFrame(() => {
    for (const t of terminals) {
      if (t && t.fitAddon) {
        try { t.fitAddon.fit(); } catch {}
      }
    }
  });
}

export default {
  name: 'WorkspaceView',
  props: {
    visible: { type: Boolean, default: true },
  },
  setup(props) {
    const changesOpen = ref(true);
    const graphOpen = ref(true);
    const commitMessage = ref('');
    const changedFiles = ref([]);
    const gitLog = ref([]);
    const committing = ref(false);
    const pushing = ref(false);
    const commitResult = ref(null);
    const term1Container = ref(null);
    const term2Container = ref(null);

    const panelWidths = reactive([320, 400]);
    const changesHeight = ref(null);
    const changesSectionRef = ref(null);
    let resizingIdx = -1;
    let resizeStartX = 0;
    let resizeStartW = 0;
    let vResizing = false;
    let vResizeStartY = 0;
    let vResizeStartH = 0;

    function startResize(idx, e) { resizingIdx = idx; resizeStartX = e.clientX; resizeStartW = panelWidths[idx]; e.preventDefault(); }
    function startVResize(e) {
      vResizing = true;
      vResizeStartY = e.clientY;
      vResizeStartH = changesSectionRef.value ? changesSectionRef.value.offsetHeight : 200;
      e.preventDefault();
    }
    function onMouseMove(e) {
      if (resizingIdx >= 0) { panelWidths[resizingIdx] = Math.max(200, resizeStartW + (e.clientX - resizeStartX)); }
      if (vResizing) { changesHeight.value = Math.max(60, vResizeStartH + (e.clientY - vResizeStartY)); }
    }
    function onMouseUp() { resizingIdx = -1; vResizing = false; }

    let terminal1 = null, terminal2 = null;
    let refreshInterval = null, resultTimeout = null;
    let removeDataListener = null, removeExitListener = null;

    async function loadData() {
      try {
        const [status, log] = await Promise.all([
          window.electron.ipcRenderer.invoke('workspace:gitStatus'),
          window.electron.ipcRenderer.invoke('workspace:gitLog', 40),
        ]);
        changedFiles.value = status;
        gitLog.value = log;
      } catch (e) { console.error(e); }
    }

    async function doCommit() {
      if (!commitMessage.value.trim()) return;
      committing.value = true; commitResult.value = null;
      try {
        const r = await window.electron.ipcRenderer.invoke('workspace:gitCommit', commitMessage.value.trim());
        if (r.success) { commitResult.value = { success: true, message: 'Committed' }; commitMessage.value = ''; loadData(); }
        else commitResult.value = { success: false, message: r.error };
      } catch (e) { commitResult.value = { success: false, message: e.message }; }
      finally { committing.value = false; clearResultLater(); }
    }

    async function doPush() {
      pushing.value = true; commitResult.value = null;
      try {
        const r = await window.electron.ipcRenderer.invoke('workspace:gitPush');
        commitResult.value = r.success ? { success: true, message: 'Pushed' } : { success: false, message: r.error };
      } catch (e) { commitResult.value = { success: false, message: e.message }; }
      finally { pushing.value = false; clearResultLater(); }
    }

    function clearResultLater() { if (resultTimeout) clearTimeout(resultTimeout); resultTimeout = setTimeout(() => { commitResult.value = null; }, 4000); }
    function onCommitKeyDown(e) { if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); doCommit(); } }
    function parseRefs(refs) { return refs ? refs.split(',').map(r => r.trim()).filter(Boolean) : []; }
    function refClass(r) {
      if (r.includes('HEAD')) return 'ref-head';
      if (r.includes('main') || r.includes('master')) return 'ref-main';
      if (r.includes('origin/')) return 'ref-remote';
      return 'ref-branch';
    }

    function findTermByShellId(id) {
      if (terminal1 && terminal1.shellId === id) return terminal1.term;
      if (terminal2 && terminal2.shellId === id) return terminal2.term;
      return null;
    }

    // Re-fit terminals when the view becomes visible again
    watch(() => props.visible, (isVisible) => {
      if (isVisible) {
        refitTerminals(terminal1, terminal2);
      }
    });

    onMounted(async () => {
      loadData();
      refreshInterval = setInterval(loadData, 15000);

      removeDataListener = window.electron.ipcRenderer.on('workspace:shellData', (payload) => {
        const t = findTermByShellId(payload.shellId);
        if (t) t.write(payload.data);
      });
      removeExitListener = window.electron.ipcRenderer.on('workspace:shellExit', (payload) => {
        const t = findTermByShellId(payload.shellId);
        if (t) t.write(`\r\n[Process exited with code ${payload.code}]\r\n`);
      });

      await nextTick();
      if (term1Container.value) terminal1 = createTerminal(term1Container.value, 'ws-shell-' + (++shellCounter));
      if (term2Container.value) terminal2 = createTerminal(term2Container.value, 'ws-shell-' + (++shellCounter));
    });

    onUnmounted(() => {
      if (refreshInterval) clearInterval(refreshInterval);
      if (resultTimeout) clearTimeout(resultTimeout);
      [terminal1, terminal2].forEach(t => {
        if (t) { window.electron.ipcRenderer.invoke('workspace:killShell', t.shellId); t.ro.disconnect(); t.term.dispose(); }
      });
      if (removeDataListener) removeDataListener();
      if (removeExitListener) removeExitListener();
    });

    return {
      changesOpen, graphOpen, commitMessage, changedFiles, gitLog,
      committing, pushing, commitResult, term1Container, term2Container,
      panelWidths, changesHeight, changesSectionRef, startResize, startVResize, onMouseMove, onMouseUp,
      doCommit, doPush, onCommitKeyDown, parseRefs, refClass, loadData,
    };
  },
};
</script>

<style scoped>
.workspace-view { display: flex; flex: 1; min-height: 0; overflow: hidden; }

.ws-panel { display: flex; flex-direction: column; min-width: 200px; overflow: hidden; }

.panel-header {
  display: flex; align-items: center; gap: 0.3rem;
  padding: 0.35rem 0.6rem; background: var(--sidebar-bg);
  border-bottom: 1px solid var(--border-color);
  font-size: 0.75rem; font-weight: 600; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.03em; flex-shrink: 0;
}
.panel-header .mdi { font-size: 0.9rem; }

.panel-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; background: var(--sidebar-bg); }

.divider { width: 4px; cursor: col-resize; background: var(--border-color); flex-shrink: 0; transition: background 0.15s; }
.divider:hover, .divider:active { background: var(--primary-color); }

.h-divider { height: 4px; cursor: row-resize; background: var(--border-color); flex-shrink: 0; transition: background 0.15s; }
.h-divider:hover, .h-divider:active { background: var(--primary-color); }

.ws-section { flex-shrink: 0; }
.graph-section { flex: 1; min-height: 0; display: flex; flex-direction: column; }

.ws-section-header {
  display: flex; align-items: center; gap: 0.3rem;
  padding: 0.4rem 0.6rem; cursor: pointer; user-select: none;
  font-size: 0.7rem; font-weight: 700;
  color: var(--primary-color);
  text-transform: uppercase; letter-spacing: 0.05em;
}
.ws-section-header:hover { background: rgba(0,0,0,0.03); }
.ws-section-title { flex: 1; }
.refresh-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.85rem; padding: 0; }
.refresh-btn:hover { color: var(--text-color); }
.ws-section-body { padding: 0 0.6rem 0.5rem; }

.commit-input {
  width: 100%; padding: 0.35rem 0.45rem;
  border: 1px solid var(--border-color); border-radius: 4px;
  background: var(--card-bg); color: var(--text-color);
  font-size: 0.78rem; font-family: inherit; resize: none; outline: none; margin-bottom: 0.3rem;
}
.commit-input:focus { border-color: var(--primary-color); }
.commit-actions { display: flex; gap: 0.3rem; margin-bottom: 0.4rem; }
.commit-btn {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.2rem;
  background: var(--primary-color); border: none; border-radius: 4px;
  color: #fff; cursor: pointer; font-size: 0.78rem; font-weight: 600; padding: 0.35rem;
}
.commit-btn:hover:not(:disabled) { filter: brightness(1.1); }
.commit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.push-btn {
  display: flex; align-items: center; gap: 0.2rem;
  background: none; border: 1px solid var(--border-color); border-radius: 4px;
  color: var(--text-color); cursor: pointer; font-size: 0.78rem; padding: 0.35rem 0.5rem;
}
.push-btn:hover:not(:disabled) { border-color: var(--primary-color); color: var(--primary-color); }
.push-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.commit-result { font-size: 0.72rem; padding: 0.2rem 0.4rem; border-radius: 3px; margin-bottom: 0.3rem; }
.result-ok { color: #16a34a; background: rgba(22,163,74,0.1); }
.result-err { color: #dc2626; background: rgba(220,38,38,0.1); }

.changes-header { display: flex; align-items: center; justify-content: space-between; font-size: 0.78rem; font-weight: 600; color: var(--text-color); padding: 0.25rem 0; border-top: 1px solid var(--border-color); }
.changes-count { background: var(--primary-color); color: #fff; font-size: 0.6rem; font-weight: 700; padding: 0.08rem 0.35rem; border-radius: 8px; }
.changes-empty { color: var(--text-muted); font-size: 0.72rem; padding: 0.2rem 0; }
.changes-list { max-height: 200px; overflow-y: auto; }
.change-item { display: flex; align-items: center; gap: 0.35rem; padding: 0.15rem 0; font-size: 0.72rem; }
.change-status { font-weight: 700; font-size: 0.68rem; width: 18px; text-align: center; flex-shrink: 0; }
.cs-M { color: #d97706; } .cs-A { color: #16a34a; } .cs-D { color: #dc2626; }
.cs-qq { color: #16a34a; } .cs-U { color: #dc2626; } .cs-R { color: #2563eb; }
.change-file { color: var(--text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.graph-body { overflow-y: auto; flex: 1; padding: 0 0.6rem; }
.graph-entry { display: flex; align-items: baseline; gap: 0.35rem; padding: 0.15rem 0; font-size: 0.72rem; }
.graph-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--primary-color); flex-shrink: 0; margin-top: 2px; }
.graph-message { color: var(--text-color); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.graph-refs { display: flex; gap: 0.15rem; flex-shrink: 0; }
.graph-ref { font-size: 0.58rem; font-weight: 600; padding: 0.03rem 0.3rem; border-radius: 3px; }
.ref-head { background: rgba(22,163,74,0.15); color: #16a34a; }
.ref-main { background: rgba(37,99,235,0.15); color: #2563eb; }
.ref-remote { background: rgba(124,58,237,0.12); color: #7c3aed; }
.ref-branch { background: rgba(217,119,6,0.12); color: #d97706; }
.graph-author { color: var(--text-muted); font-size: 0.68rem; flex-shrink: 0; white-space: nowrap; }

/* Terminals */
.terminal-body { flex: 1; min-height: 0; overflow: hidden; background: #1e1e2e; }
</style>
