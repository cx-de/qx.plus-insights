import { versionAfterUpdate, versionApplyUpdate, versionOnConnect, versionReopenDashboard, versionRetryUpdate } from '~/utils/version-utils';

export default defineBackground(() => {
  // Registered at top level so the service worker wakes for it; without a listener a downloaded
  // update waits for a browser restart while the dashboard keeps the extension busy.
  browser.runtime.onUpdateAvailable.addListener((details) => {
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
    const url = browser.runtime.getURL("/home.html");
    const [existing] = await browser.tabs.query({ url: `${url}*` });
    if (existing?.id) {
      // Back to Home, where the connected summary opens; a tab left on Settings would show nothing.
      await browser.tabs.update(existing.id, { active: true, url });
      if (existing.windowId) await browser.windows.update(existing.windowId, { focused: true });
    } else {
      await browser.tabs.create({ url });
    }
  });

  browser.runtime.onInstalled.addListener(async ({ reason }) => {
    if (reason === 'update') return versionAfterUpdate();
    // New installs only: the dashboard's setup guide dialog takes it from there.
    if (reason !== 'install') return;
    await browser.tabs.create({ url: browser.runtime.getURL("/home.html") });
  });
});
