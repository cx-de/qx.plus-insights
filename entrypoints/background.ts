export default defineBackground(() => {
  const action = browser.action || browser.browserAction;
  if (action && action.onClicked) {
    action.onClicked.addListener(() => {
      browser.tabs.create({ url: browser.runtime.getURL("/home.html") });
    });
  }
});
