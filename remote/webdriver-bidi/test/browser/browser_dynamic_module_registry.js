/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { RootMessageHandler } = ChromeUtils.importESModule(
  "chrome://remote/content/shared/messagehandler/RootMessageHandler.sys.mjs"
);
const { RootMessageHandlerRegistry } = ChromeUtils.importESModule(
  "chrome://remote/content/shared/messagehandler/RootMessageHandlerRegistry.sys.mjs"
);
const { RootBiDiModule } = ChromeUtils.importESModule(
  "chrome://remote/content/webdriver-bidi/modules/RootBiDiModule.sys.mjs"
);
const { getDynamicModule, registerDynamicModule, unregisterDynamicModule } =
  ChromeUtils.importESModule(
    "chrome://remote/content/webdriver-bidi/modules/ModuleRegistry.sys.mjs"
  );
const { extensionBiDiBridge } = ChromeUtils.importESModule(
  "chrome://remote/content/webdriver-bidi/ExtensionBiDiBridge.sys.mjs"
);

const ROOT_DESTINATION = { type: RootMessageHandler.type };

class TestModule extends RootBiDiModule {
  destroy() {}
  static get supportedEvents() {
    return ["ext:testmod.someEvent"];
  }
}

add_task(async function test_register_and_lookup() {
  registerDynamicModule("ext", "testmod", TestModule);
  registerCleanupFunction(() => unregisterDynamicModule("ext", "testmod"));

  is(
    getDynamicModule("ext", "testmod"),
    TestModule,
    "getDynamicModule returns the registered class"
  );
});

add_task(async function test_duplicate_registration_throws() {
  registerDynamicModule("ext", "dupmod", TestModule);
  registerCleanupFunction(() => unregisterDynamicModule("ext", "dupmod"));

  Assert.throws(
    () => registerDynamicModule("ext", "dupmod", TestModule),
    /already registered/,
    "registering the same module twice throws"
  );
});

add_task(async function test_unregister_removes_module() {
  registerDynamicModule("ext", "tempmod", TestModule);
  unregisterDynamicModule("ext", "tempmod");

  is(
    getDynamicModule("ext", "tempmod"),
    null,
    "getDynamicModule returns null after unregister"
  );
});

add_task(async function test_module_cache_resolves_dynamic_module() {
  registerDynamicModule("ext", "cachemod", TestModule);
  registerCleanupFunction(() => unregisterDynamicModule("ext", "cachemod"));

  const messageHandler = RootMessageHandlerRegistry.getOrCreateMessageHandler(
    "dynamic-module-test"
  );
  registerCleanupFunction(() => messageHandler.destroy());

  const classes = messageHandler.getAllModuleClasses("ext:cachemod", {
    type: RootMessageHandler.type,
  });

  Assert.deepEqual(
    classes,
    [TestModule],
    "ModuleCache resolves the dynamically registered class"
  );
});

add_task(async function test_module_cache_misses_unknown_module() {
  const messageHandler = RootMessageHandlerRegistry.getOrCreateMessageHandler(
    "dynamic-module-miss-test"
  );
  registerCleanupFunction(() => messageHandler.destroy());

  Assert.deepEqual(
    messageHandler.getAllModuleClasses("ext:nosuchmod", {
      type: RootMessageHandler.type,
    }),
    [],
    "an unregistered dynamic module resolves to nothing"
  );
});

add_task(async function test_register_evicts_cached_miss() {
  const messageHandler = RootMessageHandlerRegistry.getOrCreateMessageHandler(
    "dynamic-module-register-after-miss-test"
  );
  registerCleanupFunction(() => messageHandler.destroy());

  is(
    messageHandler.moduleCache.getModuleInstance(
      "ext:latemod",
      ROOT_DESTINATION
    ),
    null,
    "the first lookup caches a miss"
  );

  registerDynamicModule("ext", "latemod", TestModule);
  registerCleanupFunction(() => unregisterDynamicModule("ext", "latemod"));

  ok(
    messageHandler.moduleCache.getModuleInstance(
      "ext:latemod",
      ROOT_DESTINATION
    ) instanceof TestModule,
    "registration invalidates the cached miss"
  );
});

add_task(async function test_unregister_evicts_cached_instance() {
  class FirstModule extends RootBiDiModule {
    destroy() {}
  }
  class SecondModule extends RootBiDiModule {
    destroy() {}
  }

  registerDynamicModule("ext", "recycle", FirstModule);
  registerCleanupFunction(() => unregisterDynamicModule("ext", "recycle"));

  const messageHandler = RootMessageHandlerRegistry.getOrCreateMessageHandler(
    "dynamic-module-recycle-test"
  );
  registerCleanupFunction(() => messageHandler.destroy());

  const first = messageHandler.moduleCache.getModuleInstance(
    "ext:recycle",
    ROOT_DESTINATION
  );
  ok(first instanceof FirstModule, "the cached instance uses the first class");

  unregisterDynamicModule("ext", "recycle");
  registerDynamicModule("ext", "recycle", SecondModule);

  const second = messageHandler.moduleCache.getModuleInstance(
    "ext:recycle",
    ROOT_DESTINATION
  );
  Assert.notStrictEqual(
    second,
    first,
    "a fresh instance is created after re-registration"
  );
  ok(second instanceof SecondModule, "the new instance uses the new class");
});

add_task(async function test_evicted_instance_is_destroyed() {
  let destroyCount = 0;
  class DestroyTrackingModule extends RootBiDiModule {
    destroy() {
      destroyCount++;
    }
  }

  registerDynamicModule("ext", "destroymod", DestroyTrackingModule);
  registerCleanupFunction(() => unregisterDynamicModule("ext", "destroymod"));

  const messageHandler = RootMessageHandlerRegistry.getOrCreateMessageHandler(
    "dynamic-module-destroy-test"
  );
  registerCleanupFunction(() => messageHandler.destroy());

  const instance = messageHandler.moduleCache.getModuleInstance(
    "ext:destroymod",
    ROOT_DESTINATION
  );
  ok(instance, "a module instance was created");

  unregisterDynamicModule("ext", "destroymod");

  is(destroyCount, 1, "the evicted instance was destroyed");
});

add_task(async function test_destroyed_module_cache_stops_evicting() {
  let destroyCount = 0;
  class LeakCheckModule extends RootBiDiModule {
    destroy() {
      destroyCount++;
    }
  }

  registerDynamicModule("ext", "leakmod", LeakCheckModule);
  registerCleanupFunction(() => unregisterDynamicModule("ext", "leakmod"));

  const messageHandler = RootMessageHandlerRegistry.getOrCreateMessageHandler(
    "dynamic-module-leak-test"
  );

  ok(
    messageHandler.moduleCache.getModuleInstance(
      "ext:leakmod",
      ROOT_DESTINATION
    ),
    "a module instance was created"
  );

  // This assertion only discriminates because ModuleCache.destroy() does not
  // clear #modules: a cleared map would make the eviction below a no-op for the
  // wrong reason and the test would silently stop testing.
  messageHandler.destroy();
  is(destroyCount, 1, "destroying the MessageHandler destroyed the instance");

  unregisterDynamicModule("ext", "leakmod");
  is(destroyCount, 1, "a destroyed ModuleCache no longer evicts on unregister");
});

add_task(async function test_events_work_after_module_reinstall() {
  const registration = {
    commands: ["listTabs"],
    events: ["tabChanged"],
    extensionId: "recycle@example.com",
    invoke: async () => ({}),
    name: "reinstalled",
  };

  extensionBiDiBridge.registerModule(registration);
  registerCleanupFunction(() =>
    extensionBiDiBridge.unregisterModule(registration.name)
  );

  const messageHandler = RootMessageHandlerRegistry.getOrCreateMessageHandler(
    "dynamic-module-reinstall-test"
  );
  registerCleanupFunction(() => messageHandler.destroy());

  const first = messageHandler.moduleCache.getModuleInstance(
    "ext:reinstalled",
    ROOT_DESTINATION
  );
  ok(first, "the module instance was created before the reinstall");

  extensionBiDiBridge.unregisterModule(registration.name);
  extensionBiDiBridge.registerModule(registration);

  const second = messageHandler.moduleCache.getModuleInstance(
    "ext:reinstalled",
    ROOT_DESTINATION
  );
  Assert.notStrictEqual(
    second,
    first,
    "reinstalling the module produces a fresh instance"
  );

  let staleEmitCount = 0;
  first.emitEvent = () => staleEmitCount++;

  const events = [];
  const onEvent = (_evtName, payload) => events.push(payload);
  messageHandler.on("message-handler-event", onEvent);
  registerCleanupFunction(() =>
    messageHandler.off("message-handler-event", onEvent)
  );

  extensionBiDiBridge.emitEvent(registration.name, "tabChanged", { tabId: 3 });

  is(staleEmitCount, 0, "the evicted instance did not emit the event");
  is(events.length, 1, "the event reached the MessageHandler");
  is(
    events[0]?.name,
    "ext:reinstalled.tabChanged",
    "the event was emitted under the namespaced name"
  );
  Assert.deepEqual(
    events[0]?.data,
    { tabId: 3 },
    "the event payload was forwarded"
  );
});
