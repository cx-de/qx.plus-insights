import { createApp } from 'vue';
import './style.css';
import '@/assets/tailwind.css';
import App from './App.vue';
import router from './router/index.js';
//import HighchartsVue from "highcharts-vue";

import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import de from './locales/de.json'

const currentLang = ref(localStorage.getItem('lang') || 'de');
const i18n = createI18n({
    locale: currentLang.value,
    fallbackLocale: 'de',
    messages: {
        en,
        de,
    },
    missingWarn: false,
    fallbackWarn: false,
});

//createApp(App).mount('#app');

const app = createApp(App);

app.use(router);
app.use(i18n)
//app.use(HighchartsVue)
app.mount('#app')

export { i18n };