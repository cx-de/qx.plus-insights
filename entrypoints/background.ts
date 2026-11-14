import { versionAfterUpdate, versionApplyUpdate, versionOnConnect, versionReopenDashboard, versionRetryUpdate } from '~/utils/version-utils';
import { ALERT_ALARM, alertEnsureAlarm, alertPriceTick, alertsNewlyPending, runAlertCheck } from '~/utils/alert-utils';

// Focuses an open dashboard back on Home, where the connected summary and alert dialog live.
async function openDashboard() {
  const url = browser.runtime.getURL("/home.html");
  const [existing] = await browser.tabs.query({ url: `${url}*` });
  if (existing?.id) {
    // Back to Home; a tab left on Settings would show nothing.
    await browser.tabs.update(existing.id, { active: true, url });
    if (existing.windowId) await browser.windows.update(existing.windowId, { focused: true });
  } else {
    await browser.tabs.create({ url });
  }
}

let alertCheckTimer: ReturnType<typeof setTimeout> | null = null;

// Debounced: one pass writes the stamp once, but List and a tick can finish seconds apart.
function scheduleAlertCheck() {
  if (alertCheckTimer) clearTimeout(alertCheckTimer);
  alertCheckTimer = setTimeout(() => {
    alertCheckTimer = null;
    runAlertCheck();
  }, 1500);
}

async function onNotificationClicked(id:string) {
  if (!id.startsWith('qx-alert-')) return;
  await browser.notifications.clear(id);
  await openDashboard();
}

function listenNotificationClicks() {
  const clicked = browser.notifications?.onClicked;
  if (clicked && !clicked.hasListener(onNotificationClicked)) clicked.addListener(onNotificationClicked);
}

export default defineBackground(() => {
  // Registered at top level so the service worker wakes for it; without a listener a downloaded
  // update waits for a browser restart while the dashboard keeps the extension busy.
  // Safari has no onUpdateAvailable (the App Store updates it); a throw here would skip every listener below.
  browser.runtime.onUpdateAvailable?.addListener((details) => {
    versionApplyUpdate(details?.version);
  });
  browser.runtime.onConnect.addListener(versionOnConnect);
  // A deferred update installs once the last tab using the extension closes.
  browser.tabs.onRemoved.addListener(() => { versionRetryUpdate(); });
  versionReopenDashboard();

  const action = browser.action || browser.browserAction;
  if (action && action.onClicked) {
    action.onClicked.addListener(() => {
      browser.tabs.create({ url: browser.runtime.getURL("/home.html") });
    });
  }

  // The bank page cannot open an extension page itself; the guide's last card asks here.
  browser.runtime.onMessage.addListener(async (message:any) => {
    if (message?.type !== 'qx:open-dashboard') return;
    await openDashboard();
  });

  // Alerts live here, not in a page: List.vue only ran them while it was the open route.
  browser.storage.onChanged.addListener((changes:any, areaName:string) => {
    if (areaName !== 'local') return;
    // Only completed network passes stamp, so cached prices painted on page load never fire an alert.
    if (changes.PRICES_UPDATED_AT) scheduleAlertCheck();
    // A new or edited alert that is already met fires on the prices the user is looking at.
    if (changes.ALERTS && alertsNewlyPending(changes.ALERTS.oldValue, changes.ALERTS.newValue)) scheduleAlertCheck();
    if (changes.settings && changes.settings.oldValue?.price_duration !== changes.settings.newValue?.price_duration) {
      alertEnsureAlarm().catch((err) => { /* the old period keeps running until the next startup */ console.error('alertEnsureAlarm error:', err); });
    }
  });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== ALERT_ALARM) return;
    try {
      await alertPriceTick();
    } catch (err) {
      /* a failed tick retries on the next alarm */
      console.error('alertPriceTick error:', err);
    }
  });

  // Optional permission: the API appears only once granted, so register again when it is.
  listenNotificationClicks();
  browser.permissions.onAdded.addListener(listenNotificationClicks);

  // Alarms survive restarts in Chrome but not always in Firefox; this only recreates a missing or changed one.
  alertEnsureAlarm().catch((err) => { /* retried on the next startup or settings change */ console.error('alertEnsureAlarm error:', err); });

  browser.runtime.onInstalled.addListener(async ({ reason }) => {
    if (reason === 'update') return versionAfterUpdate();
    // New installs only: the dashboard's setup guide dialog takes it from there.
    if (reason !== 'install') return;
    await browser.tabs.create({ url: browser.runtime.getURL("/home.html") });
  });
});
