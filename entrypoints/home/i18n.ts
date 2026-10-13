import { createI18n } from 'vue-i18n';
import en from './locales/en.json';
import de from './locales/de.json';

// Kept apart from main.ts so content scripts can translate without mounting the dashboard into broker pages.
export const i18n = createI18n({
  locale: localStorage.getItem('lang') || 'de',
  fallbackLocale: 'de',
  messages: {
    en,
    de,
  },
  missingWarn: false,
  fallbackWarn: false,
});
