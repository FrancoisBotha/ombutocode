import { createRouter, createWebHashHistory } from 'vue-router'
import BackupJobsView from '../views/BackupJobsView.vue'
import BackupLogsView from '../views/BackupLogsView.vue'
import JobConfigView from '../views/JobConfigView.vue'

const routes = [
  { path: '/', redirect: '/jobs' },
  { path: '/jobs', component: BackupJobsView },
  { path: '/jobs/new', component: JobConfigView },
  { path: '/jobs/:id/edit', component: JobConfigView },
  { path: '/logs', component: BackupLogsView }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
