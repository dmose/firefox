/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { AddonTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/AddonTestUtils.sys.mjs"
);

const { extensionBiDiBridge } = ChromeUtils.importESModule(
  "chrome://remote/content/webdriver-bidi/ExtensionBiDiBridge.sys.mjs"
);

function loadDemoExtension(background) {
  return ExtensionTestUtils.loadExtension({
    manifest: {
      browser_specific_settings: { gecko: { id: "demo@example.com" } },
      manifest_version: 2,
      permissions: ["webDriverBiDi"],
      webdriver_bidi: {
        commands: ["echo"],
        events: ["pinged"],
        module: "demo",
      },
    },
    background,
  });
}

add_task(async function test_manifest_registers_module() {
  const extension = loadDemoExtension(() => {
    browser.webDriverBiDi.onCommand.addListener((command, params) => {
      return { command, echoed: params.value };
    });
    browser.test.sendMessage("ready");
  });

  await extension.startup();
  await extension.awaitMessage("ready");

  ok(
    extensionBiDiBridge.hasModule("demo"),
    "the manifest key registered the module"
  );

  const result = await extensionBiDiBridge.invoke("demo", "echo", {
    value: "hi",
  });
  Assert.deepEqual(
    result,
    { command: "echo", echoed: "hi" },
    "the listener return value crosses back to the parent"
  );

  await extension.unload();
  ok(
    !extensionBiDiBridge.hasModule("demo"),
    "unloading the extension unregisters the module"
  );
});

add_task(async function test_undeclared_command_is_rejected() {
  const extension = loadDemoExtension(() => {
    browser.webDriverBiDi.onCommand.addListener(() => ({}));
    browser.test.sendMessage("ready");
  });

  await extension.startup();
  await extension.awaitMessage("ready");

  await Assert.rejects(
    extensionBiDiBridge.invoke("demo", "notDeclared", {}),
    err => err.name == "UnknownCommandError",
    "a command absent from the manifest is not dispatched"
  );

  await extension.unload();
});

add_task(async function test_handler_error_propagates() {
  const extension = loadDemoExtension(() => {
    browser.webDriverBiDi.onCommand.addListener(() => {
      throw new Error("nope");
    });
    browser.test.sendMessage("ready");
  });

  await extension.startup();
  await extension.awaitMessage("ready");

  await Assert.rejects(
    extensionBiDiBridge.invoke("demo", "echo", {}),
    /nope/,
    "a throwing handler rejects the command"
  );

  await extension.unload();
});

add_task(async function test_event_page_wakes_for_command() {
  await SpecialPowers.pushPrefEnv({
    set: [["extensions.eventPages.enabled", true]],
  });

  const extension = ExtensionTestUtils.loadExtension({
    manifest: {
      background: { persistent: false },
      browser_specific_settings: { gecko: { id: "demo@example.com" } },
      manifest_version: 2,
      permissions: ["webDriverBiDi"],
      webdriver_bidi: { commands: ["echo"], module: "demo" },
    },
    background() {
      browser.webDriverBiDi.onCommand.addListener((command, params) => {
        return { command, echoed: params.value };
      });
      browser.test.sendMessage("ready");
    },
  });

  await extension.startup();
  await extension.awaitMessage("ready");
  assertPersistentListeners(extension, "webDriverBiDi", "onCommand", {
    primed: false,
  });

  await extension.terminateBackground();
  assertPersistentListeners(extension, "webDriverBiDi", "onCommand", {
    primed: true,
  });

  const result = await extensionBiDiBridge.invoke("demo", "echo", {
    value: "wake",
  });
  Assert.deepEqual(
    result,
    { command: "echo", echoed: "wake" },
    "the command woke the event page and returned its result"
  );
  await extension.awaitMessage("ready");

  // The invoke above was replayed from primed.pendingEvents. This one goes
  // through the primed-era closure, which only works if convert() swapped in
  // the fire belonging to the re-registered listener.
  const afterWake = await extensionBiDiBridge.invoke("demo", "echo", {
    value: "again",
  });
  Assert.deepEqual(
    afterWake,
    { command: "echo", echoed: "again" },
    "a later command reaches the woken listener through the converted fire"
  );

  await extension.unload();
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_extension_page_listener_does_not_break_routing() {
  const extension = ExtensionTestUtils.loadExtension({
    manifest: {
      browser_specific_settings: { gecko: { id: "demo@example.com" } },
      manifest_version: 2,
      permissions: ["webDriverBiDi"],
      webdriver_bidi: { commands: ["echo"], module: "demo" },
    },
    files: {
      "page.html": `<!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <script src="page.js"></script>
          </head>
        </html>`,
      "page.js"() {
        browser.webDriverBiDi.onCommand.addListener(() => ({ from: "page" }));
        browser.test.sendMessage("page-ready");
      },
    },
    background() {
      browser.webDriverBiDi.onCommand.addListener(() => ({
        from: "background",
      }));
      browser.test.sendMessage("ready");
    },
  });

  await extension.startup();
  await extension.awaitMessage("ready");

  const policy = WebExtensionPolicy.getByID(extension.id);
  Assert.deepEqual(
    policy.extension.manifest.webdriver_bidi.events,
    [],
    "an omitted events list is normalized to an empty array"
  );

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    policy.extension.baseURI.resolve("page.html")
  );
  await extension.awaitMessage("page-ready");

  Assert.deepEqual(
    await extensionBiDiBridge.invoke("demo", "echo", {}),
    { from: "page" },
    "the most recently registered listener handles the command"
  );

  BrowserTestUtils.removeTab(tab);
  // ExtensionPageContextParent.unload() runs the listener unregister before it
  // drops the view, so this also guarantees the unregister has happened.
  await TestUtils.waitForCondition(
    () => ![...policy.extension.views].some(view => view.viewType === "tab"),
    "the extension page context unloaded"
  );

  Assert.deepEqual(
    await extensionBiDiBridge.invoke("demo", "echo", {}),
    { from: "background" },
    "the background listener still handles commands after the page went away"
  );

  await extension.unload();
});

add_task(async function test_second_extension_cannot_claim_module_name() {
  const first = loadDemoExtension(() => {
    browser.webDriverBiDi.onCommand.addListener(() => ({}));
    browser.test.sendMessage("ready");
  });
  await first.startup();
  await first.awaitMessage("ready");

  const second = ExtensionTestUtils.loadExtension({
    manifest: {
      browser_specific_settings: { gecko: { id: "other@example.com" } },
      manifest_version: 2,
      permissions: ["webDriverBiDi"],
      webdriver_bidi: { commands: ["echo"], module: "demo" },
    },
    background() {
      browser.test.sendMessage("ready");
    },
  });

  const { messages } = await AddonTestUtils.promiseConsoleOutput(async () => {
    await second.startup();
    await second.awaitMessage("ready");
  });

  ok(
    messages.some(m => /already registered/.test(m.message)),
    "the collision is reported on the console"
  );

  await second.unload();
  ok(
    extensionBiDiBridge.hasModule("demo"),
    "the first extension keeps the module name"
  );
  await first.unload();
});

add_task(async function test_manifest_entry_requires_permission() {
  const extension = ExtensionTestUtils.loadExtension({
    manifest: {
      browser_specific_settings: { gecko: { id: "nopermission@example.com" } },
      manifest_version: 2,
      webdriver_bidi: { commands: ["echo"], module: "demo" },
    },
    background() {
      browser.test.sendMessage("ready");
    },
  });

  const { messages } = await AddonTestUtils.promiseConsoleOutput(async () => {
    await extension.startup();
    await extension.awaitMessage("ready");
  });

  ok(
    messages.some(m =>
      /requires the "webDriverBiDi" permission/.test(m.message)
    ),
    "the missing permission is reported on the console"
  );
  ok(
    !extensionBiDiBridge.hasModule("demo"),
    "an extension without the permission does not claim the module name"
  );

  await extension.unload();
});

add_task(async function test_id_bridging_round_trips() {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );
  registerCleanupFunction(() => BrowserTestUtils.removeTab(tab));

  const extension = loadDemoExtension(() => {
    browser.webDriverBiDi.onCommand.addListener(async (command, params) => {
      if (command === "echo") {
        const tabId = await browser.webDriverBiDi.getTabIdForContext(
          params.context
        );
        const context = await browser.webDriverBiDi.getContextForTabId(tabId);
        return { context, tabId };
      }
      return {};
    });
    browser.test.sendMessage("ready");
  });

  await extension.startup();
  await extension.awaitMessage("ready");

  const { NavigableManager } = ChromeUtils.importESModule(
    "chrome://remote/content/shared/NavigableManager.sys.mjs"
  );
  const contextId = NavigableManager.getIdForBrowsingContext(
    tab.linkedBrowser.browsingContext
  );

  const result = await extensionBiDiBridge.invoke("demo", "echo", {
    context: contextId,
  });

  is(typeof result.tabId, "number", "a numeric tabId was resolved");
  is(
    result.context,
    contextId,
    "converting back to a context id returns the original"
  );

  await extension.unload();
});

add_task(async function test_unknown_context_resolves_to_null() {
  const extension = loadDemoExtension(() => {
    browser.webDriverBiDi.onCommand.addListener(async () => {
      return {
        tabId:
          await browser.webDriverBiDi.getTabIdForContext("no-such-context"),
      };
    });
    browser.test.sendMessage("ready");
  });

  await extension.startup();
  await extension.awaitMessage("ready");

  const result = await extensionBiDiBridge.invoke("demo", "echo", {});
  is(result.tabId, null, "an unresolvable context id yields null");

  await extension.unload();
});

add_task(async function test_unknown_tab_resolves_to_null() {
  const extension = loadDemoExtension(() => {
    browser.webDriverBiDi.onCommand.addListener(async () => ({
      context: await browser.webDriverBiDi.getContextForTabId(-1),
    }));
    browser.test.sendMessage("ready");
  });

  await extension.startup();
  await extension.awaitMessage("ready");

  Assert.deepEqual(
    await extensionBiDiBridge.invoke("demo", "echo", {}),
    { context: null },
    "an unknown tab id yields null"
  );

  await extension.unload();
});

add_task(async function test_emit_event_reaches_the_bridge() {
  const extension = loadDemoExtension(() => {
    browser.webDriverBiDi.onCommand.addListener(async () => {
      await browser.webDriverBiDi.emitEvent("pinged", { n: 1 });
      return { sent: true };
    });
    browser.test.sendMessage("ready");
  });

  await extension.startup();
  await extension.awaitMessage("ready");

  const result = await extensionBiDiBridge.invoke("demo", "echo", {});
  Assert.deepEqual(result, { sent: true }, "emitEvent resolved without error");

  await extension.unload();
});

add_task(async function test_emit_undeclared_event_rejects_in_extension() {
  const extension = loadDemoExtension(() => {
    browser.webDriverBiDi.onCommand.addListener(async () => {
      try {
        await browser.webDriverBiDi.emitEvent("neverDeclared", {});
        return { threw: false };
      } catch (e) {
        return { message: e.message, threw: true };
      }
    });
    browser.test.sendMessage("ready");
  });

  await extension.startup();
  await extension.awaitMessage("ready");

  const result = await extensionBiDiBridge.invoke("demo", "echo", {});
  ok(result.threw, "emitting an undeclared event rejects in the extension");
  ok(/is not declared/.test(result.message), "the reason is reported");

  await extension.unload();
});
