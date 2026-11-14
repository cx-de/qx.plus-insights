import { createApp } from 'vue';
import './style.css';
import '@/assets/tailwind.css';
import App from './App.vue';
import router from './router';
import { i18n, i18nSyncLanguage } from './i18n';
import { applyTheme } from '~/utils/helper';
import { accountViewLoad } from '~/utils/account-utils';
import { languageMigrateLocal } from '~/utils/language-utils';
import { Chart } from 'chart.js';

// Before mount, so a dark theme does not flash light while Vue boots.
applyTheme();
// Before mount, so no route paints unscoped data first.
accountViewLoad();

// Once for every dashboard chart, before any page creates one.
if (matchMedia('(prefers-reduced-motion: reduce)').matches) Chart.defaults.animation = false;

const app = createApp(App);

app.use(router);
app.use(i18n)
// Language is in async extension storage, so mount waits for it; otherwise English users saw German first.
async function mountApp() {
  try {
    await languageMigrateLocal();
    await i18nSyncLanguage();
  } catch (err) {
    /* storage failed: mounting in the default language beats a blank dashboard */
    console.error('mountApp error:', err);
  }
  app.mount('#app');
}

mountApp();
