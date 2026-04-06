import { createRouter, createWebHashHistory } from 'vue-router';
import BoardList from '../components/BoardList.vue';
import AuthCallback from '../pages/AuthCallback.vue';

const routes = [
  {
    path: '/',
    name: 'Home',
    component: BoardList
  },
  {
    path: '/auth/dropbox/callback',
    name: 'AuthCallback',
    component: AuthCallback
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

export default router;
