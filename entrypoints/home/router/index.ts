import { createRouter, createWebHashHistory } from 'vue-router';
import Home from '../pages/Home.vue';

// Home stays eager as the landing page; the rest load on first visit instead of in one 1.8 MB chunk.
const routes = [
  { path: '/', name: 'Home', component: Home },
  { path: '/list', name: 'list', component: () => import('../pages/List.vue') },
  { path: '/forecast', name: 'Forecast', component: () => import('../pages/Forecast.vue') },
  { path: '/settings', name: 'Settings', component: () => import('../pages/Settings.vue') },
  { path: '/help', name: 'Help', component: () => import('../pages/Help.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
