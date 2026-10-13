import { storage } from '#imports';
import { apiBaseUrl } from './helper';

const CHECK_KEY = 'local:VERSION_CHECK';
const SNOOZE_KEY = 'local:UPDATE_SNOOZE';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const SNOOZE_MS = 24 * 60 * 60 * 1000;

const installedVersion = () => browser.runtime.getManifest().version;

// Relative to the feed base like sendSupportMessage, and keyless: an update must reach users without a working key.
async function fetchVersionInfo() {
  try {
    const url = new URL('../extension/version', apiBaseUrl);
    url.searchParams.set('current', installedVersion());
    // The backend 422s any other target, which would hide updates from e.g. an Opera build.
    const target = ['chrome', 'edge', 'firefox'].includes(import.meta.env.BROWSER) ? import.meta.env.BROWSER : 'chrome';
    url.searchParams.set('browser', target);
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    const result:any = await response.json().catch(() => /* non-JSON error page, treated as no answer */ null);
    if (!response.ok || result?.success !== true) return null;
    return result.data;
  } catch (err) {
    /* offline or timed out: the cached answer stands in */
    console.error('fetchVersionInfo error:', err);
    return null;
  }
}

async function versionInfo() {
  const cached:any = await storage.getItem(CHECK_KEY);
  // An answer cached for the previous install would keep nagging right after the update landed.
  const sameInstall = cached?.data?.current_version === installedVersion();
  if (sameInstall && Date.now() - cached.checked_at < CHECK_INTERVAL_MS) return cached.data;

  const data = await fetchVersionInfo();
  if (data) {
    await storage.setItem(CHECK_KEY, { checked_at: Date.now(), data });
    return data;
  }
  return sameInstall ? cached.data : null;
}

// The update the dialog should announce, or null when up to date or snoozed; a forced one ignores the snooze.
export async function versionNextUpdate() {
  const info = await versionInfo();
  console.log('versionNextUpdate', info?.latest_version, info?.force);
  if (!info?.update_available) return null;
  if (info.force) return info;
  const snooze:any = await storage.getItem(SNOOZE_KEY);
  if (snooze?.version === info.latest_version && snooze.until > Date.now()) return null;
  return info;
}

// Per version, so a newer release than the snoozed one shows again straight away.
export async function versionSnooze(version:any) {
  console.log('versionSnooze', version);
  await storage.setItem(SNOOZE_KEY, { version, until: Date.now() + SNOOZE_MS });
}

const UPDATE_CHECK_TIMEOUT_MS = 10_000;
const UPDATE_DOWNLOAD_TIMEOUT_MS = 30_000;

// Resolves null on timeout: Chrome's check can stay pending forever, which left the button stuck disabled.
function withTimeout(promise:any, ms:any) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
}

// 'update_available' only means the store has it; reloading before the download lands restarts the old version.
function waitForUpdateDownload() {
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      browser.runtime.onUpdateAvailable.removeListener(done);
      resolve();
    };
    // On timeout reload anyway: an update downloaded earlier already fired its event and installs on reload.
    const timer = setTimeout(done, UPDATE_DOWNLOAD_TIMEOUT_MS);
    browser.runtime.onUpdateAvailable.addListener(done);
  });
}

// Store installs can update in place; unpacked/dev builds and throttled or hung checks fall back to the store page.
export async function versionUpdateNow(storeUrl:any) {
  console.log('versionUpdateNow');
  try {
    // Chrome resolves { status }, Firefox [status, details].
    const result:any = await withTimeout(browser.runtime.requestUpdateCheck(), UPDATE_CHECK_TIMEOUT_MS);
    const status = Array.isArray(result) ? result[0] : result?.status;
    console.log('versionUpdateNow status', status);
    if (status === 'update_available') {
      await waitForUpdateDownload();
      browser.runtime.reload();
      return 'reloading';
    }
  } catch (err) {
    /* not every browser/install supports update checks; the store link still works */
    console.error('versionUpdateNow error:', err);
  }
  if (!versionIsStoreUrl(storeUrl)) return 'unavailable';
  await browser.tabs.create({ url: storeUrl });
  return 'store';
}

const STORE_HOSTS = ['chromewebstore.google.com', 'chrome.google.com', 'addons.mozilla.org', 'microsoftedge.microsoft.com'];

// The URL comes from the server; only ever open a real extension store page with it.
export function versionIsStoreUrl(storeUrl:any) {
  try {
    const url = new URL(storeUrl);
    return url.protocol === 'https:' && STORE_HOSTS.includes(url.hostname);
  } catch {
    /* missing or malformed URL: nothing safe to open */
    return false;
  }
}
