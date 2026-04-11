<template>
  <div class="jobs-page">
    <header class="page-header">
      <h1>Backup Jobs</h1>
      <button class="btn btn-primary" @click="navigateToCreate">Create Job</button>
    </header>

    <div v-if="loading" class="empty-state">
      <p class="empty-message">Loading…</p>
    </div>

    <div v-else-if="jobs.length === 0" class="empty-state">
      <p class="empty-message">No backup jobs configured yet.</p>
      <button class="btn btn-primary" @click="navigateToCreate">Create Backup Job</button>
    </div>

    <table v-else class="jobs-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Source</th>
          <th>Target</th>
          <th>Interval</th>
          <th>Status</th>
          <th>Next Run</th>
          <th>Last Run</th>
          <th class="col-actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="job in jobs" :key="job.id" :class="{ 'row-disabled': !job.enabled }">
          <td>{{ job.name }}</td>
          <td class="cell-path" :title="job.source_path">{{ job.source_path }}</td>
          <td class="cell-path" :title="job.target_path">{{ job.target_path }}</td>
          <td>{{ job.interval }}</td>
          <td>
            <span class="status-pill" :class="statusClass(job)">{{ statusLabel(job) }}</span>
          </td>
          <td class="cell-muted">{{ job.enabled ? formatDate(job.next_run_at) : '—' }}</td>
          <td class="cell-muted">{{ formatDate(job.last_run_finished_at) }}</td>
          <td class="col-actions">
            <button class="btn btn-ghost">Run Now</button>
            <button class="btn btn-ghost">Edit</button>
            <button class="btn btn-ghost btn-danger-text">Delete</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const jobs = ref([])
const loading = ref(true)

onMounted(async () => {
  try {
    const result = await window.dropsync.jobs.listWithLatestRun()
    jobs.value = result || []
  } catch {
    jobs.value = []
  } finally {
    loading.value = false
  }
})

function navigateToCreate () {
  router.push('/jobs/new')
}

function statusLabel (job) {
  if (!job.enabled) return 'Disabled'
  if (job.last_run_status) return job.last_run_status.charAt(0).toUpperCase() + job.last_run_status.slice(1)
  return 'Idle'
}

function statusClass (job) {
  if (!job.enabled) return 'pill-disabled'
  const s = (job.last_run_status || '').toLowerCase()
  if (s === 'running') return 'pill-running'
  if (s === 'completed') return 'pill-completed'
  if (s === 'failed') return 'pill-failed'
  if (s === 'skipped') return 'pill-skipped'
  return 'pill-idle'
}

function formatDate (iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString()
}
</script>

<style scoped>
.jobs-page {
  /* Page padding applied by parent .content container */
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-section);
}

/* Buttons */
.btn {
  font-family: var(--font-family);
  font-size: var(--font-size-body);
  font-weight: 600;
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  padding: 8px 16px;
  transition: background-color 0.15s ease;
}

.btn-primary {
  background-color: var(--color-primary);
  color: #ffffff;
}

.btn-primary:hover {
  background-color: var(--color-primary-hover);
}

.btn-ghost {
  background: none;
  color: var(--color-primary);
  padding: 4px 8px;
}

.btn-ghost:hover {
  background-color: var(--color-surface-hover);
}

.btn-danger-text {
  color: var(--color-error);
}

/* Table */
.jobs-table {
  width: 100%;
  border-collapse: collapse;
}

.jobs-table thead th {
  background-color: #F0F3F7;
  font-size: var(--font-size-small);
  font-weight: 600;
  color: var(--color-muted);
  text-align: left;
  padding: var(--space-row-v) var(--space-row-h);
}

.jobs-table tbody td {
  padding: var(--space-row-v) var(--space-row-h);
  border-bottom: 1px solid var(--color-border);
  font-size: var(--font-size-body);
  vertical-align: middle;
}

.jobs-table tbody tr:hover {
  background-color: var(--color-surface-hover);
}

.row-disabled td {
  color: var(--color-muted);
}

.col-actions {
  text-align: right;
  white-space: nowrap;
}

.cell-path {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-muted {
  color: var(--color-muted);
  font-size: var(--font-size-small);
}

/* Status pills */
.status-pill {
  display: inline-block;
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  font-size: var(--font-size-small);
  font-weight: 600;
  color: #ffffff;
}

.pill-running   { background-color: var(--color-primary); }
.pill-completed { background-color: var(--color-success); }
.pill-failed    { background-color: var(--color-error); }
.pill-skipped   { background-color: var(--color-warning); }
.pill-disabled  { background-color: var(--color-muted); }
.pill-idle      { background-color: var(--color-border); color: var(--color-muted); }

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 0;
  gap: 16px;
}

.empty-message {
  font-size: var(--font-size-body);
  color: var(--color-muted);
}
</style>
