<template>
  <div class="codemap-view">
    <div class="codemap-tabs">
      <button
        class="codemap-tab"
        :class="{ 'is-active': activeTab === 'generate' }"
        @click="activeTab = 'generate'"
      >
        <span class="mdi mdi-robot-outline"></span> Generate
      </button>
      <button
        class="codemap-tab"
        :class="{ 'is-active': activeTab === 'map' }"
        @click="showMap()"
      >
        <span class="mdi mdi-graph-outline"></span> Map
      </button>
      <div class="codemap-tab-spacer"></div>
      <button
        v-if="activeTab === 'map' && mapHtml"
        class="codemap-tab-action"
        title="Reload the map from disk"
        @click="loadMap()"
      >
        <span class="mdi mdi-refresh"></span> Reload
      </button>
    </div>

    <!-- Generate stays mounted: it hosts a long-lived agent terminal. -->
    <PlanDocCreator
      v-show="activeTab === 'generate'"
      doc-title="Code Map"
      doc-subtitle="Generate an interactive map of the modules, dependencies, and end-to-end flows in this repository"
      doc-folder="Code Map"
      doc-file-name="codemap.html"
      doc-short-name="Code Map"
      doc-detect-file="codemap.html"
      skill-match="code map"
      skill-category="Insight"
      require-skill
      preview-via-emit
      :create-instruction="createInstruction"
      :refine-instruction="refineInstruction"
      :visible="visible && activeTab === 'generate'"
      @change-view="$emit('change-view', $event)"
      @preview-doc="showMap()"
    />

    <div v-if="activeTab === 'map'" class="codemap-pane">
      <p v-if="mapError" class="codemap-message codemap-message--error">{{ mapError }}</p>
      <div v-else-if="mapLoading" class="codemap-message">Loading the code map...</div>
      <div v-else-if="!mapHtml" class="codemap-empty">
        <span class="mdi mdi-graph-outline"></span>
        <p>No code map yet.</p>
        <button class="codemap-empty-btn" @click="activeTab = 'generate'">Generate one</button>
      </div>
      <iframe
        v-else
        class="codemap-frame"
        sandbox="allow-scripts"
        :srcdoc="mapHtml"
      ></iframe>
    </div>
  </div>
</template>

<script>
import { ref, watch } from 'vue';
import PlanDocCreator from './PlanPrdView.vue';

const MAP_FILE = 'Code Map/codemap.html';

// The skill body carries the full specification, so these instructions only
// have to start the run. codemap.html / .json / .lock are always written as a
// set — never one without the others.
const createInstruction =
  'Analyze this repository and generate the code map now. Write all three files together: ' +
  '"docs/Code Map/codemap.html", "docs/Code Map/codemap.json", and "docs/Code Map/codemap.lock". ' +
  'Do not modify any product code. When you are done, run the verification checks and show the report.';

const refineInstruction =
  'A code map already exists under "docs/Code Map/". Compare the existing "docs/Code Map/codemap.lock" ' +
  'against the current repository, list the modules that changed, then regenerate ' +
  '"docs/Code Map/codemap.html", "docs/Code Map/codemap.json", and "docs/Code Map/codemap.lock" together. ' +
  'Do not modify any product code. When you are done, run the verification checks and show the report.';

export default {
  name: 'ReviewCodeMapView',
  components: { PlanDocCreator },
  emits: ['change-view'],
  props: {
    visible: { type: Boolean, default: true },
  },
  setup(props) {
    const activeTab = ref('generate');
    const mapHtml = ref('');
    const mapError = ref('');
    const mapLoading = ref(false);

    async function loadMap() {
      mapLoading.value = true;
      mapError.value = '';
      try {
        // Check existence first so "not generated yet" reads as an empty state
        // while a genuine read failure still surfaces as an error.
        const exists = await window.electron.ipcRenderer.invoke('filetree:fileExists', MAP_FILE);
        mapHtml.value = exists
          ? await window.electron.ipcRenderer.invoke('filetree:readFile', MAP_FILE)
          : '';
      } catch (e) {
        mapHtml.value = '';
        mapError.value = e?.message || `Could not read docs/${MAP_FILE}.`;
      } finally {
        mapLoading.value = false;
      }
    }

    // Always re-read on entry — a run that finished since the last look should
    // show its new map, not a stale one.
    function showMap() {
      activeTab.value = 'map';
      loadMap();
    }

    watch(() => props.visible, (isVisible) => {
      if (!isVisible) return;
      // The Plan file tree opens us straight on the map when the user clicks
      // codemap.html. Consume the flag so it only applies to that navigation.
      if (window.__codeMapOpenTab === 'map') {
        window.__codeMapOpenTab = null;
        showMap();
        return;
      }
      if (activeTab.value === 'map') loadMap();
    }, { immediate: true });

    return {
      activeTab, mapHtml, mapError, mapLoading, loadMap, showMap,
      createInstruction, refineInstruction,
    };
  },
};
</script>

<style scoped>
.codemap-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-color);
  color: var(--text-color);
}

.codemap-tabs {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0 1rem;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.codemap-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.7rem 0.9rem;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.85rem;
  cursor: pointer;
}

.codemap-tab:hover { color: var(--text-color); }

.codemap-tab.is-active {
  color: #6dd4a0;
  border-bottom-color: #6dd4a0;
}

.codemap-tab-spacer { flex: 1; }

.codemap-tab-action {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.78rem;
  cursor: pointer;
}

.codemap-tab-action:hover { color: var(--text-color); border-color: #6dd4a0; }

.codemap-pane {
  flex: 1;
  display: flex;
  min-height: 0;
}

.codemap-frame {
  flex: 1;
  border: none;
  background: #0A1220;
}

.codemap-message {
  margin: 0;
  padding: 2rem;
  font-size: 0.88rem;
  color: var(--text-muted);
}

.codemap-message--error { color: #e06060; }

.codemap-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: var(--text-muted);
}

.codemap-empty .mdi {
  font-size: 2.5rem;
  opacity: 0.4;
}

.codemap-empty p { margin: 0; font-size: 0.88rem; }

.codemap-empty-btn {
  margin-top: 0.5rem;
  padding: 0.45rem 0.9rem;
  border: none;
  border-radius: 6px;
  background: #6dd4a0;
  color: #0A1220;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
}

.codemap-empty-btn:hover { background: #86efac; }
</style>
