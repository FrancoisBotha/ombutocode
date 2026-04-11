<template>
  <div class="view-container" v-if="!sessionActive">
    <div class="mockups-header">
      <div>
        <h1>Mockups</h1>
        <p class="text-muted">UI mockups from docs/Mockups/</p>
      </div>
    </div>
    <div class="mockups-gen-bar">
      <button class="mockup-gen-btn" :disabled="agents.length === 0" @click="showGenPanel = !showGenPanel">
        <span class="mdi mdi-robot-outline"></span> Generate Mockup
      </button>
    </div>

    <!-- Generate panel -->
    <div v-if="showGenPanel" class="mockup-gen-panel">
      <div class="mockup-gen-row">
        <div class="mockup-gen-field mockup-gen-field-sm">
          <label>Skill</label>
          <select v-model="selectedSkill" class="mockup-gen-select" @change="loadSelectedSkillContent">
            <option value="">-- None --</option>
            <option v-for="s in skillFiles" :key="s.path" :value="s.path">{{ s.displayName }}</option>
          </select>
        </div>
        <div class="mockup-gen-field mockup-gen-field-sm">
          <label>Agent</label>
          <select v-model="selectedAgent" class="mockup-gen-select">
            <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </div>
        <div class="mockup-gen-field mockup-gen-field-sm">
          <label>Epic</label>
          <select v-model="selectedEpic" class="mockup-gen-select">
            <option value="">-- None --</option>
            <option v-for="e in epicFiles" :key="e.path" :value="e.path">{{ e.displayName }}</option>
          </select>
        </div>
        <div class="mockup-gen-field mockup-gen-field-grow">
          <label>Description</label>
          <input v-model="mockupDescription" class="mockup-gen-input" placeholder="e.g. Dashboard page with sidebar, header, and analytics cards" />
        </div>
        <div class="mockup-gen-field mockup-gen-field-md">
          <label>Save as</label>
          <input v-model="mockupFilename" class="mockup-gen-input" placeholder="Mockup_Dashboard.png" />
        </div>
        <div class="mockup-gen-field mockup-gen-field-btns">
          <label>&nbsp;</label>
          <div class="mockup-gen-actions">
            <button class="mockup-gen-btn-primary" :disabled="!selectedAgent || !mockupDescription.trim()" @click="startGenSession">
              <span class="mdi mdi-creation"></span> Generate
            </button>
            <button class="mockup-gen-btn-secondary" @click="showGenPanel = false">Cancel</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading mockups…</div>
    <div v-else-if="mockups.length === 0" class="empty">No image files found in docs/Mockups/</div>

    <div v-else class="gallery">
      <div
        v-for="m in mockups"
        :key="m.path"
        class="mockup-card"
      >
        <img v-if="m.dataUrl" :src="m.dataUrl" :alt="m.name" class="thumb" @click="openLightbox(m)" />
        <div class="mockup-card-footer">
          <span v-if="renamingPath !== m.path" class="mockup-name" @click="openLightbox(m)">{{ m.name }}</span>
          <input
            v-else
            v-model="renameValue"
            class="mockup-rename-input"
            @keyup.enter="confirmRename(m)"
            @keyup.escape="renamingPath = null"
            @blur="confirmRename(m)"
          />
          <div class="mockup-card-actions">
            <button class="mockup-action-btn" @click.stop="openLinkDialog(m)" title="Link to Epic">
              <span class="mdi mdi-link-variant"></span>
            </button>
            <button class="mockup-action-btn" @click.stop="startRename(m)" title="Rename">
              <span class="mdi mdi-pencil-outline"></span>
            </button>
            <button class="mockup-action-btn mockup-action-delete" @click.stop="deleteMockup(m)" title="Delete">
              <span class="mdi mdi-delete-outline"></span>
            </button>
          </div>
          <div v-if="m.linkedEpic" class="mockup-linked-epic" :title="m.linkedEpic">
            <span class="mdi mdi-flag-outline"></span> {{ m.linkedEpic.replace('docs/Epics/', '').replace('.md', '').replace(/_/g, ' ') }}
          </div>
        </div>
      </div>
    </div>

    <!-- Link to Epic dialog -->
    <Teleport to="body">
      <div v-if="showLinkDialog" class="mockup-link-overlay" @click.self="showLinkDialog = false">
        <div class="mockup-link-dialog">
          <h3>Link Mockup to Epic</h3>
          <p class="mockup-link-file">{{ linkingMockup?.name }}</p>
          <div v-if="newEpicsForLink.length === 0" class="mockup-link-empty">
            No epics with status NEW found.
          </div>
          <div v-else class="mockup-link-list">
            <div
              v-for="epic in newEpicsForLink"
              :key="epic.path"
              class="mockup-link-item"
              :class="{ 'is-selected': selectedLinkEpic === epic.path }"
              @click="selectedLinkEpic = epic.path"
            >
              <span class="mdi mdi-flag-outline"></span>
              <span>{{ epic.displayName }}</span>
            </div>
          </div>
          <div class="mockup-link-actions">
            <button class="mockup-gen-btn-secondary" @click="showLinkDialog = false">Cancel</button>
            <button class="mockup-gen-btn-primary" :disabled="!selectedLinkEpic" @click="confirmLink">
              <span class="mdi mdi-link-variant"></span> Link
            </button>
            <button v-if="linkingMockup?.linkedEpic" class="mockup-gen-btn-secondary" style="margin-left:auto" @click="unlinkMockup">
              <span class="mdi mdi-link-variant-off"></span> Unlink
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Lightbox overlay -->
    <div v-if="lightbox" class="lightbox" @click.self="lightbox = null">
      <img :src="lightbox.dataUrl" :alt="lightbox.name" class="lightbox-img" />
      <div class="lightbox-footer">
        <span class="lightbox-caption">{{ lightbox.name }}</span>
        <div class="lightbox-actions">
          <button class="lightbox-btn" @click.stop="startRenameLightbox" title="Rename">
            <span class="mdi mdi-pencil-outline"></span> Rename
          </button>
          <button class="lightbox-btn lightbox-btn-danger" @click.stop="deleteMockupFromLightbox" title="Delete">
            <span class="mdi mdi-delete-outline"></span> Delete
          </button>
          <button class="lightbox-btn" @click="lightbox = null">Close</button>
        </div>
      </div>
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
          <div class="mockup-detail-item" v-if="styleGuideFile">
            <span class="mockup-detail-label">Style Guide</span>
            <label class="mockup-fr-item">
              <input type="checkbox" v-model="includeStyleGuide" />
              <span>{{ styleGuideFile }}</span>
            </label>
          </div>
          <div class="mockup-detail-item">
            <span class="mockup-detail-label">Additional Instructions</span>
            <textarea
              v-model="additionalInstructions"
              class="mockup-extra-input"
              placeholder="Any extra guidance for the agent..."
              rows="3"
            ></textarea>
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
    const epicFiles = ref([]);
    const frFiles = ref([]);
    const skillFiles = ref([]);
    const selectedEpic = ref('');
    const selectedFRs = ref([]);
    const selectedSkill = ref('');
    const selectedSkillContent = ref('');
    const additionalInstructions = ref('');
    const styleGuideFile = ref('');
    const includeStyleGuide = ref(false);

    // Session
    const sessionActive = ref(false);
    const terminalContainer = ref(null);
    const currentShellId = ref('');
    const sessionPrompt = ref('');
    const panelWidth = ref(300);

    async function loadMockups() {
      try {
        await loadMockupLinks();
        const list = await window.electron.ipcRenderer.invoke('filetree:scanMockups');
        const loaded = await Promise.all(
          list.map(async (item) => {
            const dataUrl = await window.electron.ipcRenderer.invoke('filetree:readImage', item.path);
            return { ...item, dataUrl, linkedEpic: mockupLinks.value[item.name] || '' };
          })
        );
        mockups.value = loaded;
      } catch (e) {
        console.error('Failed to load mockups:', e);
      } finally {
        loading.value = false;
      }
    }

    async function loadContextFiles() {
      try {
        const tree = await window.electron.ipcRenderer.invoke('filetree:scan');
        if (tree && tree.children) {
          const epicsFolder = tree.children.find(c => c.name === 'Epics');
          if (epicsFolder && epicsFolder.children) {
            epicFiles.value = epicsFolder.children
              .filter(f => f.type === 'file' && f.name.endsWith('.md'))
              .map(f => ({ name: f.name, path: f.path, displayName: f.name.replace('.md', '').replace(/_/g, ' ') }));
          }
          const frFolder = tree.children.find(c => c.name === 'Functional Requirements');
          if (frFolder && frFolder.children) {
            frFiles.value = frFolder.children.filter(f => f.type === 'file' && f.name.endsWith('.md'));
          }
          const sgFolder = tree.children.find(c => c.name === 'Style Guide');
          if (sgFolder && sgFolder.children) {
            const sgFile = sgFolder.children.find(f => f.type === 'file' && f.name.endsWith('.md'));
            if (sgFile) {
              styleGuideFile.value = sgFile.path;
              includeStyleGuide.value = true;
            }
          }
          const skillsFolder = tree.children.find(c => c.name === 'Skills');
          if (skillsFolder && skillsFolder.children) {
            skillFiles.value = skillsFolder.children
              .filter(f => f.type === 'file' && f.name.endsWith('.md'))
              .map(f => ({ name: f.name, path: f.path, displayName: f.name.replace('.md', '').replace(/_/g, ' ') }));
            // Auto-select mockup skill
            const mockupSkill = skillFiles.value.find(s =>
              s.name.toLowerCase().includes('mockup') || s.displayName.toLowerCase().includes('mockup')
            );
            if (mockupSkill) {
              selectedSkill.value = mockupSkill.path;
              loadSelectedSkillContent();
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

    const renamingPath = ref(null);
    const renameValue = ref('');

    // Link to Epic
    const showLinkDialog = ref(false);
    const linkingMockup = ref(null);
    const selectedLinkEpic = ref('');
    const newEpicsForLink = ref([]);
    const mockupLinks = ref({});

    async function loadMockupLinks() {
      try {
        const content = await window.electron.ipcRenderer.invoke('filetree:readFile', 'Mockups/.mockup-links.json');
        mockupLinks.value = JSON.parse(content);
      } catch (_) {
        mockupLinks.value = {};
      }
    }

    async function saveMockupLinks() {
      try {
        await window.electron.ipcRenderer.invoke('filetree:writeFile', 'Mockups/.mockup-links.json', JSON.stringify(mockupLinks.value, null, 2));
      } catch (e) {
        console.error('Failed to save mockup links:', e);
      }
    }

    async function loadEpicsForLink() {
      try {
        const tree = await window.electron.ipcRenderer.invoke('filetree:scan');
        if (tree && tree.children) {
          const folder = tree.children.find(c => c.name === 'Epics');
          if (folder && folder.children) {
            const epics = [];
            for (const f of folder.children.filter(f => f.type === 'file' && f.name.endsWith('.md'))) {
              let status = 'NEW';
              try {
                const content = await window.electron.ipcRenderer.invoke('filetree:readFile', f.path);
                const match = content.match(/status:\*?\*?\s*(.*)/i);
                if (match) status = match[1].replace(/\*\*/g, '').trim();
              } catch (_) {}
              if (status.toUpperCase() === 'NEW') {
                epics.push({ path: f.path, displayName: f.name.replace('.md', '').replace(/_/g, ' ') });
              }
            }
            newEpicsForLink.value = epics;
          }
        }
      } catch (_) {}
    }

    async function openLinkDialog(m) {
      linkingMockup.value = m;
      selectedLinkEpic.value = m.linkedEpic || '';
      await loadEpicsForLink();
      showLinkDialog.value = true;
    }

    async function confirmLink() {
      if (!linkingMockup.value || !selectedLinkEpic.value) return;
      const epicPath = 'docs/' + selectedLinkEpic.value;
      const mockupPath = 'docs/' + linkingMockup.value.path;
      mockupLinks.value[linkingMockup.value.name] = epicPath;
      await saveMockupLinks();
      await addMockupRefToEpic(selectedLinkEpic.value, mockupPath);
      const m = mockups.value.find(x => x.path === linkingMockup.value.path);
      if (m) m.linkedEpic = epicPath;
      showLinkDialog.value = false;
    }

    async function unlinkMockup() {
      if (!linkingMockup.value) return;
      const epicPath = linkingMockup.value.linkedEpic;
      const mockupPath = 'docs/' + linkingMockup.value.path;
      delete mockupLinks.value[linkingMockup.value.name];
      await saveMockupLinks();
      if (epicPath) await removeMockupRefFromEpic(epicPath.replace('docs/', ''), mockupPath);
      const m = mockups.value.find(x => x.path === linkingMockup.value.path);
      if (m) m.linkedEpic = '';
      showLinkDialog.value = false;
    }

    async function addMockupRefToEpic(epicRelPath, mockupPath) {
      try {
        let content = await window.electron.ipcRenderer.invoke('filetree:readFile', epicRelPath);
        // Check if references section exists
        const refMatch = content.match(/^(## \d+\.\s*References)\s*$/m);
        if (refMatch) {
          // Check if mockup already referenced
          if (content.includes(mockupPath)) return;
          // Find the references section and append
          const refIdx = content.indexOf(refMatch[0]);
          const afterRef = content.substring(refIdx + refMatch[0].length);
          const nextSection = afterRef.match(/\n## \d+\./);
          const insertPos = nextSection ? refIdx + refMatch[0].length + nextSection.index : content.length;
          const before = content.substring(0, insertPos);
          const after = content.substring(insertPos);
          // Find the last line before next section or end
          const trimmedBefore = before.trimEnd();
          content = trimmedBefore + '\n- mockup: ' + mockupPath + '\n' + after;
        } else {
          // No references section — append one
          content = content.trimEnd() + '\n\n## References\n\n- mockup: ' + mockupPath + '\n';
        }
        await window.electron.ipcRenderer.invoke('filetree:writeFile', epicRelPath, content);
      } catch (e) {
        console.error('Failed to update epic references:', e);
      }
    }

    async function removeMockupRefFromEpic(epicRelPath, mockupPath) {
      try {
        let content = await window.electron.ipcRenderer.invoke('filetree:readFile', epicRelPath);
        // Remove the mockup reference line
        const lines = content.split('\n');
        const filtered = lines.filter(line => !line.includes(mockupPath));
        content = filtered.join('\n');
        await window.electron.ipcRenderer.invoke('filetree:writeFile', epicRelPath, content);
      } catch (e) {
        console.error('Failed to update epic references:', e);
      }
    }

    function openLightbox(m) {
      lightbox.value = m;
    }

    function startRename(m) {
      renamingPath.value = m.path;
      renameValue.value = m.name;
    }

    async function confirmRename(m) {
      if (!renamingPath.value) return;
      const newName = renameValue.value.trim();
      renamingPath.value = null;
      if (!newName || newName === m.name) return;
      const newPath = 'Mockups/' + newName;
      try {
        await window.electron.ipcRenderer.invoke('filetree:renameFile', m.path, newPath);
        loadMockups();
      } catch (e) {
        console.error('Failed to rename mockup:', e);
      }
    }

    async function deleteMockup(m) {
      if (!confirm(`Delete "${m.name}"?`)) return;
      try {
        await window.electron.ipcRenderer.invoke('filetree:deleteFile', m.path);
        mockups.value = mockups.value.filter(x => x.path !== m.path);
      } catch (e) {
        console.error('Failed to delete mockup:', e);
      }
    }

    function startRenameLightbox() {
      if (!lightbox.value) return;
      const name = prompt('Rename mockup:', lightbox.value.name);
      if (!name || name === lightbox.value.name) return;
      const newPath = 'Mockups/' + name;
      window.electron.ipcRenderer.invoke('filetree:renameFile', lightbox.value.path, newPath).then(() => {
        lightbox.value = null;
        loadMockups();
      }).catch(e => console.error('Failed to rename:', e));
    }

    function deleteMockupFromLightbox() {
      if (!lightbox.value) return;
      if (!confirm(`Delete "${lightbox.value.name}"?`)) return;
      window.electron.ipcRenderer.invoke('filetree:deleteFile', lightbox.value.path).then(() => {
        lightbox.value = null;
        loadMockups();
      }).catch(e => console.error('Failed to delete:', e));
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

      const skillPrefix = selectedSkillContent.value ? selectedSkillContent.value + '\n\n' : '';

      const contextParts = [];
      if (selectedEpic.value) contextParts.push(`Read the epic specification at "docs/${selectedEpic.value}" for context on what this screen should accomplish.`);
      if (includeStyleGuide.value && styleGuideFile.value) {
        contextParts.push(`Read the project style guide at "docs/${styleGuideFile.value}" and follow its design conventions, colours, typography, and component standards.`);
      }
      const contextNote = contextParts.length > 0 ? contextParts.join(' ') + '\n\n' : '';

      const extraInstructions = additionalInstructions.value.trim() ? `\n\nAdditional instructions: ${additionalInstructions.value.trim()}` : '';

      const prompt = `${skillPrefix}${contextNote}Generate a UI mockup image based on this description: "${mockupDescription.value.trim()}"

Save the generated image to "docs/Mockups/${filename}".

Before saving, confirm the file path with me and let me modify it if needed.

Guidelines:
- Create a clean, professional UI mockup
- If a Style Guide is provided, follow it for all visual decisions (theme, colours, fonts, spacing)
- Include realistic placeholder content
- Show the layout clearly with proper spacing and hierarchy
- Do not invent design conventions — use what is documented${extraInstructions}`;

      sessionPrompt.value = prompt;

      const agentCmd = selectedAgent.value;
      let args;
      if (agentCmd === 'claude') {
        args = ['--verbose', '--dangerously-skip-permissions', prompt];
      } else {
        // Codex, Kimi, and others: spawn without prompt, send as interactive input
        args = [];
      }

      await window.electron.ipcRenderer.invoke('agent:spawnInteractive', shellId, agentCmd, args);

      // For non-Claude agents, send prompt as input after agent starts up
      if (agentCmd !== 'claude') {
        setTimeout(() => {
          window.electron.ipcRenderer.invoke('workspace:writeShell', shellId, prompt + '\r');
        }, 3000);
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

    onMounted(() => { loadMockups(); loadAgents(); loadContextFiles(); });
    onBeforeUnmount(() => {
      if (currentShellId.value) window.electron.ipcRenderer.invoke('workspace:killShell', currentShellId.value);
      cleanup();
    });

    return {
      mockups, loading, lightbox, openLightbox,
      renamingPath, renameValue, startRename, confirmRename, deleteMockup,
      startRenameLightbox, deleteMockupFromLightbox,
      showLinkDialog, linkingMockup, selectedLinkEpic, newEpicsForLink,
      openLinkDialog, confirmLink, unlinkMockup,
      showGenPanel, agents, selectedAgent, mockupDescription, mockupFilename,
      epicFiles, frFiles, skillFiles, selectedEpic, selectedFRs, selectedSkill, loadSelectedSkillContent,
      additionalInstructions, styleGuideFile, includeStyleGuide,
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

.mockup-card-footer {
  display: flex;
  align-items: center;
  padding: 0.35rem 0.5rem;
  gap: 0.25rem;
}

.mockup-name {
  flex: 1;
  font-size: 0.78rem;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.mockup-rename-input {
  flex: 1;
  padding: 0.2rem 0.4rem;
  border: 1px solid #6dd4a0;
  border-radius: 3px;
  background: rgba(255,255,255,0.04);
  color: var(--text-color);
  font-size: 0.78rem;
  outline: none;
}

.mockup-card-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}

.mockup-card:hover .mockup-card-actions {
  opacity: 1;
}

.mockup-action-btn {
  background: transparent;
  border: none;
  color: rgba(255,255,255,0.3);
  cursor: pointer;
  padding: 0.2rem;
  border-radius: 3px;
  font-size: 0.85rem;
  transition: all 0.12s;
}

.mockup-action-btn:hover {
  color: rgba(255,255,255,0.7);
  background: rgba(255,255,255,0.06);
}

.mockup-action-delete:hover {
  color: #e06060;
  background: rgba(224,96,96,0.1);
}

.mockup-linked-epic {
  padding: 0.15rem 0.5rem;
  font-size: 0.68rem;
  color: #6dd4a0;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  border-top: 1px solid rgba(255,255,255,0.04);
}

/* Link dialog */
.mockup-link-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}

.mockup-link-dialog {
  background: #1e2535; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px;
  padding: 1.5rem; width: 400px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}

.mockup-link-dialog h3 {
  margin: 0 0 0.25rem; font-size: 1.05rem; color: rgba(255,255,255,0.9);
}

.mockup-link-file {
  margin: 0 0 1rem; font-size: 0.78rem; color: var(--text-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.mockup-link-empty {
  padding: 1.5rem; text-align: center; color: rgba(255,255,255,0.25); font-size: 0.85rem;
}

.mockup-link-list {
  max-height: 250px; overflow-y: auto; margin-bottom: 1rem;
  border: 1px solid rgba(255,255,255,0.06); border-radius: 6px;
}

.mockup-link-item {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem;
  font-size: 0.82rem; color: rgba(255,255,255,0.6); cursor: pointer;
  border-bottom: 1px solid rgba(255,255,255,0.03); transition: background 0.1s;
}

.mockup-link-item:last-child { border-bottom: none; }
.mockup-link-item:hover { background: rgba(255,255,255,0.04); }

.mockup-link-item.is-selected {
  background: rgba(109,212,160,0.1); color: #6dd4a0;
}

.mockup-link-item .mdi { color: #6dd4a0; }

.mockup-link-actions {
  display: flex; gap: 0.5rem; align-items: center;
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

.lightbox-footer {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 0.75rem;
}

.lightbox-caption {
  color: #ccc;
  font-size: 0.9rem;
  flex: 1;
}

.lightbox-actions {
  display: flex;
  gap: 0.4rem;
}

.lightbox-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.4rem 0.8rem;
  border: none;
  border-radius: 5px;
  background: rgba(255,255,255,0.12);
  color: rgba(255,255,255,0.7);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s;
}

.lightbox-btn:hover {
  background: rgba(255,255,255,0.2);
}

.lightbox-btn-danger:hover {
  background: rgba(224,96,96,0.3);
  color: #e06060;
}

/* Header with generate button */
.mockups-header { margin-bottom: 0.5rem; }
.mockups-header h1 { margin-bottom: 0.25rem; }
.mockups-gen-bar { margin-bottom: 1rem; }

.mockup-gen-btn {
  display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.5rem 1rem; border: none;
  border-radius: 6px; background: #6dd4a0; color: #0A1220; font-size: 0.85rem; font-weight: 500; cursor: pointer; transition: all 0.15s;
}
.mockup-gen-btn:hover:not(:disabled) { background: #86efac; }
.mockup-gen-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* Generate panel */
.mockup-gen-panel {
  padding: 0.75rem; margin-bottom: 1rem; border-radius: 8px;
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
}
.mockup-gen-row { display: flex; gap: 0.6rem; align-items: flex-end; }
.mockup-gen-field { display: flex; flex-direction: column; gap: 0.2rem; }
.mockup-gen-field label { font-size: 0.68rem; font-weight: 600; color: rgba(255,255,255,0.4); white-space: nowrap; }
.mockup-gen-field-sm { flex: 0 0 140px; }
.mockup-gen-field-md { flex: 0 0 200px; }
.mockup-gen-field-grow { flex: 1; min-width: 0; }
.mockup-gen-field-btns { flex-shrink: 0; }
.mockup-gen-select, .mockup-gen-input {
  width: 100%; padding: 0.4rem 0.5rem; border: 1px solid rgba(255,255,255,0.1);
  border-radius: 5px; background: #0A1220; color: var(--text-color, #d4d8dd); font-size: 0.82rem; outline: none;
}
.mockup-gen-select:focus, .mockup-gen-input:focus { border-color: #6dd4a0; }
.mockup-gen-actions { display: flex; gap: 0.4rem; }
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
.mockup-fr-list { display: flex; flex-direction: column; gap: 0.3rem; margin-top: 0.2rem; }
.mockup-fr-item { display: flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; color: rgba(255,255,255,0.55); cursor: pointer; }
.mockup-fr-item input[type="checkbox"] { width: 14px; height: 14px; accent-color: #6dd4a0; cursor: pointer; }
.mockup-fr-item:hover { color: rgba(255,255,255,0.8); }
.mockup-fr-none { font-size: 0.75rem; color: rgba(255,255,255,0.25); font-style: italic; }
.mockup-extra-input {
  width: 100%; padding: 0.4rem 0.5rem; border: 1px solid rgba(255,255,255,0.1); border-radius: 5px;
  background: #0A1220; color: var(--text-color, #d4d8dd); font-size: 0.8rem; outline: none; resize: vertical; font-family: inherit; margin-top: 0.2rem;
}
.mockup-extra-input:focus { border-color: #6dd4a0; }
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
