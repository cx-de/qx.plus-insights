import { createRouter, createWebHashHistory } from 'vue-router';
import Home from '../pages/Home.vue';
import List from '../pages/List.vue';
import Aggregate from '../pages/Aggregate.vue';
import Forecast from '../pages/Forecast.vue';
import Settings from '../pages/Settings.vue';
import Help from '../pages/Help.vue';


const routes = [
  { path: '/', name: 'Home', component: Home },
  { path: '/list', name: 'list', component: List },
  { path: '/aggregate', name: 'Aggregate', component: Aggregate },
  { path: '/forecast', name: 'Forecast', component: Forecast },
  { path: '/settings', name: 'Settings', component: Settings },
  { path: '/help', name: 'Help', component: Help },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
