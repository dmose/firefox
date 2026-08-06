/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { extensionBiDiBridge } = ChromeUtils.importESModule(
  "chrome://remote/content/webdriver-bidi/ExtensionBiDiBridge.sys.mjs"
);
const { getDynamicModule } = ChromeUtils.importESModule(
  "chrome://remote/content/webdriver-bidi/modules/ModuleRegistry.sys.mjs"
);
const { RootMessageHandler } = ChromeUtils.importESModule(
  "chrome://remote/content/shared/messagehandler/RootMessageHandler.sys.mjs"
);
const { RootMessageHandlerRegistry } = ChromeUtils.importESModule(
  "chrome://remote/content/shared/messagehandler/RootMessageHandlerRegistry.sys.mjs"
);

const ROOT_DESTINATION = { type: RootMessageHandler.type };

function register(name) {
  extensionBiDiBridge.registerModule({
    commands: ["listTabs"],
    events: ["tabChanged"],
    extensionId: "demo@example.com",
    invoke: async () => ({ ok: true }),
    name,
  });
  registerCleanupFunction(() => extensionBiDiBridge.unregisterModule(name));
}

add_task(async function test_pref_is_off() {
  is(
    Services.prefs.getBoolPref("remote.experimental.enabled"),
    false,
    "the manifest turned the experimental pref off for this profile"
  );
});

add_task(async function test_declared_command_is_rejected() {
  register("offcmd");

  const messageHandler = RootMessageHandlerRegistry.getOrCreateMessageHandler(
    "ext-experimental-off-command-test"
  );
  registerCleanupFunction(() => messageHandler.destroy());

  const instance = messageHandler.moduleCache.getModuleInstance(
    "ext:offcmd",
    ROOT_DESTINATION
  );

  await Assert.rejects(
    Promise.resolve().then(() => instance.listTabs({})),
    err => err.name == "UnknownCommandError",
    "a declared command raises UnknownCommandError while the pref is off"
  );
});

add_task(async function test_inherited_methods_are_not_dispatchable() {
  register("offlifecycle");

  const messageHandler = RootMessageHandlerRegistry.getOrCreateMessageHandler(
    "ext-experimental-off-lifecycle-test"
  );
  registerCleanupFunction(() => messageHandler.destroy());

  // The generated command methods are what call
  // assertExperimentalCommandsEnabled, so an inherited method reaching the
  // dispatcher would bypass the pref entirely.
  for (const method of ["destroy", "emitEvent", "interceptEvent"]) {
    ok(
      !messageHandler.supportsCommand(
        "ext:offlifecycle",
        method,
        ROOT_DESTINATION
      ),
      `ext:offlifecycle.${method} is not dispatchable`
    );
  }
  ok(
    messageHandler.supportsCommand(
      "ext:offlifecycle",
      "listTabs",
      ROOT_DESTINATION
    ),
    "the declared command still resolves, and is rejected at invocation time"
  );
});

add_task(async function test_declared_event_is_not_subscribable() {
  register("offevt");

  const ModuleClass = getDynamicModule("ext", "offevt");
  Assert.deepEqual(
    ModuleClass.supportedEvents,
    [],
    "no event is advertised while the pref is off"
  );
  ok(
    !ModuleClass.supportsEvent("ext:offevt.tabChanged"),
    "session.subscribe rejects the declared event while the pref is off"
  );
});
