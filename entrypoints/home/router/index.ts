import { createRouter, createWebHashHistory } from 'vue-router';
import Home from '../pages/Home.vue';

// Home stays eager as the landing page; the rest load on first visit instead of in one 1.8 MB chunk.
const routes = [
  { path: '/', name: 'Home', component: Home },
  // fitViewport: from sm up Layout locks to the window height, so the table or chart scrolls inside, never the page.
  { path: '/list', name: 'list', component: () => import('../pages/List.vue'), meta: { fitViewport: true } },
  { path: '/forecast', name: 'Forecast', component: () => import('../pages/Forecast.vue'), meta: { fitViewport: true } },
  { path: '/settings', name: 'Settings', component: () => import('../pages/Settings.vue') },
  { path: '/help', name: 'Help', component: () => import('../pages/Help.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
