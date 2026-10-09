export default defineBackground(() => {
  console.log('Hello background!', { id: browser.runtime.id });
  const action = browser.action || browser.browserAction;
  if (action && action.onClicked) {
    action.onClicked.addListener(() => {
      browser.tabs.create({ url: browser.runtime.getURL("/home.html") });
    });
  }
});
