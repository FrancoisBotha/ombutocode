<template>
  <div class="editor-view">
    <header class="title-bar">
      <div class="title-copy">
        <p class="folder-path">docs / Data Model /</p>
        <h1 class="file-name">{{ fileName }}</h1>
      </div>
      <div class="title-actions">
        <button class="tool-btn" @click="goBack" title="Back to Data Model"><span class="mdi mdi-arrow-left"></span> Back</button>
        <span class="table-count">{{ tables.length }} tables, {{ relationships.length }} relationships</span>
        <div class="spacer"></div>
        <button class="tool-btn" @click="zoomIn"><span class="mdi mdi-magnify-plus-outline"></span></button>
        <span class="zoom-label">{{ zoomPercent }}%</span>
        <button class="tool-btn" @click="zoomOut"><span class="mdi mdi-magnify-minus-outline"></span></button>
        <button class="tool-btn" @click="zoomReset"><span class="mdi mdi-magnify-scan"></span></button>
        <button class="tool-btn" @click="autoLayout"><span class="mdi mdi-auto-fix"></span> Re-layout</button>
      </div>
    </header>

    <div v-if="loading" class="state-card"><p>Loading DDL...</p></div>
    <div v-else-if="notFound" class="state-card"><p>File not found.</p></div>

    <div v-else class="canvas-container" ref="canvasContainer">
      <svg ref="svgEl" class="diagram-canvas" :viewBox="viewBox"
        @mousedown="onCanvasMouseDown" @mousemove="onCanvasMouseMove"
        @mouseup="onCanvasMouseUp" @wheel.prevent="onWheel"
        @contextmenu.prevent>
        <defs>
          <marker id="er-ah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#888"/>
          </marker>
        </defs>

        <!-- Relationships -->
        <g v-for="(rel, ri) in resolvedRels" :key="'r' + ri">
          <path :d="relPath(rel)" fill="none" stroke="#555" stroke-width="1.2" marker-end="url(#er-ah)"/>
        </g>

        <!-- Tables -->
        <g v-for="t in tablePositions" :key="t.name"
          :transform="`translate(${t.x}, ${t.y})`"
          class="table-el"
          @mousedown.stop="onTableMouseDown($event, t)">
          <!-- Background -->
          <rect x="0" y="0" :width="tableWidth(t)" :height="tableHeight(t)"
            fill="var(--card-bg, #1e1e2e)" stroke="#555" stroke-width="1" rx="3"/>
          <!-- Header -->
          <rect x="0" y="0" :width="tableWidth(t)" height="26"
            fill="rgba(74,144,226,0.18)" stroke="none" rx="3"/>
          <rect x="0" y="22" :width="tableWidth(t)" height="4" fill="rgba(74,144,226,0.18)" stroke="none"/>
          <text :x="tableWidth(t)/2" y="18" text-anchor="middle"
            fill="#ccc" font-size="12" font-weight="bold" font-family="sans-serif">{{ t.name }}</text>
          <line x1="0" y1="26" :x2="tableWidth(t)" y2="26" stroke="#555" stroke-width="0.5"/>
          <!-- Columns -->
          <g v-for="(col, ci) in t.columns" :key="ci">
            <text x="6" :y="26 + 14 + ci * 16" fill="#aaa" font-size="10" font-family="monospace">
              <tspan v-if="col.pk" fill="#e2a514">PK </tspan>
              <tspan v-else-if="col.fk" fill="#4a90e2">FK </tspan>
              <tspan>{{ col.name }}</tspan>
            </text>
            <text :x="tableWidth(t) - 6" :y="26 + 14 + ci * 16" text-anchor="end" fill="#555" font-size="10" font-family="monospace">{{ col.type }}</text>
          </g>
        </g>
      </svg>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { parseDDL } from '../ddlParser';

export default {
  name: 'ERDiagramView',
  props: {
    filePath: { type: String, default: '' }
  },
  setup(props) {
    const route = useRoute();
    const loading = ref(true);
    const notFound = ref(false);
    const svgEl = ref(null);
    const canvasContainer = ref(null);

    const tables = ref([]);
    const relationships = ref([]);
    const tablePositions = ref([]);

    const zoom = ref(0.7);
    const panX = ref(0), panY = ref(0);
    let dragging = null;
    let dragOffsetX = 0, dragOffsetY = 0;
    let panning = false;
    let panStartX = 0, panStartY = 0, panOrigX = 0, panOrigY = 0;

    const filePath = computed(() => {
      const p = route.params.path;
      return decodeURIComponent(Array.isArray(p) ? p.join('/') : p || '') || props.filePath || '';
    });
    const fileName = computed(() => {
      const parts = filePath.value.split('/');
      return (parts[parts.length - 1] || '');
    });

    const zoomPercent = computed(() => Math.round(zoom.value * 100));
    const viewBox = computed(() => {
      const svg = svgEl.value;
      const w = (svg ? svg.clientWidth : 1200) / zoom.value;
      const h = (svg ? svg.clientHeight : 800) / zoom.value;
      return `${panX.value} ${panY.value} ${w} ${h}`;
    });

    function zoomIn() { zoom.value = Math.min(3, zoom.value + 0.1); }
    function zoomOut() { zoom.value = Math.max(0.15, zoom.value - 0.1); }
    function zoomReset() { zoom.value = 0.7; panX.value = 0; panY.value = 0; }
    function onWheel(e) { e.deltaY < 0 ? zoomIn() : zoomOut(); }

    function tableWidth(t) {
      let maxLen = t.name.length;
      for (const c of t.columns) {
        const label = (c.pk ? 'PK ' : c.fk ? 'FK ' : '') + c.name + ' ' + c.type;
        maxLen = Math.max(maxLen, label.length);
      }
      return Math.max(150, maxLen * 7 + 20);
    }
    function tableHeight(t) { return 26 + t.columns.length * 16 + 10; }

    // ── Layout ──
    function autoLayout() {
      const cols = 5;
      const padX = 40, padY = 40;
      let x = padX, y = padY;
      let rowMaxH = 0;
      const colWidths = [];

      // Calculate column widths
      for (let i = 0; i < tables.value.length; i++) {
        const col = i % cols;
        const w = tableWidth(tables.value[i]);
        if (!colWidths[col] || w > colWidths[col]) colWidths[col] = w;
      }

      tablePositions.value = tables.value.map((t, i) => {
        const col = i % cols;
        if (col === 0 && i > 0) {
          y += rowMaxH + padY;
          rowMaxH = 0;
          x = padX;
        }
        const pos = { ...t, x, y };
        const h = tableHeight(t);
        if (h > rowMaxH) rowMaxH = h;
        x += (colWidths[col] || 200) + padX;
        return pos;
      });
    }

    // ── Relationships ──
    const resolvedRels = computed(() => {
      return relationships.value.map(r => {
        const from = tablePositions.value.find(t => t.name === r.from);
        const to = tablePositions.value.find(t => t.name === r.to);
        if (!from || !to) return null;
        return { ...r, fromT: from, toT: to };
      }).filter(Boolean);
    });

    function relPath(rel) {
      const from = rel.fromT;
      const to = rel.toT;
      const fw = tableWidth(from), fh = tableHeight(from);
      const tw = tableWidth(to), th = tableHeight(to);
      const fcx = from.x + fw / 2, fcy = from.y + fh / 2;
      const tcx = to.x + tw / 2, tcy = to.y + th / 2;

      // Find column Y for start and end
      const fromColIdx = from.columns.findIndex(c => c.name === rel.fromCol);
      const toColIdx = to.columns.findIndex(c => c.name === rel.toCol);
      const fy = from.y + 26 + 8 + (fromColIdx >= 0 ? fromColIdx * 16 : 0);
      const ty = to.y + 26 + 8 + (toColIdx >= 0 ? toColIdx * 16 : 0);

      // Determine left/right exit based on relative position
      let fx, tx;
      if (fcx < tcx) {
        fx = from.x + fw;
        tx = to.x;
      } else {
        fx = from.x;
        tx = to.x + tw;
      }

      const midX = (fx + tx) / 2;
      return `M ${fx} ${fy} C ${midX} ${fy}, ${midX} ${ty}, ${tx} ${ty}`;
    }

    // ── Mouse ──
    function svgPoint(e) {
      const svg = svgEl.value;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      return { x: (e.clientX - rect.left) / zoom.value + panX.value, y: (e.clientY - rect.top) / zoom.value + panY.value };
    }
    function onTableMouseDown(e, t) {
      dragging = t;
      const pt = svgPoint(e);
      dragOffsetX = pt.x - t.x;
      dragOffsetY = pt.y - t.y;
    }
    function onCanvasMouseDown(e) {
      if (e.button === 2) {
        // Right-click: start panning
        panning = true;
        panStartX = e.clientX;
        panStartY = e.clientY;
        panOrigX = panX.value;
        panOrigY = panY.value;
        return;
      }
      dragging = null;
    }
    function onCanvasMouseMove(e) {
      if (panning) {
        const dx = (e.clientX - panStartX) / zoom.value;
        const dy = (e.clientY - panStartY) / zoom.value;
        panX.value = panOrigX - dx;
        panY.value = panOrigY - dy;
        return;
      }
      if (!dragging) return;
      const pt = svgPoint(e);
      dragging.x = Math.max(0, pt.x - dragOffsetX);
      dragging.y = Math.max(0, pt.y - dragOffsetY);
    }
    function onCanvasMouseUp() { dragging = null; panning = false; }

    // ── Load ──
    async function loadFile() {
      loading.value = true;
      try {
        const content = await window.electron.ipcRenderer.invoke('filetree:readFile', filePath.value);
        const parsed = parseDDL(content);
        tables.value = parsed.tables;
        relationships.value = parsed.relationships;
        autoLayout();
      } catch (e) {
        notFound.value = true;
        console.error('Failed to load DDL:', e);
      } finally {
        loading.value = false;
      }
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') { dragging = null; }
    }

    onMounted(() => { loadFile(); window.addEventListener('keydown', onKeyDown); });
    onUnmounted(() => { window.removeEventListener('keydown', onKeyDown); });

    return {
      loading, notFound, fileName, svgEl, canvasContainer,
      tables, relationships, tablePositions, resolvedRels,
      zoom, zoomPercent, viewBox, zoomIn, zoomOut, zoomReset, onWheel,
      tableWidth, tableHeight, autoLayout, relPath,
      onTableMouseDown, onCanvasMouseDown, onCanvasMouseMove, onCanvasMouseUp,
      goBack() {
        if (window.__planNavigate) window.__planNavigate('plan-data-model');
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
.table-count { color: var(--text-muted); font-size: 0.8rem; }
.spacer { width: 1px; height: 24px; background: var(--border-color); margin: 0 0.3rem; }
.tool-btn { display: flex; align-items: center; gap: 0.25rem; background: none; border: 1px solid var(--border-color); border-radius: var(--border-radius); color: var(--text-color); cursor: pointer; font-size: 0.8rem; padding: 0.35rem 0.6rem; transition: var(--transition); }
.tool-btn:hover { border-color: var(--primary-color); color: var(--primary-color); }
.zoom-label { color: var(--text-muted); font-size: 0.75rem; min-width: 36px; text-align: center; }
.state-card { padding: 2rem; color: var(--text-muted); }

.canvas-container { flex: 1; position: relative; overflow: auto; background: var(--card-bg); }
.diagram-canvas { width: 100%; height: 100%; min-height: 600px; }
.table-el { cursor: grab; }
.table-el:active { cursor: grabbing; }
</style>
