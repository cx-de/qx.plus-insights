import { createApp } from 'vue';
import './style.css';
import '@/assets/tailwind.css';
import App from './App.vue';
import router from './router';
import { i18n } from './i18n';
import { applyTheme } from '~/utils/helper';
import { Chart } from 'chart.js';

// Before mount, so a dark theme does not flash light while Vue boots.
applyTheme();

// Once for every dashboard chart, before any page creates one.
if (matchMedia('(prefers-reduced-motion: reduce)').matches) Chart.defaults.animation = false;

const app = createApp(App);

app.use(router);
app.use(i18n)
app.mount('#app')
