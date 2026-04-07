<template>
  <div class="editor-view">
    <header class="title-bar">
      <div class="title-copy">
        <p class="folder-path">docs / Class Diagrams /</p>
        <h1 class="file-name">{{ fileName }}</h1>
      </div>
      <div class="title-actions">
        <button class="tool-btn" :class="{ active: tool === 'select' }" @click="tool = 'select'">
          <span class="mdi mdi-cursor-default"></span>
        </button>
        <button class="tool-btn" @click="addClass" title="Add Class">
          <span class="mdi mdi-shape-rectangle-plus"></span> Class
        </button>
        <button class="tool-btn" :class="{ active: tool === 'assoc' }" @click="tool = 'assoc'" title="Association">
          <span class="mdi mdi-arrow-right"></span> Assoc
        </button>
        <button class="tool-btn" :class="{ active: tool === 'inherit' }" @click="tool = 'inherit'" title="Inheritance">
          <span class="mdi mdi-arrow-up-thin"></span> Inherit
        </button>
        <button class="tool-btn" :class="{ active: tool === 'compos' }" @click="tool = 'compos'" title="Composition">
          <span class="mdi mdi-rhombus"></span> Comp
        </button>
        <button class="tool-btn" :class="{ active: tool === 'aggreg' }" @click="tool = 'aggreg'" title="Aggregation">
          <span class="mdi mdi-rhombus-outline"></span> Aggr
        </button>
        <button class="tool-btn delete-tool-btn" :disabled="!selectedId" @click="deleteSelected">
          <span class="mdi mdi-delete"></span>
        </button>
        <div class="spacer"></div>
        <button class="tool-btn" @click="zoomIn"><span class="mdi mdi-magnify-plus-outline"></span></button>
        <span class="zoom-label">{{ zoomPercent }}%</span>
        <button class="tool-btn" @click="zoomOut"><span class="mdi mdi-magnify-minus-outline"></span></button>
        <button class="tool-btn" @click="zoomReset"><span class="mdi mdi-magnify-scan"></span></button>
        <div class="spacer"></div>
        <span v-if="saved" class="saved-indicator">Saved</span>
        <button class="save-btn" @click="onSave" :disabled="saving || !dirty">{{ saving ? 'Saving...' : 'Save' }}</button>
        <button class="cancel-btn" @click="goBack">Cancel</button>
      </div>
    </header>

    <div v-if="loading" class="state-card"><p>Loading diagram...</p></div>
    <div v-else-if="notFound" class="state-card"><p>Diagram file not found.</p></div>

    <div v-else class="canvas-container" ref="canvasContainer">
      <svg ref="svgEl" class="diagram-canvas" :viewBox="viewBox"
        @mousedown="onCanvasMouseDown" @mousemove="onCanvasMouseMove"
        @mouseup="onCanvasMouseUp" @wheel.prevent="onWheel">
        <defs>
          <marker id="cd-ah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#888"/>
          </marker>
          <marker id="cd-inherit" markerWidth="12" markerHeight="10" refX="12" refY="5" orient="auto">
            <polygon points="0 0, 12 5, 0 10" fill="none" stroke="#888" stroke-width="1.2"/>
          </marker>
          <marker id="cd-diamond" markerWidth="12" markerHeight="8" refX="12" refY="4" orient="auto">
            <polygon points="0 4, 6 0, 12 4, 6 8" fill="#888" stroke="#888" stroke-width="1"/>
          </marker>
          <marker id="cd-diamond-o" markerWidth="12" markerHeight="8" refX="12" refY="4" orient="auto">
            <polygon points="0 4, 6 0, 12 4, 6 8" fill="var(--card-bg, #1e1e2e)" stroke="#888" stroke-width="1"/>
          </marker>
        </defs>

        <!-- Relationships -->
        <g v-for="(rel, ri) in relationships" :key="'r' + ri">
          <line :x1="getRelStart(rel).x" :y1="getRelStart(rel).y"
            :x2="getRelEnd(rel).x" :y2="getRelEnd(rel).y"
            stroke="#888" stroke-width="1.5"
            :marker-end="relMarker(rel.type)"/>
        </g>

        <!-- Connection in progress -->
        <line v-if="connectFrom && connectMouse"
          :x1="getClassCenter(connectFrom).x" :y1="getClassCenter(connectFrom).y"
          :x2="connectMouse.x" :y2="connectMouse.y"
          stroke="#4a90e2" stroke-width="1.5" stroke-dasharray="6,3"/>

        <!-- Classes -->
        <g v-for="cls in classes" :key="cls.id"
          :transform="`translate(${cls.x}, ${cls.y})`"
          class="class-el" :class="{ selected: selectedId === cls.id }"
          @mousedown.stop="onClassMouseDown($event, cls)">

          <!-- Background -->
          <rect x="0" y="0" :width="classWidth(cls)" :height="classHeight(cls)"
            fill="var(--card-bg, #1e1e2e)" stroke="#ccc" stroke-width="1.5" rx="2"/>
          <!-- Name section -->
          <rect x="0" y="0" :width="classWidth(cls)" height="28"
            fill="rgba(74,144,226,0.12)" stroke="none" rx="2"/>
          <text :x="classWidth(cls)/2" y="19" text-anchor="middle"
            fill="#ccc" font-size="13" font-weight="bold" font-family="sans-serif"
            class="class-label" @dblclick.stop="startEditName(cls)">{{ cls.name }}</text>
          <!-- Divider 1 -->
          <line x1="0" y1="28" :x2="classWidth(cls)" y2="28" stroke="#555" stroke-width="0.5"/>
          <!-- Attributes -->
          <text v-for="(attr, ai) in cls.attributes" :key="'a'+ai"
            x="6" :y="28 + 16 + ai * 16"
            fill="#aaa" font-size="11" font-family="monospace"
            class="class-label" @dblclick.stop="startEditAttr(cls, ai)">{{ attr }}</text>
          <!-- Divider 2 -->
          <line x1="0" :y1="attrSectionEnd(cls)" :x2="classWidth(cls)" :y2="attrSectionEnd(cls)" stroke="#555" stroke-width="0.5"/>
          <!-- Operations -->
          <text v-for="(op, oi) in cls.operations" :key="'o'+oi"
            x="6" :y="attrSectionEnd(cls) + 16 + oi * 16"
            fill="#aaa" font-size="11" font-family="monospace"
            class="class-label" @dblclick.stop="startEditOp(cls, oi)">{{ op }}</text>

          <!-- Add buttons (visible when selected) -->
          <g v-if="selectedId === cls.id" class="add-btns">
            <text :x="classWidth(cls) - 8" :y="attrSectionEnd(cls) - 4"
              text-anchor="end" fill="#4a90e2" font-size="14" cursor="pointer"
              @click.stop="addAttribute(cls)">+</text>
            <text :x="classWidth(cls) - 8" :y="classHeight(cls) - 4"
              text-anchor="end" fill="#4a90e2" font-size="14" cursor="pointer"
              @click.stop="addOperation(cls)">+</text>
          </g>
        </g>
      </svg>

      <!-- Inline editor -->
      <input v-if="editing" ref="editInput"
        v-model="editValue" class="inline-editor" :style="editStyle"
        @keyup.enter="commitEdit" @keyup.escape="cancelEdit" @blur="commitEdit"/>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { parse, serialize } from '../classDiagramRenderer';

let nextId = 1;
const CONN_TOOLS = new Set(['assoc', 'inherit', 'compos', 'aggreg']);
const TOOL_REL = { assoc: 'association', inherit: 'inheritance', compos: 'composition', aggreg: 'aggregation' };

export default {
  name: 'ClassDiagramEditorView',
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

    const classes = ref([]);
    const relationships = ref([]);
    const tool = ref('select');
    const selectedId = ref(null);

    // Editing
    const editing = ref(null);
    const editValue = ref('');
    const editStyle = ref({});
    let editOriginal = '';

    // Drag
    let dragging = null;
    let dragOffsetX = 0, dragOffsetY = 0;

    // Connect
    const connectFrom = ref(null);
    const connectMouse = ref(null);

    // Zoom
    const zoom = ref(1);
    const panX = ref(0), panY = ref(0);

    let originalContent = '';
    let savedTimeout = null;

    const filePath = computed(() => {
      const p = route.params.path;
      return decodeURIComponent(Array.isArray(p) ? p.join('/') : p || '') || props.filePath || '';
    });
    const fileName = computed(() => {
      const parts = filePath.value.split('/');
      return (parts[parts.length - 1] || '').replace('.mmd', '');
    });

    const zoomPercent = computed(() => Math.round(zoom.value * 100));
    const viewBox = computed(() => {
      const svg = svgEl.value;
      const w = (svg ? svg.clientWidth : 1200) / zoom.value;
      const h = (svg ? svg.clientHeight : 800) / zoom.value;
      return `${panX.value} ${panY.value} ${w} ${h}`;
    });

    function zoomIn() { zoom.value = Math.min(3, zoom.value + 0.15); }
    function zoomOut() { zoom.value = Math.max(0.25, zoom.value - 0.15); }
    function zoomReset() { zoom.value = 1; panX.value = 0; panY.value = 0; }
    function onWheel(e) { e.deltaY < 0 ? zoomIn() : zoomOut(); }

    // ── Class sizing ──
    function classWidth(cls) {
      let maxLen = cls.name.length;
      for (const a of cls.attributes) maxLen = Math.max(maxLen, a.length);
      for (const o of cls.operations) maxLen = Math.max(maxLen, o.length);
      return Math.max(140, maxLen * 7.5 + 20);
    }
    function attrSectionEnd(cls) { return 28 + Math.max(1, cls.attributes.length) * 16 + 6; }
    function classHeight(cls) { return attrSectionEnd(cls) + Math.max(1, cls.operations.length) * 16 + 10; }

    function findClass(id) { return classes.value.find(c => c.id === id); }
    function getClassCenter(id) {
      const cls = findClass(id);
      if (!cls) return { x: 0, y: 0 };
      return { x: cls.x + classWidth(cls) / 2, y: cls.y + classHeight(cls) / 2 };
    }

    function getRelStart(rel) {
      const from = classes.value.find(c => c.name === rel.from);
      const to = classes.value.find(c => c.name === rel.to);
      if (!from || !to) return { x: 0, y: 0 };
      return edgePoint(from, to);
    }
    function getRelEnd(rel) {
      const from = classes.value.find(c => c.name === rel.from);
      const to = classes.value.find(c => c.name === rel.to);
      if (!from || !to) return { x: 0, y: 0 };
      return edgePoint(to, from);
    }
    function edgePoint(cls, other) {
      const w = classWidth(cls), h = classHeight(cls);
      const cx = cls.x + w / 2, cy = cls.y + h / 2;
      const ox = other.x + classWidth(other) / 2, oy = other.y + classHeight(other) / 2;
      const dx = ox - cx, dy = oy - cy;
      const angle = Math.atan2(dy, dx);
      const aw = w / 2 / Math.abs(Math.cos(angle) || 0.001);
      const ah = h / 2 / Math.abs(Math.sin(angle) || 0.001);
      const t = Math.min(aw, ah, Math.sqrt(dx * dx + dy * dy));
      return { x: cx + Math.cos(angle) * Math.min(t, Math.min(aw, ah)), y: cy + Math.sin(angle) * Math.min(t, Math.min(aw, ah)) };
    }

    function relMarker(type) {
      if (type === 'inheritance') return 'url(#cd-inherit)';
      if (type === 'composition') return 'url(#cd-diamond)';
      if (type === 'aggregation') return 'url(#cd-diamond-o)';
      return 'url(#cd-ah)';
    }

    // ── Serialization ──
    function serializeState() {
      return serialize({
        classes: classes.value.map(c => ({ name: c.name, x: c.x, y: c.y, attributes: [...c.attributes], operations: [...c.operations] })),
        relationships: relationships.value.map(r => ({ from: r.from, to: r.to, type: r.type })),
      });
    }
    function markDirty() { dirty.value = serializeState() !== originalContent; saved.value = false; }

    function loadFromSource(source) {
      const parsed = parse(source);
      classes.value = parsed.classes.map((c, i) => ({
        id: nextId++, name: c.name,
        x: c.x != null ? c.x : 100 + i * 200, y: c.y != null ? c.y : 100,
        attributes: c.attributes, operations: c.operations,
      }));
      relationships.value = parsed.relationships;
    }

    // ── Actions ──
    function addClass() {
      const c = { id: nextId++, name: 'NewClass', x: 150 + classes.value.length * 30, y: 100 + classes.value.length * 30, attributes: ['+ id: int'], operations: ['+ getId(): int'] };
      classes.value.push(c);
      selectedId.value = c.id;
      tool.value = 'select';
      markDirty();
    }
    function deleteSelected() {
      if (!selectedId.value) return;
      const cls = findClass(selectedId.value);
      if (cls) {
        relationships.value = relationships.value.filter(r => r.from !== cls.name && r.to !== cls.name);
        classes.value = classes.value.filter(c => c.id !== selectedId.value);
      }
      selectedId.value = null;
      markDirty();
    }
    function addAttribute(cls) {
      cls.attributes.push('+ newAttr: type');
      markDirty();
      nextTick(() => startEditAttr(cls, cls.attributes.length - 1));
    }
    function addOperation(cls) {
      cls.operations.push('+ newOp(): void');
      markDirty();
      nextTick(() => startEditOp(cls, cls.operations.length - 1));
    }

    // ── SVG coords ──
    function svgPoint(e) {
      const svg = svgEl.value;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      return { x: (e.clientX - rect.left) / zoom.value + panX.value, y: (e.clientY - rect.top) / zoom.value + panY.value };
    }

    // ── Mouse ──
    function onClassMouseDown(e, cls) {
      if (editing.value) return;
      if (CONN_TOOLS.has(tool.value)) {
        connectFrom.value = cls.id;
        connectMouse.value = svgPoint(e);
        return;
      }
      selectedId.value = cls.id;
      dragging = cls;
      const pt = svgPoint(e);
      dragOffsetX = pt.x - cls.x;
      dragOffsetY = pt.y - cls.y;
    }
    function onCanvasMouseDown() { if (!editing.value && !CONN_TOOLS.has(tool.value)) selectedId.value = null; }
    function onCanvasMouseMove(e) {
      if (connectFrom.value) { connectMouse.value = svgPoint(e); return; }
      if (!dragging) return;
      const pt = svgPoint(e);
      dragging.x = Math.max(0, pt.x - dragOffsetX);
      dragging.y = Math.max(0, pt.y - dragOffsetY);
    }
    function onCanvasMouseUp(e) {
      if (connectFrom.value) {
        const pt = svgPoint(e);
        const target = findClassAt(pt.x, pt.y);
        if (target && target.id !== connectFrom.value) {
          const fromCls = findClass(connectFrom.value);
          if (fromCls) {
            const relType = TOOL_REL[tool.value] || 'association';
            const exists = relationships.value.some(r => r.from === fromCls.name && r.to === target.name && r.type === relType);
            if (!exists) { relationships.value.push({ from: fromCls.name, to: target.name, type: relType }); markDirty(); }
          }
        }
        connectFrom.value = null; connectMouse.value = null;
        return;
      }
      if (dragging) { markDirty(); dragging = null; }
    }
    function findClassAt(x, y) {
      for (const cls of classes.value) {
        if (x >= cls.x && x <= cls.x + classWidth(cls) && y >= cls.y && y <= cls.y + classHeight(cls)) return cls;
      }
      return null;
    }

    // ── Inline editing ──
    function positionEditor(cls, rowY, width) {
      const container = canvasContainer.value;
      const svgRect = svgEl.value.getBoundingClientRect();
      const cRect = container.getBoundingClientRect();
      const ox = svgRect.left - cRect.left;
      const oy = svgRect.top - cRect.top;
      const z = zoom.value;
      editStyle.value = {
        left: ((cls.x - panX.value) * z + ox + 4) + 'px',
        top: ((cls.y + rowY - panY.value) * z + oy) + 'px',
        width: (width * z - 8) + 'px',
        fontSize: (11 * z) + 'px',
      };
    }

    function startEditName(cls) {
      editOriginal = cls.name;
      editValue.value = cls.name;
      editing.value = { type: 'name', cls };
      positionEditor(cls, 4, classWidth(cls));
      nextTick(() => { if (editInput.value) { editInput.value.focus(); editInput.value.select(); } });
    }
    function startEditAttr(cls, i) {
      editOriginal = cls.attributes[i];
      editValue.value = cls.attributes[i];
      editing.value = { type: 'attr', cls, index: i };
      positionEditor(cls, 28 + 4 + i * 16, classWidth(cls));
      nextTick(() => { if (editInput.value) { editInput.value.focus(); editInput.value.select(); } });
    }
    function startEditOp(cls, i) {
      editOriginal = cls.operations[i];
      editValue.value = cls.operations[i];
      editing.value = { type: 'op', cls, index: i };
      positionEditor(cls, attrSectionEnd(cls) + 4 + i * 16, classWidth(cls));
      nextTick(() => { if (editInput.value) { editInput.value.focus(); editInput.value.select(); } });
    }
    function commitEdit() {
      if (!editing.value) return;
      const val = editValue.value.trim() || editOriginal;
      const e = editing.value;
      if (e.type === 'name') {
        // Update relationship references
        const oldName = e.cls.name;
        e.cls.name = val;
        for (const r of relationships.value) {
          if (r.from === oldName) r.from = val;
          if (r.to === oldName) r.to = val;
        }
      }
      else if (e.type === 'attr') e.cls.attributes[e.index] = val;
      else if (e.type === 'op') e.cls.operations[e.index] = val;
      editing.value = null;
      markDirty();
    }
    function cancelEdit() { editing.value = null; }

    // ── File I/O ──
    async function loadFile() {
      loading.value = true;
      try {
        const content = await window.electron.ipcRenderer.invoke('filetree:readFile', filePath.value);
        originalContent = content;
        loadFromSource(content);
        dirty.value = false;
      } catch (e) { notFound.value = true; }
      finally { loading.value = false; }
    }
    async function onSave() {
      saving.value = true;
      try {
        const content = serializeState();
        await window.electron.ipcRenderer.invoke('filetree:writeFile', filePath.value, content);
        originalContent = content;
        dirty.value = false; saved.value = true;
        if (savedTimeout) clearTimeout(savedTimeout);
        savedTimeout = setTimeout(() => { saved.value = false; }, 2000);
      } catch (e) { console.error(e); }
      finally { saving.value = false; }
    }

    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (dirty.value && !saving.value) onSave(); }
      if (e.key === 'Delete' && selectedId.value && !editing.value) deleteSelected();
      if (e.key === 'Escape') { if (editing.value) cancelEdit(); else { tool.value = 'select'; connectFrom.value = null; connectMouse.value = null; } }
    }

    onMounted(() => { loadFile(); window.addEventListener('keydown', onKeyDown); });
    onUnmounted(() => { if (savedTimeout) clearTimeout(savedTimeout); window.removeEventListener('keydown', onKeyDown); });

    return {
      loading, notFound, saving, saved, dirty, fileName, svgEl, canvasContainer, editInput,
      classes, relationships, tool, selectedId,
      editing, editValue, editStyle, connectFrom, connectMouse,
      zoom, zoomPercent, viewBox, zoomIn, zoomOut, zoomReset, onWheel,
      classWidth, classHeight, attrSectionEnd, getClassCenter,
      getRelStart, getRelEnd, relMarker,
      addClass, deleteSelected, addAttribute, addOperation,
      onClassMouseDown, onCanvasMouseDown, onCanvasMouseMove, onCanvasMouseUp,
      startEditName, startEditAttr, startEditOp, commitEdit, cancelEdit,
      onSave,
      goBack() {
        if (window.__planNavigate) window.__planNavigate('plan-class-diagrams');
        else router.push('/class-diagrams');
      },
    };
  },
};
</script>

<style scoped>
.editor-view { display: flex; flex-direction: column; height: 100%; }
.title-bar { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 1rem; background: var(--card-bg); border-bottom: 1px solid var(--border-color); flex-shrink: 0; gap: 0.5rem; }
.title-copy { min-width: 0; flex-shrink: 0; }
.folder-path { color: var(--text-muted); font-size: 0.75rem; margin: 0 0 0.1rem; }
.file-name { color: var(--text-color); font-size: 1.1rem; margin: 0; }
.title-actions { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
.spacer { width: 1px; height: 24px; background: var(--border-color); margin: 0 0.3rem; }
.tool-btn { display: flex; align-items: center; gap: 0.25rem; background: none; border: 1px solid var(--border-color); border-radius: var(--border-radius); color: var(--text-color); cursor: pointer; font-size: 0.8rem; padding: 0.35rem 0.6rem; transition: var(--transition); }
.tool-btn:hover:not(:disabled) { border-color: var(--primary-color); color: var(--primary-color); }
.tool-btn.active { background: rgba(74,144,226,0.15); border-color: var(--primary-color); color: var(--primary-color); }
.tool-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.delete-tool-btn:hover:not(:disabled) { border-color: #ef4444; color: #ef4444; }
.zoom-label { color: var(--text-muted); font-size: 0.75rem; min-width: 36px; text-align: center; }
.saved-indicator { color: #16a34a; font-size: 0.8rem; font-weight: 500; }
.save-btn { background: #16a34a; border: none; border-radius: var(--border-radius); color: #fff; cursor: pointer; font-size: 0.85rem; font-weight: 600; padding: 0.4rem 1rem; }
.save-btn:hover:not(:disabled) { background: #15803d; }
.save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.cancel-btn { background: transparent; border: 1px solid var(--border-color); border-radius: var(--border-radius); color: var(--text-color); cursor: pointer; font-size: 0.85rem; padding: 0.4rem 0.9rem; }
.cancel-btn:hover { border-color: var(--text-muted); }
.state-card { padding: 2rem; color: var(--text-muted); }

.canvas-container { flex: 1; position: relative; overflow: auto; background: var(--card-bg); }
.diagram-canvas { width: 100%; height: 100%; min-height: 600px; }
.class-el { cursor: grab; }
.class-el:active { cursor: grabbing; }
.class-el.selected rect:first-child { stroke: #4a90e2; }
.class-label { cursor: pointer; }

.inline-editor { position: absolute; background: var(--card-bg); border: 1px solid var(--primary-color); border-radius: 3px; color: var(--text-color); font-family: monospace; text-align: left; padding: 1px 3px; outline: none; z-index: 10; }
</style>
