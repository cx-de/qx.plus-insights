import { storage } from '#imports';
import { apiBaseUrl } from './helper';

const CHECK_KEY = 'local:VERSION_CHECK';
const FAIL_KEY = 'local:VERSION_CHECK_FAIL';
const SNOOZE_KEY = 'local:UPDATE_SNOOZE';
const READY_KEY = 'local:UPDATE_READY';
const REOPEN_KEY = 'local:REOPEN_DASHBOARD';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FAIL_BACKOFF_MS = 15 * 60 * 1000;
const SNOOZE_MS = 24 * 60 * 60 * 1000;

const installedVersion = () => browser.runtime.getManifest().version;

// Relative to the feed base like sendSupportMessage, and keyless: an update must reach users without a working key.
async function fetchVersionInfo() {
  // Skipping the request offline also avoids the browser's own net::ERR_INTERNET_DISCONNECTED console line.
  if (globalThis.navigator?.onLine === false) return null;
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
  } catch (err:any) {
    /* offline or timed out: expected, the cached answer stands in */
    console.warn('fetchVersionInfo failed:', err?.name || err);
    return null;
  }
}

async function versionInfo() {
  const cached:any = await storage.getItem(CHECK_KEY);
  // An answer cached for the previous install would keep nagging right after the update landed.
  const sameInstall = cached?.data?.current_version === installedVersion();
  if (sameInstall && Date.now() - cached.checked_at < CHECK_INTERVAL_MS) return cached.data;
  const fallback = sameInstall ? cached.data : null;

  // Every page load and tab switch checks; without a backoff a down server is hit (and logged) each time.
  const failedAt:any = await storage.getItem(FAIL_KEY);
  if (failedAt && Date.now() - failedAt < FAIL_BACKOFF_MS) return fallback;

  const data = await fetchVersionInfo();
  if (data) {
    await storage.setItem(CHECK_KEY, { checked_at: Date.now(), data });
    await storage.removeItem(FAIL_KEY);
    return data;
  }
  // Offline is not a server failure: the 'online' event rechecks right away.
  if (globalThis.navigator?.onLine !== false) await storage.setItem(FAIL_KEY, Date.now());
  return fallback;
}

// A version the browser has already downloaded and installs on the next reload.
async function readyVersion() {
  const ready:any = await storage.getItem(READY_KEY);
  return ready?.version && ready.version !== installedVersion() ? ready.version : null;
}

// The update the dialog should announce, or null when up to date or snoozed; a forced one ignores the snooze.
// `ready` means it is downloaded, so the dialog offers a restart instead of a download.
export async function versionNextUpdate() {
  const [server, ready]:any = await Promise.all([versionInfo(), readyVersion()]);
  let info = server?.update_available ? server : null;
  if (ready) {
    // Notes and force describe the server's latest; they only fit the downloaded build when it is that version.
    const same = server?.latest_version === ready;
    info = { ...(same ? server : {}), current_version: installedVersion(), update_available: true, latest_version: ready, ready: true };
  }
  console.log('versionNextUpdate', info?.latest_version, info?.force, !!info?.ready);
  if (!info) return null;
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

// Reloading installs a downloaded update; it closes the dashboard, so the background reopens it afterwards.
export async function versionRestart() {
  await storage.setItem(REOPEN_KEY, true);
  browser.runtime.reload();
}

const IN_USE = 'qx:in-use';

// Content script, on every broker page: a reload would orphan it mid-scrape or mid-sync, so it says "in use".
export function versionAnswerInUse() {
  browser.runtime.onMessage.addListener((message:any) => (message?.type === IN_USE ? Promise.resolve(true) : undefined));
}

// In use = an open dashboard or a broker tab running the content script. Asking is stateless, so it still
// works after the service worker restarted, and needs no "tabs" permission: tab ids come without it.
// The dashboard probe doubles as the qx:update-ready notice, so its dialog switches to "Restart now".
async function extensionInUse(version:any) {
  const dashboard = await browser.runtime.sendMessage({ type: 'qx:update-ready', version })
    .catch(() => /* "Receiving end does not exist": no dashboard open */ false);
  if (dashboard) return true;
  const tabs = await browser.tabs.query({}).catch(() => []);
  const ask = async (id:any) => {
    try {
      return await browser.tabs.sendMessage(id, { type: IN_USE });
    } catch {
      /* no content script in this tab */
      return false;
    }
  };
  const answers = await Promise.all(tabs.map((tab:any) => (tab.id == null ? false : ask(tab.id))));
  return answers.some(Boolean);
}

// Never reload while someone uses the extension; the hold port and tab-close retries try again later.
async function reloadUnlessInUse(version:any) {
  if (await extensionInUse(version)) return 'deferred';
  browser.runtime.reload();
  return 'reloading';
}

// Background, on tabs.onRemoved: closing the last broker or dashboard tab frees a deferred update.
export async function versionRetryUpdate() {
  const version = await readyVersion();
  return version ? reloadUnlessInUse(version) : null;
}

// Background, on runtime.onUpdateAvailable: the browser has the update but waits while the extension is busy.
// Apply it at once only when nobody uses the extension; an open dashboard asks, a broker tab defers.
export async function versionApplyUpdate(version:any) {
  console.log('versionApplyUpdate', version);
  await storage.setItem(READY_KEY, { version });
  return reloadUnlessInUse(version);
}

const HOLD_PORT = 'qx:update-hold';
const holdPorts = new Set<any>();

// Background, on runtime.onConnect. A dashboard that deferred a downloaded update holds a port; when the last
// one closes, apply the update. onUpdateAvailable fires only once, and Firefox would otherwise wait for a
// browser restart.
export function versionOnConnect(port:any) {
  if (port?.name !== HOLD_PORT) return;
  holdPorts.add(port);
  port.onDisconnect.addListener(async () => {
    holdPorts.delete(port);
    if (!holdPorts.size) await versionRetryUpdate();
  });
}

// Dashboard, on load and on qx:update-ready: holds a port while a downloaded update waits, even when the
// dialog is snoozed, because this dashboard answers the background's probe either way. A service worker
// restart drops the port, so reconnect. Returns the release function for unmount.
export function versionHoldUpdate() {
  let port:any = null;
  let released = false;
  let timer:any = null;
  const connect = () => {
    if (released) return;
    port = browser.runtime.connect({ name: HOLD_PORT });
    port.onDisconnect.addListener(() => {
      if (!released) timer = setTimeout(connect, 1_000);
    });
  };
  readyVersion().then((version) => { if (version) connect(); });
  return () => {
    released = true;
    clearTimeout(timer);
    port?.disconnect();
  };
}

// Background, on every startup. A restart from the dashboard closes it; reopen it here rather than in
// onInstalled, which never fires when the reload brought no new version.
export async function versionReopenDashboard() {
  if (!await storage.getItem(REOPEN_KEY)) return;
  await storage.removeItem(REOPEN_KEY);
  await browser.tabs.create({ url: browser.runtime.getURL('/home.html') });
}

// Background, on runtime.onInstalled with reason 'update'.
export async function versionAfterUpdate() {
  await storage.removeItem(READY_KEY);
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

// Store pages have no update button, so there is no store fallback: when the store has not delivered the
// release yet ('pending'), the browser's own auto-update installs it later and onUpdateAvailable takes over.
export async function versionUpdateNow() {
  console.log('versionUpdateNow');
  if (await readyVersion()) {
    await versionRestart();
    return 'reloading';
  }
  try {
    // Chrome resolves { status }, Firefox [status, details]. Only on a click: Chrome throttles frequent checks.
    const result:any = await withTimeout(browser.runtime.requestUpdateCheck(), UPDATE_CHECK_TIMEOUT_MS);
    const status = Array.isArray(result) ? result[0] : result?.status;
    console.log('versionUpdateNow status', status);
    if (status === 'update_available') {
      await waitForUpdateDownload();
      await versionRestart();
      return 'reloading';
    }
  } catch (err:any) {
    /* unpacked/dev builds and some browsers do not support update checks */
    console.warn('versionUpdateNow check failed:', err?.message || err);
  }
  return 'pending';
}
