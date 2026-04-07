<template>
  <div class="editor-view">
    <header class="title-bar">
      <div class="title-copy">
        <p class="folder-path">docs / Use Case Diagrams /</p>
        <h1 class="file-name">{{ fileName }}</h1>
      </div>
      <div class="title-actions">
        <button class="tool-btn" :class="{ active: tool === 'select' }" @click="tool = 'select'" title="Select / Move">
          <span class="mdi mdi-cursor-default"></span>
        </button>
        <button class="tool-btn" @click="addActor" title="Add Actor">
          <span class="mdi mdi-account-plus"></span> Actor
        </button>
        <button class="tool-btn" @click="addUseCase" title="Add Use Case">
          <span class="mdi mdi-shape-oval-plus"></span> Use Case
        </button>
        <button class="tool-btn" :class="{ active: tool === 'connect' }" @click="setConnect('association')" title="Association">
          <span class="mdi mdi-arrow-right"></span> Assoc
        </button>
        <button class="tool-btn" :class="{ active: tool === 'extends' }" @click="setConnect('extends')" title="Extends">
          <span class="mdi mdi-arrow-right-thin"></span> Extends
        </button>
        <button class="tool-btn" :class="{ active: tool === 'includes' }" @click="setConnect('includes')" title="Includes">
          <span class="mdi mdi-arrow-right-thin"></span> Includes
        </button>
        <button
          class="tool-btn delete-tool-btn"
          :disabled="!selectedId"
          @click="deleteSelected"
          title="Delete Selected"
        >
          <span class="mdi mdi-delete"></span>
        </button>
        <div class="spacer"></div>
        <button class="tool-btn" @click="zoomIn" title="Zoom In">
          <span class="mdi mdi-magnify-plus-outline"></span>
        </button>
        <span class="zoom-label">{{ zoomPercent }}%</span>
        <button class="tool-btn" @click="zoomOut" title="Zoom Out">
          <span class="mdi mdi-magnify-minus-outline"></span>
        </button>
        <button class="tool-btn" @click="zoomReset" title="Reset Zoom">
          <span class="mdi mdi-magnify-scan"></span>
        </button>
        <div class="spacer"></div>
        <span v-if="saved" class="saved-indicator">Saved</span>
        <button class="save-btn" type="button" @click="onSave" :disabled="saving || !dirty">
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
        <button class="cancel-btn" type="button" @click="onCancel">Cancel</button>
      </div>
    </header>

    <div v-if="loading" class="state-card"><p>Loading diagram...</p></div>
    <div v-else-if="notFound" class="state-card"><p>Diagram file not found.</p></div>

    <div v-else class="canvas-container" ref="canvasContainer">
      <svg
        ref="svgEl"
        class="diagram-canvas"
        :viewBox="viewBox"
        @mousedown="onCanvasMouseDown"
        @mousemove="onCanvasMouseMove"
        @mouseup="onCanvasMouseUp"
        @dblclick="onCanvasDblClick"
        @wheel.prevent="onWheel"
      >
        <defs>
          <marker id="ah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#888"/>
          </marker>
          <marker id="ah-open" markerWidth="10" markerHeight="8" refX="10" refY="4" orient="auto">
            <polyline points="0 0, 10 4, 0 8" fill="none" stroke="#888" stroke-width="1.2"/>
          </marker>
        </defs>

        <!-- Relationships -->
        <g v-for="(rel, ri) in relationships" :key="'r' + ri">
          <line
            :x1="getConnStart(rel).x"
            :y1="getConnStart(rel).y"
            :x2="getConnEnd(rel).x"
            :y2="getConnEnd(rel).y"
            stroke="#888" stroke-width="1.5"
            :stroke-dasharray="rel.type !== 'association' ? '6,4' : 'none'"
            :marker-end="rel.type !== 'association' ? 'url(#ah-open)' : 'url(#ah)'"
          />
          <text
            v-if="rel.type !== 'association'"
            :x="(getConnStart(rel).x + getConnEnd(rel).x) / 2"
            :y="(getConnStart(rel).y + getConnEnd(rel).y) / 2 - 8"
            text-anchor="middle" fill="#aaa" font-size="10" font-style="italic" font-family="sans-serif"
          >&laquo;{{ rel.type }}&raquo;</text>
        </g>

        <!-- Connection in progress -->
        <line
          v-if="connectFrom && connectMouse"
          :x1="getElementCenter(connectFrom).x"
          :y1="getElementCenter(connectFrom).y"
          :x2="connectMouse.x"
          :y2="connectMouse.y"
          stroke="#4a90e2" stroke-width="1.5" stroke-dasharray="6,3"
        />

        <!-- Actors -->
        <g
          v-for="a in actors"
          :key="'a-' + a.id"
          :transform="`translate(${a.x}, ${a.y})`"
          class="element actor-el"
          :class="{ selected: selectedId === a.id }"
          @mousedown.stop="onElementMouseDown($event, a)"
        >
          <!-- Hit area -->
          <rect x="-25" y="-40" width="50" height="105" fill="transparent" />
          <!-- Head -->
          <circle cx="0" cy="-20" r="10" fill="none" stroke="#ccc" stroke-width="2"/>
          <!-- Body -->
          <line x1="0" y1="-10" x2="0" y2="12" stroke="#ccc" stroke-width="2"/>
          <!-- Arms -->
          <line x1="-16" y1="-2" x2="16" y2="-2" stroke="#ccc" stroke-width="2"/>
          <!-- Left leg -->
          <line x1="0" y1="12" x2="-12" y2="30" stroke="#ccc" stroke-width="2"/>
          <!-- Right leg -->
          <line x1="0" y1="12" x2="12" y2="30" stroke="#ccc" stroke-width="2"/>
          <!-- Label -->
          <text
            x="0" y="48" text-anchor="middle" fill="#ccc" font-size="12" font-family="sans-serif"
            class="element-label"
            @dblclick.stop="startEditing(a)"
          >{{ a.name }}</text>
        </g>

        <!-- Use Cases -->
        <g
          v-for="uc in useCases"
          :key="'uc-' + uc.id"
          :transform="`translate(${uc.x}, ${uc.y})`"
          class="element usecase-el"
          :class="{ selected: selectedId === uc.id }"
          @mousedown.stop="onElementMouseDown($event, uc)"
        >
          <!-- Hit area for dragging -->
          <ellipse cx="0" cy="0" :rx="ucRx(uc)" ry="30" fill="transparent" stroke="none"/>
          <ellipse cx="0" cy="0" :rx="ucRx(uc)" ry="30" fill="none" stroke="#ccc" stroke-width="1.5"/>
          <text
            x="0" y="5" text-anchor="middle" fill="#ccc" font-size="13" font-family="sans-serif"
            class="element-label"
            @dblclick.stop="startEditing(uc)"
          >{{ uc.name }}</text>
        </g>

        <!-- Selection indicator -->
        <rect
          v-if="selectedId && selectedBounds"
          :x="selectedBounds.x - 4"
          :y="selectedBounds.y - 4"
          :width="selectedBounds.w + 8"
          :height="selectedBounds.h + 8"
          fill="none" stroke="#4a90e2" stroke-width="1" stroke-dasharray="4,2" rx="3"
        />
      </svg>

      <!-- Inline text editor overlay -->
      <input
        v-if="editing"
        ref="editInput"
        v-model="editing.name"
        class="inline-editor"
        :style="editInputStyle"
        @keyup.enter="finishEditing"
        @keyup.escape="cancelEditing"
        @blur="finishEditing"
      />
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { parse, serialize } from '../useCaseRenderer';

let nextId = 1;

export default {
  name: 'UseCaseDiagramEditorView',
  props: {
    filePath: { type: String, default: '' }
  },
  setup(props) {
    const route = useRoute();
    const router = useRouter();
    const loading = ref(true);
    const notFound = ref(false);
    const saving = ref(false);
    const saved = ref(false);
    const dirty = ref(false);
    const svgEl = ref(null);
    const canvasContainer = ref(null);
    const editInput = ref(null);

    const actors = ref([]);
    const useCases = ref([]);
    const relationships = ref([]);
    const tool = ref('select');
    const selectedId = ref(null);
    const editing = ref(null);
    const editingOriginalName = ref('');

    // Zoom state
    const zoom = ref(1);
    const panX = ref(0);
    const panY = ref(0);
    const ZOOM_MIN = 0.25;
    const ZOOM_MAX = 3;
    const ZOOM_STEP = 0.15;

    const zoomPercent = computed(() => Math.round(zoom.value * 100));

    const viewBox = computed(() => {
      const svg = svgEl.value;
      const w = svg ? svg.clientWidth : 1200;
      const h = svg ? svg.clientHeight : 800;
      const vw = w / zoom.value;
      const vh = h / zoom.value;
      return `${panX.value} ${panY.value} ${vw} ${vh}`;
    });

    function zoomIn() {
      zoom.value = Math.min(ZOOM_MAX, zoom.value + ZOOM_STEP);
    }
    function zoomOut() {
      zoom.value = Math.max(ZOOM_MIN, zoom.value - ZOOM_STEP);
    }
    function zoomReset() {
      zoom.value = 1;
      panX.value = 0;
      panY.value = 0;
    }
    function onWheel(e) {
      if (e.deltaY < 0) {
        zoomIn();
      } else {
        zoomOut();
      }
    }

    // Drag state
    let dragging = null;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    // Connect state
    const connectFrom = ref(null);
    const connectMouse = ref(null);
    const connectType = ref('association');

    let originalContent = '';
    let savedTimeout = null;

    const filePath = computed(() => {
      const p = route.params.path;
      const joined = Array.isArray(p) ? p.join('/') : p || '';
      return decodeURIComponent(joined) || props.filePath || '';
    });

    const fileName = computed(() => {
      const parts = filePath.value.split('/');
      const name = parts[parts.length - 1] || '';
      return name.replace('.mmd', '');
    });

    const CONNECT_TOOLS = new Set(['connect', 'extends', 'includes']);
    function isConnectTool() { return CONNECT_TOOLS.has(tool.value); }

    function setConnect(type) {
      connectType.value = type;
      tool.value = type === 'association' ? 'connect' : type;
    }

    function ucRx(uc) {
      return Math.max(70, uc.name.length * 6.5 + 30);
    }

    function findElement(id) {
      return actors.value.find(a => a.id === id) || useCases.value.find(u => u.id === id);
    }

    function getElementCenter(id) {
      const el = findElement(id);
      if (!el) return { x: 0, y: 0 };
      return { x: el.x, y: el.y };
    }

    function getConnStart(rel) {
      const el = findElement(rel.fromId);
      if (!el) return { x: 0, y: 0 };
      const target = findElement(rel.toId);
      if (!target) return { x: el.x, y: el.y };
      // Actor: connect from right side
      if (el.type === 'actor') {
        return { x: el.x + 18, y: el.y };
      }
      // Use case: connect from ellipse edge
      const angle = Math.atan2(target.y - el.y, target.x - el.x);
      const rx = ucRx(el);
      return { x: el.x + rx * Math.cos(angle), y: el.y + 30 * Math.sin(angle) };
    }

    function getConnEnd(rel) {
      const el = findElement(rel.toId);
      if (!el) return { x: 0, y: 0 };
      const source = findElement(rel.fromId);
      if (!source) return { x: el.x, y: el.y };
      if (el.type === 'actor') {
        return { x: el.x - 18, y: el.y };
      }
      const angle = Math.atan2(source.y - el.y, source.x - el.x);
      const rx = ucRx(el);
      return { x: el.x + rx * Math.cos(angle), y: el.y + 30 * Math.sin(angle) };
    }

    const selectedBounds = computed(() => {
      const el = findElement(selectedId.value);
      if (!el) return null;
      if (el.type === 'actor') {
        return { x: el.x - 25, y: el.y - 40, w: 50, h: 95 };
      }
      const rx = ucRx(el);
      return { x: el.x - rx, y: el.y - 30, w: rx * 2, h: 60 };
    });

    const editInputStyle = computed(() => {
      if (!editing.value) return {};
      const el = editing.value;
      const container = canvasContainer.value;
      if (!container) return {};
      const rect = container.getBoundingClientRect();
      const svgRect = svgEl.value.getBoundingClientRect();
      const offsetX = svgRect.left - rect.left;
      const offsetY = svgRect.top - rect.top;
      const z = zoom.value;

      // Convert SVG coords to screen coords
      const screenX = (el.x - panX.value) * z + offsetX;
      const screenY = (el.y - panY.value) * z + offsetY;

      if (el.type === 'actor') {
        const w = 120 * z;
        return {
          left: (screenX - w / 2) + 'px',
          top: (screenY + 42 * z) + 'px',
          width: w + 'px',
          fontSize: (12 * z) + 'px',
        };
      }
      const rx = ucRx(el);
      const w = rx * 2 * z;
      return {
        left: (screenX - w / 2) + 'px',
        top: (screenY - 10 * z) + 'px',
        width: w + 'px',
        fontSize: (13 * z) + 'px',
      };
    });

    // ── Serialization ──

    function serializeState() {
      return serialize({
        actors: actors.value.map(a => ({ name: a.name, x: a.x, y: a.y })),
        useCases: useCases.value.map(u => ({ name: u.name, x: u.x, y: u.y })),
        relationships: relationships.value.map(r => {
          const from = findElement(r.fromId);
          const to = findElement(r.toId);
          return { from: from ? from.name : '', to: to ? to.name : '', type: r.type || 'association' };
        }).filter(r => r.from && r.to),
      });
    }

    function markDirty() {
      const current = serializeState();
      dirty.value = current !== originalContent;
      saved.value = false;
    }

    function loadFromSource(source) {
      const parsed = parse(source);
      const actorList = [];
      const ucList = [];
      const rels = [];

      parsed.actors.forEach((a, i) => {
        actorList.push({
          id: nextId++,
          type: 'actor',
          name: a.name,
          x: a.x != null ? a.x : 100,
          y: a.y != null ? a.y : 100 + i * 130,
        });
      });

      parsed.useCases.forEach((uc, i) => {
        ucList.push({
          id: nextId++,
          type: 'usecase',
          name: uc.name,
          x: uc.x != null ? uc.x : 350,
          y: uc.y != null ? uc.y : 100 + i * 80,
        });
      });

      // Resolve relationships by name to id
      for (const r of parsed.relationships) {
        const from = actorList.find(a => a.name === r.from) || ucList.find(u => u.name === r.from);
        const to = actorList.find(a => a.name === r.to) || ucList.find(u => u.name === r.to);
        if (from && to) {
          rels.push({ fromId: from.id, toId: to.id, type: r.type || 'association' });
        }
      }

      actors.value = actorList;
      useCases.value = ucList;
      relationships.value = rels;
    }

    // ── Actions ──

    function addActor() {
      const a = {
        id: nextId++,
        type: 'actor',
        name: 'Actor',
        x: 100 + actors.value.length * 30,
        y: 100 + actors.value.length * 130,
      };
      actors.value.push(a);
      selectedId.value = a.id;
      tool.value = 'select';
      markDirty();
    }

    function addUseCase() {
      const uc = {
        id: nextId++,
        type: 'usecase',
        name: 'Use Case',
        x: 350 + useCases.value.length * 20,
        y: 100 + useCases.value.length * 80,
      };
      useCases.value.push(uc);
      selectedId.value = uc.id;
      tool.value = 'select';
      markDirty();
    }

    function deleteSelected() {
      if (!selectedId.value) return;
      const id = selectedId.value;
      actors.value = actors.value.filter(a => a.id !== id);
      useCases.value = useCases.value.filter(u => u.id !== id);
      relationships.value = relationships.value.filter(r => r.fromId !== id && r.toId !== id);
      selectedId.value = null;
      markDirty();
    }

    // ── Mouse handling ──

    function svgPoint(e) {
      const svg = svgEl.value;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      // Convert screen pixels to SVG coordinates (account for viewBox)
      return {
        x: px / zoom.value + panX.value,
        y: py / zoom.value + panY.value,
      };
    }

    function onElementMouseDown(e, el) {
      if (editing.value) return;

      if (isConnectTool()) {
        connectFrom.value = el.id;
        connectMouse.value = svgPoint(e);
        return;
      }

      selectedId.value = el.id;
      dragging = el;
      const pt = svgPoint(e);
      dragOffsetX = pt.x - el.x;
      dragOffsetY = pt.y - el.y;
    }

    function onCanvasMouseDown(e) {
      if (editing.value) return;
      if (!isConnectTool()) {
        selectedId.value = null;
      }
    }

    function onCanvasMouseMove(e) {
      if (connectFrom.value) {
        connectMouse.value = svgPoint(e);
        return;
      }
      if (!dragging) return;
      const pt = svgPoint(e);
      dragging.x = Math.max(30, pt.x - dragOffsetX);
      dragging.y = Math.max(40, pt.y - dragOffsetY);
    }

    function onCanvasMouseUp(e) {
      if (connectFrom.value) {
        // Find element under cursor
        const pt = svgPoint(e);
        const target = findElementAt(pt.x, pt.y);
        if (target && target.id !== connectFrom.value) {
          const exists = relationships.value.some(
            r => r.fromId === connectFrom.value && r.toId === target.id
          );
          if (!exists) {
            relationships.value.push({ fromId: connectFrom.value, toId: target.id, type: connectType.value });
            markDirty();
          }
        }
        connectFrom.value = null;
        connectMouse.value = null;
        return;
      }

      if (dragging) {
        markDirty();
        dragging = null;
      }
    }

    function onCanvasDblClick(e) {
      // Double click on empty canvas — do nothing
    }

    function findElementAt(x, y) {
      // Check actors
      for (const a of actors.value) {
        if (Math.abs(x - a.x) < 25 && Math.abs(y - a.y) < 50) return a;
      }
      // Check use cases
      for (const uc of useCases.value) {
        const rx = ucRx(uc);
        const dx = (x - uc.x) / rx;
        const dy = (y - uc.y) / 30;
        if (dx * dx + dy * dy <= 1.2) return uc;
      }
      return null;
    }

    // ── Inline editing ──

    function startEditing(el) {
      editingOriginalName.value = el.name;
      editing.value = el;
      nextTick(() => {
        if (editInput.value) {
          editInput.value.focus();
          editInput.value.select();
        }
      });
    }

    function finishEditing() {
      if (!editing.value) return;
      const el = editing.value;
      if (!el.name.trim()) {
        el.name = editingOriginalName.value;
      }
      editing.value = null;
      markDirty();
    }

    function cancelEditing() {
      if (!editing.value) return;
      editing.value.name = editingOriginalName.value;
      editing.value = null;
    }

    // ── File I/O ──

    async function loadFile() {
      loading.value = true;
      notFound.value = false;
      try {
        const content = await window.electron.ipcRenderer.invoke('filetree:readFile', filePath.value);
        originalContent = content;
        loadFromSource(content);
        dirty.value = false;
      } catch (e) {
        notFound.value = true;
        console.error('Failed to load diagram:', e);
      } finally {
        loading.value = false;
      }
    }

    async function onSave() {
      saving.value = true;
      try {
        const content = serializeState();
        await window.electron.ipcRenderer.invoke('filetree:writeFile', filePath.value, content);
        originalContent = content;
        dirty.value = false;
        saved.value = true;
        if (savedTimeout) clearTimeout(savedTimeout);
        savedTimeout = setTimeout(() => { saved.value = false; }, 2000);
      } catch (e) {
        console.error('Failed to save:', e);
      } finally {
        saving.value = false;
      }
    }

    function onCancel() {
      window.__planNavigate ? window.__planNavigate('plan-use-case-diagrams') : router.push('/use-case-diagrams');
    }

    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (dirty.value && !saving.value) onSave();
      }
      if (e.key === 'Delete' && selectedId.value && !editing.value) {
        deleteSelected();
      }
      if (e.key === 'Escape') {
        if (editing.value) {
          cancelEditing();
        } else {
          tool.value = 'select';
          connectFrom.value = null;
          connectMouse.value = null;
        }
      }
    }

    onMounted(() => {
      loadFile();
      window.addEventListener('keydown', onKeyDown);
    });

    onUnmounted(() => {
      if (savedTimeout) clearTimeout(savedTimeout);
      window.removeEventListener('keydown', onKeyDown);
    });

    return {
      loading, notFound, saving, saved, dirty,
      fileName, svgEl, canvasContainer, editInput, viewBox,
      zoom, zoomPercent, zoomIn, zoomOut, zoomReset, onWheel,
      actors, useCases, relationships,
      tool, selectedId, selectedBounds,
      editing, editInputStyle, editingOriginalName,
      connectFrom, connectMouse,
      ucRx, getConnStart, getConnEnd, getElementCenter, connectType,
      setConnect, addActor, addUseCase, deleteSelected,
      onCanvasMouseDown, onCanvasMouseMove, onCanvasMouseUp, onCanvasDblClick,
      onElementMouseDown,
      startEditing, finishEditing, cancelEditing,
      onSave, onCancel,
    };
  },
};
</script>

<style scoped>
.editor-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  background: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  gap: 0.5rem;
}

.title-copy {
  min-width: 0;
  flex-shrink: 0;
}

.folder-path {
  color: var(--text-muted);
  font-size: 0.75rem;
  margin: 0 0 0.1rem;
}

.file-name {
  color: var(--text-color);
  font-size: 1.1rem;
  margin: 0;
}

.title-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.spacer {
  width: 1px;
  height: 24px;
  background: var(--border-color);
  margin: 0 0.3rem;
}

.tool-btn {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  background: none;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  color: var(--text-color);
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0.35rem 0.6rem;
  transition: var(--transition);
}

.tool-btn:hover:not(:disabled) {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.tool-btn.active {
  background: rgba(74, 144, 226, 0.15);
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.tool-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.delete-tool-btn:hover:not(:disabled) {
  border-color: #ef4444;
  color: #ef4444;
}

.zoom-label {
  color: var(--text-muted);
  font-size: 0.75rem;
  min-width: 36px;
  text-align: center;
}

.saved-indicator {
  color: #16a34a;
  font-size: 0.8rem;
  font-weight: 500;
}

.save-btn {
  background: #16a34a;
  border: none;
  border-radius: var(--border-radius);
  color: #fff;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.4rem 1rem;
  transition: var(--transition);
}

.save-btn:hover:not(:disabled) {
  background: #15803d;
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cancel-btn {
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  color: var(--text-color);
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.4rem 0.9rem;
  transition: var(--transition);
}

.cancel-btn:hover {
  border-color: var(--text-muted);
}

.state-card {
  padding: 2rem;
  color: var(--text-muted);
}

/* ── Canvas ── */
.canvas-container {
  flex: 1;
  position: relative;
  overflow: auto;
  background: var(--card-bg);
}

.diagram-canvas {
  width: 100%;
  height: 100%;
  min-height: 600px;
}

.element {
  cursor: grab;
}

.element:active {
  cursor: grabbing;
}

.element-label {
  cursor: pointer;
}

.element.selected .element-label {
  fill: #4a90e2;
}

.element.selected circle,
.element.selected line,
.element.selected ellipse {
  stroke: #4a90e2;
}

/* ── Inline editor ── */
.inline-editor {
  position: absolute;
  background: var(--card-bg);
  border: 1px solid var(--primary-color);
  border-radius: 3px;
  color: var(--text-color);
  font-size: 13px;
  font-family: sans-serif;
  text-align: center;
  padding: 2px 4px;
  outline: none;
  z-index: 10;
}
</style>
