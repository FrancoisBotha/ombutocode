<template>
  <div class="dashboard-view">
    <div class="page-header">
      <div>
        <h1>Dashboard</h1>
        <p class="text-muted">Project overview for {{ systemName || 'Ombuto Plan' }}</p>
      </div>
    </div>

    <div v-if="loading" class="state-message">Loading dashboard data...</div>

    <template v-else>
      <!-- Stats Cards -->
      <section class="section">
        <h2 class="section-title">Project Summary</h2>
        <div class="stats-grid">
          <div class="stat-card" v-for="stat in stats" :key="stat.label"
            @click="stat.planView && window.__planNavigate ? window.__planNavigate(stat.planView) : (stat.route && $router.push(stat.route))" :class="{ clickable: stat.route }">
            <span class="mdi stat-icon" :class="stat.icon"></span>
            <div class="stat-info">
              <span class="stat-count">{{ stat.count }}</span>
              <span class="stat-label">{{ stat.label }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Sub-Systems -->
      <section v-if="subsystems.length > 0" class="section">
        <h2 class="section-title">Sub-Systems</h2>
        <div class="subsystem-grid">
          <div v-for="ss in subsystems" :key="ss" class="subsystem-card">
            <span class="mdi mdi-lan subsystem-icon"></span>
            <span class="subsystem-name">{{ ss }}</span>
            <span class="subsystem-fr-count">{{ frCountBySubsystem[ss] || 0 }} FRs</span>
          </div>
        </div>
      </section>

      <!-- FR Status Breakdown -->
      <section v-if="frStatusBreakdown.length > 0" class="section">
        <h2 class="section-title">Functional Requirements by Status</h2>
        <div class="status-bar-chart">
          <div v-for="s in frStatusBreakdown" :key="s.status" class="bar-row">
            <span class="bar-label">{{ s.status }}</span>
            <div class="bar-track">
              <div class="bar-fill" :style="{ width: s.pct + '%' }" :class="'fill-' + s.status.toLowerCase()"></div>
            </div>
            <span class="bar-count">{{ s.count }}</span>
          </div>
        </div>
      </section>

      <!-- Recent Use Cases -->
      <section v-if="useCases.length > 0" class="section">
        <h2 class="section-title">Use Cases</h2>
        <div class="recent-list">
          <div v-for="uc in useCases" :key="uc.path" class="recent-item"
            @click="window.__planNavigate ? window.__planNavigate('plan-use-case-editor', uc.path) : $router.push('/use-case/' + encodeURIComponent(uc.path))">
            <span class="mdi mdi-text-box-outline recent-icon"></span>
            <span class="recent-title">{{ uc.name.replace('.md', '') }}</span>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue';

function parseSubsystems(content) {
  const subs = [];
  for (const line of content.split('\n')) {
    const m = line.trim().match(/^-\s+name:\s*"?([^"]*)"?\s*$/);
    if (m) subs.push(m[1]);
  }
  return subs;
}

function parseFRTable(content) {
  const rows = [];
  const lines = content.split('\n');
  let inTable = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed.split('|').map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length);
    if (cells.length < 4) continue;
    if (cells[0] === 'ID') { inTable = true; continue; }
    if (cells[0].match(/^-+$/)) continue;
    if (inTable) rows.push({ id: cells[0], subsystem: cells[1], description: cells[2], status: cells[3] });
  }
  return rows;
}

export default {
  name: 'DashboardView',
  setup() {
    const loading = ref(true);
    const systemName = ref('');
    const subsystems = ref([]);
    const frRows = ref([]);
    const nfrRows = ref([]);
    const useCases = ref([]);
    const useCaseDiagrams = ref([]);
    const classDiagrams = ref([]);

    const stats = computed(() => [
      { label: 'Functional Requirements', count: frRows.value.length, icon: 'mdi-checkbox-marked-outline', route: '/functional-requirements' },
      { label: 'Non-Functional Requirements', count: nfrRows.value.length, icon: 'mdi-shield-check-outline', route: '/non-functional-requirements' },
      { label: 'Use Cases', count: useCases.value.length, icon: 'mdi-text-box-multiple-outline', route: '/use-cases' },
      { label: 'Use Case Diagrams', count: useCaseDiagrams.value.length, icon: 'mdi-vector-polygon', route: '/use-case-diagrams' },
      { label: 'Class Diagrams', count: classDiagrams.value.length, icon: 'mdi-shape-outline', route: '/class-diagrams' },
      { label: 'Sub-Systems', count: subsystems.value.length, icon: 'mdi-lan', route: '/structure' },
    ]);

    const frCountBySubsystem = computed(() => {
      const map = {};
      for (const fr of frRows.value) {
        if (fr.subsystem) map[fr.subsystem] = (map[fr.subsystem] || 0) + 1;
      }
      return map;
    });

    const frStatusBreakdown = computed(() => {
      const map = {};
      for (const fr of frRows.value) {
        const s = fr.status || 'Draft';
        map[s] = (map[s] || 0) + 1;
      }
      const total = frRows.value.length || 1;
      return Object.entries(map).map(([status, count]) => ({
        status, count, pct: Math.round(count / total * 100),
      })).sort((a, b) => b.count - a.count);
    });

    async function loadData() {
      loading.value = true;
      const ipc = window.electron.ipcRenderer;

      // Load all data in parallel
      const results = await Promise.allSettled([
        ipc.invoke('filetree:readFile', 'Structure/ProjectStructure.md'),
        ipc.invoke('filetree:readFile', 'Functional Requirements/FunctionalRequirements.md'),
        ipc.invoke('filetree:readFile', 'Non-Functional Requirements/NonFunctionalRequirements.md'),
        ipc.invoke('filetree:scanUseCases'),
        ipc.invoke('filetree:scanUseCaseDiagrams'),
        ipc.invoke('filetree:scanClassDiagrams'),
      ]);

      // Structure
      if (results[0].status === 'fulfilled') {
        const content = results[0].value;
        const sysMatch = content.match(/system:\s*"?([^"\n]+)"?/);
        if (sysMatch) systemName.value = sysMatch[1].trim();
        subsystems.value = parseSubsystems(content);
      }

      // FRs
      if (results[1].status === 'fulfilled') {
        frRows.value = parseFRTable(results[1].value);
      }

      // NFRs
      if (results[2].status === 'fulfilled') {
        nfrRows.value = parseFRTable(results[2].value);
      }

      // Use Cases
      if (results[3].status === 'fulfilled') useCases.value = results[3].value;
      if (results[4].status === 'fulfilled') useCaseDiagrams.value = results[4].value;
      if (results[5].status === 'fulfilled') classDiagrams.value = results[5].value;

      loading.value = false;
    }

    onMounted(loadData);

    return {
      loading, systemName, subsystems,
      frRows, nfrRows, useCases, useCaseDiagrams, classDiagrams,
      stats, frCountBySubsystem, frStatusBreakdown,
    };
  },
};
</script>

<style scoped>
.dashboard-view { max-width: 1200px; padding: 1rem; }
.page-header { margin-bottom: 1.5rem; }
.page-header h1 { margin-bottom: 0.35rem; color: var(--text-color); }
.state-message { padding: 3rem; text-align: center; color: var(--text-muted); }

.section { margin-bottom: 2rem; }
.section-title { font-size: 1rem; font-weight: 600; color: var(--text-color); margin-bottom: 0.75rem; }

/* Stats grid */
.stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.75rem; }
.stat-card { display: flex; align-items: center; gap: 0.75rem; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--border-radius); padding: 1rem; box-shadow: var(--box-shadow); transition: transform 0.15s, box-shadow 0.15s; }
.stat-card.clickable { cursor: pointer; }
.stat-card.clickable:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
.stat-icon { font-size: 1.5rem; color: var(--primary-color); }
.stat-info { display: flex; flex-direction: column; }
.stat-count { font-size: 1.4rem; font-weight: 700; color: var(--text-color); line-height: 1; }
.stat-label { font-size: 0.75rem; color: var(--text-muted); margin-top: 0.15rem; }

/* Sub-systems */
.subsystem-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.5rem; }
.subsystem-card { display: flex; align-items: center; gap: 0.5rem; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--border-radius); padding: 0.6rem 0.9rem; }
.subsystem-icon { color: #4a90e2; font-size: 1rem; }
.subsystem-name { flex: 1; font-size: 0.85rem; color: var(--text-color); }
.subsystem-fr-count { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; }

/* Status bar chart */
.status-bar-chart { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--border-radius); padding: 0.75rem 1rem; }
.bar-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.3rem 0; }
.bar-label { width: 100px; font-size: 0.8rem; color: var(--text-color); text-align: right; }
.bar-track { flex: 1; height: 18px; background: rgba(255,255,255,0.04); border-radius: 3px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 3px; min-width: 2px; transition: width 0.3s; }
.fill-draft { background: #9ca3af; }
.fill-proposed { background: #60a5fa; }
.fill-approved { background: #34d399; }
.fill-implemented { background: #a78bfa; }
.fill-verified { background: #4ade80; }
.fill-deprecated { background: #f87171; }
.bar-count { width: 30px; font-size: 0.8rem; color: var(--text-muted); font-weight: 600; }

/* Recent list */
.recent-list { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--border-radius); overflow: hidden; }
.recent-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.9rem; border-bottom: 1px solid var(--border-color); cursor: pointer; transition: background 0.12s; }
.recent-item:last-child { border-bottom: none; }
.recent-item:hover { background: rgba(74,144,226,0.06); }
.recent-icon { color: var(--primary-color); font-size: 1rem; }
.recent-title { font-size: 0.85rem; color: var(--text-color); }
</style>
