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
const { WindowGlobalMessageHandler } = ChromeUtils.importESModule(
  "chrome://remote/content/shared/messagehandler/WindowGlobalMessageHandler.sys.mjs"
);

const ROOT_DESTINATION = { type: RootMessageHandler.type };

function register(overrides = {}) {
  const registration = {
    extensionId: "demo@example.com",
    name: "demo",
    commands: ["listTabs"],
    events: ["tabChanged"],
    invoke: async () => ({ ok: true }),
    ...overrides,
  };
  extensionBiDiBridge.registerModule(registration);
  registerCleanupFunction(() =>
    extensionBiDiBridge.unregisterModule(registration.name)
  );
  return registration;
}

add_task(async function test_register_creates_dynamic_module() {
  register();

  const ModuleClass = getDynamicModule("ext", "demo");
  ok(ModuleClass, "a module class was registered under ext:demo");
  is(
    typeof ModuleClass.prototype.listTabs,
    "function",
    "the declared command exists as a prototype method"
  );
  Assert.deepEqual(
    ModuleClass.supportedEvents,
    ["ext:demo.tabChanged"],
    "supportedEvents is namespaced"
  );
  ok(
    ModuleClass.supportsEvent("ext:demo.tabChanged"),
    "supportsEvent accepts the declared event"
  );
});

add_task(async function test_invoke_forwards_to_extension() {
  const calls = [];
  register({
    name: "fwd",
    invoke: async (command, params) => {
      calls.push({ command, params });
      return { echoed: params.value };
    },
  });

  const result = await extensionBiDiBridge.invoke("fwd", "listTabs", {
    value: 42,
  });

  Assert.deepEqual(result, { echoed: 42 }, "the handler result is returned");
  Assert.deepEqual(
    calls,
    [{ command: "listTabs", params: { value: 42 } }],
    "the handler received command name and params"
  );
});

add_task(async function test_invalid_module_name_rejected() {
  Assert.throws(
    () => register({ name: "bad.name" }),
    /Invalid module name/,
    "a dotted module name is rejected"
  );
  Assert.throws(
    () => register({ name: "bad:name" }),
    /Invalid module name/,
    "a colon in the module name is rejected"
  );
});

add_task(async function test_invalid_command_name_rejected() {
  Assert.throws(
    () => register({ name: "badcmd", commands: ["not.ok"] }),
    /Invalid command name/,
    "a dotted command name is rejected"
  );
});

add_task(async function test_reserved_command_name_rejected() {
  for (const command of [
    "destroy",
    "emitEvent",
    "interceptEvent",
    "toString",
  ]) {
    Assert.throws(
      () => register({ name: `reserved_${command}`, commands: [command] }),
      /reserved by the module base class/,
      `a command named "${command}" is rejected`
    );
    is(
      getDynamicModule("ext", `reserved_${command}`),
      null,
      `no module was registered for the rejected command "${command}"`
    );
  }
});

add_task(async function test_only_declared_commands_are_dispatchable() {
  register({ name: "allowlist" });

  const ModuleClass = getDynamicModule("ext", "allowlist");
  ok(
    ModuleClass.supportsMethod("listTabs"),
    "the declared command is dispatchable"
  );
  for (const inherited of [
    "destroy",
    "emitEvent",
    "interceptEvent",
    "supportsMethod",
    "toString",
    "_getNavigable",
    "_emitEventForBrowsingContext",
  ]) {
    ok(
      !ModuleClass.supportsMethod(inherited),
      `the inherited method "${inherited}" is not dispatchable`
    );
  }
});

add_task(async function test_message_handler_gate_rejects_inherited_methods() {
  register({ name: "gated" });

  const messageHandler = RootMessageHandlerRegistry.getOrCreateMessageHandler(
    "ext-bridge-gate-test"
  );
  registerCleanupFunction(() => messageHandler.destroy());

  ok(
    messageHandler.supportsCommand("ext:gated", "listTabs", ROOT_DESTINATION),
    "the declared command passes the command gate used by session.execute"
  );
  ok(
    !messageHandler.supportsCommand("ext:gated", "destroy", ROOT_DESTINATION),
    "the inherited destroy() does not pass the command gate"
  );
  ok(
    !messageHandler.supportsCommand("ext:gated", "emitEvent", ROOT_DESTINATION),
    "the inherited emitEvent() does not pass the command gate"
  );
});

add_task(async function test_duplicate_module_name_rejected() {
  register({ name: "dup" });

  Assert.throws(
    () =>
      extensionBiDiBridge.registerModule({
        extensionId: "other@example.com",
        name: "dup",
        commands: ["listTabs"],
        events: [],
        invoke: async () => ({}),
      }),
    /already registered/,
    "a second extension cannot claim the same module name"
  );
});

add_task(async function test_unregister_removes_dynamic_module() {
  register({ name: "gone" });
  extensionBiDiBridge.unregisterModule("gone");

  is(getDynamicModule("ext", "gone"), null, "the dynamic module is removed");
  ok(!extensionBiDiBridge.hasModule("gone"), "hasModule reports false");
});

add_task(async function test_invoke_unknown_module_throws() {
  await Assert.rejects(
    (async () => extensionBiDiBridge.invoke("nosuch", "listTabs", {}))(),
    err => err.name == "UnknownCommandError",
    "invoking an unregistered module raises UnknownCommandError"
  );
});

add_task(async function test_emit_event_uses_empty_related_contexts() {
  register({ name: "evt" });
  const messageHandler = RootMessageHandlerRegistry.getOrCreateMessageHandler(
    "ext-global-event-test"
  );
  const events = [];
  const onEvent = (_eventName, payload) => events.push(payload);
  messageHandler.on("message-handler-event", onEvent);

  try {
    extensionBiDiBridge.emitEvent("evt", "tabChanged", { tabId: 7 });

    is(events.length, 1, "the root handler received the event");
    is(events[0]?.name, "ext:evt.tabChanged", "the event is namespaced");
    Assert.deepEqual(events[0]?.data, { tabId: 7 }, "the payload is forwarded");
    Assert.deepEqual(
      events[0]?.relatedContexts,
      [],
      "the global event has explicit empty related contexts"
    );
  } finally {
    messageHandler.off("message-handler-event", onEvent);
    messageHandler.destroy();
  }
});

add_task(async function test_emit_event_for_browsing_context() {
  register({ name: "ctxevt" });
  const messageHandler = RootMessageHandlerRegistry.getOrCreateMessageHandler(
    "ext-context-event-test"
  );
  const events = [];
  const onEvent = (_eventName, payload) => events.push(payload);
  messageHandler.on("message-handler-event", onEvent);

  try {
    extensionBiDiBridge.emitEvent(
      "ctxevt",
      "tabChanged",
      { tabId: 7 },
      "context-123"
    );

    is(events.length, 1, "the root handler received the event");
    is(events[0]?.name, "ext:ctxevt.tabChanged", "the event is namespaced");
    Assert.deepEqual(events[0]?.data, { tabId: 7 }, "the payload is forwarded");
    Assert.deepEqual(
      events[0]?.relatedContexts,
      [{ contextId: "context-123", type: WindowGlobalMessageHandler.type }],
      "the event is scoped to the browsing context"
    );
  } finally {
    messageHandler.off("message-handler-event", onEvent);
    messageHandler.destroy();
  }
});

add_task(async function test_emit_undeclared_event_throws() {
  register({ name: "undecl" });

  Assert.throws(
    () => extensionBiDiBridge.emitEvent("undecl", "nopeEvent", {}),
    /is not declared/,
    "emitting an undeclared event throws"
  );
});

add_task(async function test_emit_without_module_instance_does_not_throw() {
  register({ name: "noinst" });

  extensionBiDiBridge.emitEvent("noinst", "tabChanged", {});

  ok(true, "emitting without a generated module instance does not throw");
});

add_task(async function test_emit_event_before_module_instantiation() {
  register({ name: "precommand" });
  const messageHandler = RootMessageHandlerRegistry.getOrCreateMessageHandler(
    "ext-event-before-command-test"
  );
  const events = [];
  const onEvent = (_eventName, payload) => events.push(payload);
  messageHandler.on("message-handler-event", onEvent);

  try {
    extensionBiDiBridge.emitEvent("precommand", "tabChanged", { tabId: 4 });

    is(events.length, 1, "the root handler received the event");
    is(events[0]?.name, "ext:precommand.tabChanged", "the event is namespaced");
    Assert.deepEqual(
      events[0]?.data,
      { tabId: 4 },
      "the event payload was forwarded"
    );
  } finally {
    messageHandler.off("message-handler-event", onEvent);
    messageHandler.destroy();
  }
});

add_task(async function test_emit_event_reaches_all_root_handlers() {
  register({ name: "multisession" });
  const handlers = [
    RootMessageHandlerRegistry.getOrCreateMessageHandler(
      "ext-event-first-session-test"
    ),
    RootMessageHandlerRegistry.getOrCreateMessageHandler(
      "ext-event-second-session-test"
    ),
  ];
  const receivedEvents = handlers.map(() => []);
  const listeners = receivedEvents.map(
    events => (_eventName, payload) => events.push(payload)
  );

  for (const [index, messageHandler] of handlers.entries()) {
    messageHandler.on("message-handler-event", listeners[index]);
    ok(
      messageHandler.moduleCache.getModuleInstance(
        "ext:multisession",
        ROOT_DESTINATION
      ),
      `the module instance was created for root handler ${index + 1}`
    );
  }

  try {
    extensionBiDiBridge.emitEvent("multisession", "tabChanged", { tabId: 8 });

    for (const [index, events] of receivedEvents.entries()) {
      is(
        events.length,
        1,
        `root handler ${index + 1} received the event exactly once`
      );
      is(
        events[0]?.name,
        "ext:multisession.tabChanged",
        `root handler ${index + 1} received the namespaced event`
      );
    }
  } finally {
    for (const [index, messageHandler] of handlers.entries()) {
      messageHandler.off("message-handler-event", listeners[index]);
      messageHandler.destroy();
    }
  }
});

add_task(async function test_handler_error_becomes_unknown_error() {
  register({
    name: "boom",
    invoke: async () => {
      throw new Error("handler exploded");
    },
  });

  await Assert.rejects(
    extensionBiDiBridge.invoke("boom", "listTabs", {}),
    /handler exploded/,
    "the handler message is preserved"
  );
});

add_task(async function test_slow_handler_times_out() {
  await SpecialPowers.pushPrefEnv({
    set: [["remote.webdriver-bidi.extension-command-timeout-ms", 100]],
  });
  registerCleanupFunction(() => SpecialPowers.popPrefEnv());

  register({
    name: "slow",
    invoke: () => new Promise(() => {}),
  });

  await Assert.rejects(
    extensionBiDiBridge.invoke("slow", "listTabs", {}),
    /timed out/,
    "a handler that never resolves is rejected"
  );
});
