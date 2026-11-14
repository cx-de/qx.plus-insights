import { createI18n } from 'vue-i18n';
import en from './locales/en.json';
import de from './locales/de.json';
import { languageGet, languageWatch } from '~/utils/language-utils';

// Kept apart from main.ts so content scripts can translate without mounting the dashboard into broker pages.
export const i18n = createI18n({
  locale: 'de',
  fallbackLocale: 'de',
  messages: {
    en,
    de,
  },
  missingWarn: false,
  fallbackWarn: false,
});

const applyLocale = (lang:string) => {
  i18n.global.locale = lang as typeof i18n.global.locale;
};

// Awaited before the first paint; the watch keeps every open tab and bank page on a language changed elsewhere.
export async function i18nSyncLanguage() {
  applyLocale(await languageGet());
  languageWatch(applyLocale);
}
