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
            <button class="btn btn-ghost" @click="runNow(job.id)">Run Now</button>
            <button class="btn btn-ghost" @click="toggleEnabled(job)">
              {{ job.enabled ? 'Disable' : 'Enable' }}
            </button>
            <button class="btn btn-ghost" @click="navigateToEdit(job)">Edit</button>
            <button class="btn btn-ghost btn-danger-text" @click="openDeleteModal(job)">Delete</button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="jobPendingDelete" class="modal-backdrop" role="presentation" @click.self="cancelDelete">
      <section class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
        <h2 id="delete-title">Delete backup job?</h2>
        <p>
          Delete "{{ jobPendingDelete.name }}" and remove it from the Backup Jobs list.
        </p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="cancelDelete">Cancel</button>
          <button class="btn btn-danger" @click="confirmDelete">Delete</button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const jobs = ref([])
const loading = ref(true)
const jobPendingDelete = ref(null)

let unsubscribeRunEvents = null

onMounted(async () => {
  try {
    const result = await window.dropsync.jobs.listWithLatestRun()
    jobs.value = result || []
  } catch {
    jobs.value = []
  } finally {
    loading.value = false
  }

  unsubscribeRunEvents = window.dropsync.runs.onRunEvent((channel, data) => {
    const jobIndex = jobs.value.findIndex(j => j.id === data.jobId)
    if (jobIndex === -1) return

    if (channel === 'runs:started') {
      jobs.value[jobIndex] = {
        ...jobs.value[jobIndex],
        last_run_status: 'running'
      }
    } else if (channel === 'runs:completed') {
      jobs.value[jobIndex] = {
        ...jobs.value[jobIndex],
        last_run_status: 'completed',
        last_run_finished_at: data.finished_at || new Date().toISOString()
      }
    } else if (channel === 'runs:failed') {
      jobs.value[jobIndex] = {
        ...jobs.value[jobIndex],
        last_run_status: 'failed',
        last_run_finished_at: data.finished_at || new Date().toISOString()
      }
    }
  })
})

onUnmounted(() => {
  if (unsubscribeRunEvents) {
    unsubscribeRunEvents()
    unsubscribeRunEvents = null
  }
})

function navigateToCreate () {
  router.push('/jobs/new')
}

function navigateToEdit (job) {
  router.push(`/jobs/${job.id}/edit`)
}

async function runNow (jobId) {
  await window.dropsync.runs.runNow(jobId)
}

async function toggleEnabled (job) {
  const result = await window.api.jobs.toggleEnabled(job.id)
  if (result && result.ok) {
    const idx = jobs.value.findIndex(j => j.id === job.id)
    if (idx !== -1) {
      jobs.value[idx] = { ...jobs.value[idx], enabled: !jobs.value[idx].enabled }
    }
  }
}

function openDeleteModal (job) {
  jobPendingDelete.value = job
}

function cancelDelete () {
  jobPendingDelete.value = null
}

async function confirmDelete () {
  const job = jobPendingDelete.value
  if (!job) return

  const result = await window.api.jobs.delete(job.id)
  if (result && result.ok) {
    jobs.value = jobs.value.filter(existing => existing.id !== job.id)
  }
  jobPendingDelete.value = null
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

.btn-secondary {
  background-color: transparent;
  border: 1px solid var(--color-primary);
  color: var(--color-primary);
}

.btn-secondary:hover {
  background-color: var(--color-surface-hover);
}

.btn-danger {
  background-color: var(--color-error);
  color: #ffffff;
}

.btn-danger:hover {
  background-color: #b93c3c;
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

/* Delete confirmation modal */
.modal-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-page);
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 1000;
}

.confirm-modal {
  width: min(100%, 420px);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: var(--space-card);
}

.confirm-modal h2 {
  margin-bottom: var(--space-unit);
}

.confirm-modal p {
  color: var(--color-muted);
  margin-bottom: var(--space-section);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-unit);
}
</style>
