import { createRouter, createWebHashHistory } from 'vue-router'
import BackupJobsView from '../views/BackupJobsView.vue'
import BackupLogsView from '../views/BackupLogsView.vue'

const routes = [
  { path: '/', redirect: '/jobs' },
  { path: '/jobs', component: BackupJobsView },
  { path: '/logs', component: BackupLogsView }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
