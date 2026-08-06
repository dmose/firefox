browser.webDriverBiDi.onCommand.addListener(async (command, params) => {
  switch (command) {
    case "listTabs": {
      const tabs = await browser.tabs.query({});
      return { tabs: tabs.map(tab => ({ id: tab.id, url: tab.url })) };
    }
    case "titleForContext": {
      const tabId = await browser.webDriverBiDi.getTabIdForContext(
        params.context
      );
      if (tabId === null) {
        return { title: null };
      }
      const tab = await browser.tabs.get(tabId);
      return { tabId, title: tab.title };
    }
    case "ping": {
      await browser.webDriverBiDi.emitEvent("pinged", { nonce: params.nonce });
      return {};
    }
    case "fail":
      throw new Error("demo command failed");
  }
  return {};
});

browser.tabs.onCreated.addListener(tab =>
  browser.webDriverBiDi.emitEvent("tabCreated", { tabId: tab.id })
);
