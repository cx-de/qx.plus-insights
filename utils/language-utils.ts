import { storage } from '#imports';

// Extension storage, not localStorage: the dashboard, content scripts and the background worker all read the same copy.
const LANG_KEY = 'local:LANG';
const LANGUAGES = ['de', 'en'];
const DEFAULT_LANG = 'de';

const languageNormalize = (value:any) => (LANGUAGES.includes(value) ? value : DEFAULT_LANG);

export async function languageGet() {
  return languageNormalize(await storage.getItem(LANG_KEY));
}

export async function languageSave(lang:any) {
  await storage.setItem(LANG_KEY, languageNormalize(lang));
}

export function languageWatch(onChange:(lang:string) => void) {
  return storage.watch(LANG_KEY, (value) => onChange(languageNormalize(value)));
}

// Dashboard only, once: earlier versions kept the choice in the dashboard's localStorage.
export async function languageMigrateLocal() {
  let legacy:any = null;
  try {
    legacy = localStorage.getItem('lang');
    localStorage.removeItem('lang');
  } catch (err) {
    /* blocked storage: the stored language or the default still applies */
    console.error('languageMigrateLocal error:', err);
  }
  if (legacy && !(await storage.getItem(LANG_KEY))) await languageSave(legacy);
}
