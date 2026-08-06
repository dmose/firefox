/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const modules = {
  root: {
    moz: {},
  },
  "windowglobal-in-root": {
    moz: {},
  },
  windowglobal: {
    moz: {},
  },
};

// eslint-disable-next-line mozilla/lazy-getter-object-name
ChromeUtils.defineESModuleGetters(modules.root, {
  _configuration:
    "chrome://remote/content/webdriver-bidi/modules/root/_configuration.sys.mjs",
  browser:
    "chrome://remote/content/webdriver-bidi/modules/root/browser.sys.mjs",
  browsingContext:
    "chrome://remote/content/webdriver-bidi/modules/root/browsingContext.sys.mjs",
  emulation:
    "chrome://remote/content/webdriver-bidi/modules/root/emulation.sys.mjs",
  input: "chrome://remote/content/webdriver-bidi/modules/root/input.sys.mjs",
  log: "chrome://remote/content/webdriver-bidi/modules/root/log.sys.mjs",
  network:
    "chrome://remote/content/webdriver-bidi/modules/root/network.sys.mjs",
  permissions:
    "chrome://remote/content/webdriver-bidi/modules/root/permissions.sys.mjs",
  script: "chrome://remote/content/webdriver-bidi/modules/root/script.sys.mjs",
  session:
    "chrome://remote/content/webdriver-bidi/modules/root/session.sys.mjs",
  storage:
    "chrome://remote/content/webdriver-bidi/modules/root/storage.sys.mjs",
  webExtension:
    "chrome://remote/content/webdriver-bidi/modules/root/webExtension.sys.mjs",
});

// eslint-disable-next-line mozilla/lazy-getter-object-name
ChromeUtils.defineESModuleGetters(modules.root.moz, {
  debugging:
    "chrome://remote/content/webdriver-bidi/modules/root/moz/debugging.sys.mjs",
  pageExtractor:
    "chrome://remote/content/webdriver-bidi/modules/root/moz/pageExtractor.sys.mjs",
  profiler:
    "chrome://remote/content/webdriver-bidi/modules/root/moz/profiler.sys.mjs",
  summarization:
    "chrome://remote/content/webdriver-bidi/modules/root/moz/summarization.sys.mjs",
  translation:
    "chrome://remote/content/webdriver-bidi/modules/root/moz/translation.sys.mjs",
});

// eslint-disable-next-line mozilla/lazy-getter-object-name
ChromeUtils.defineESModuleGetters(modules["windowglobal-in-root"], {
  browsingContext:
    "chrome://remote/content/webdriver-bidi/modules/windowglobal-in-root/browsingContext.sys.mjs",
  input:
    "chrome://remote/content/webdriver-bidi/modules/windowglobal-in-root/input.sys.mjs",
  log: "chrome://remote/content/webdriver-bidi/modules/windowglobal-in-root/log.sys.mjs",
  network:
    "chrome://remote/content/webdriver-bidi/modules/windowglobal-in-root/network.sys.mjs",
  script:
    "chrome://remote/content/webdriver-bidi/modules/windowglobal-in-root/script.sys.mjs",
});

// eslint-disable-next-line mozilla/lazy-getter-object-name
ChromeUtils.defineESModuleGetters(modules["windowglobal-in-root"].moz, {
  debugging:
    "chrome://remote/content/webdriver-bidi/modules/windowglobal-in-root/moz/debugging.sys.mjs",
});

// eslint-disable-next-line mozilla/lazy-getter-object-name
ChromeUtils.defineESModuleGetters(modules.windowglobal, {
  _configuration:
    "chrome://remote/content/webdriver-bidi/modules/windowglobal/_configuration.sys.mjs",
  browsingContext:
    "chrome://remote/content/webdriver-bidi/modules/windowglobal/browsingContext.sys.mjs",
  emulation:
    "chrome://remote/content/webdriver-bidi/modules/windowglobal/emulation.sys.mjs",
  input:
    "chrome://remote/content/webdriver-bidi/modules/windowglobal/input.sys.mjs",
  log: "chrome://remote/content/webdriver-bidi/modules/windowglobal/log.sys.mjs",
  network:
    "chrome://remote/content/webdriver-bidi/modules/windowglobal/network.sys.mjs",
  script:
    "chrome://remote/content/webdriver-bidi/modules/windowglobal/script.sys.mjs",
});

// eslint-disable-next-line mozilla/lazy-getter-object-name
ChromeUtils.defineESModuleGetters(modules.windowglobal.moz, {
  debugging:
    "chrome://remote/content/webdriver-bidi/modules/windowglobal/moz/debugging.sys.mjs",
});

const dynamicModules = new Map();
const invalidationCallbacks = new Set();

function invalidateDynamicModule(key) {
  for (const callback of invalidationCallbacks) {
    try {
      callback(key);
    } catch (e) {
      console.error(
        `Dynamic module invalidation callback failed for ${key}`,
        e
      );
    }
  }
}

/**
 * Register a module class which can be resolved at runtime, in addition to the
 * static modules declared above. Dynamic modules are only resolved for the ROOT
 * module folder and their name is always namespaced.
 *
 * @param {string} namespace
 *     The namespace of the module, eg "ext".
 * @param {string} name
 *     The name of the module within the namespace.
 * @param {class<Module>} moduleClass
 *     The class to resolve for this module name.
 * @throws {Error}
 *     If a module is already registered for this namespace and name.
 */
export function registerDynamicModule(namespace, name, moduleClass) {
  const key = `${namespace}:${name}`;
  if (dynamicModules.has(key)) {
    throw new Error(`Dynamic module "${key}" is already registered`);
  }
  dynamicModules.set(key, moduleClass);
  invalidateDynamicModule(key);
}

/**
 * Remove a module registered via registerDynamicModule and notify the
 * invalidation callbacks so that cached instances can be dropped. No-op if no
 * module is registered for this namespace and name.
 *
 * @param {string} namespace
 *     The namespace of the module, eg "ext".
 * @param {string} name
 *     The name of the module within the namespace.
 */
export function unregisterDynamicModule(namespace, name) {
  const key = `${namespace}:${name}`;
  if (!dynamicModules.delete(key)) {
    return;
  }

  invalidateDynamicModule(key);
}

/**
 * Add a callback invoked with the module name ("namespace:name") of a dynamic
 * module which was registered or unregistered. Consumers caching dynamic
 * module instances or misses should use this to invalidate them, and MUST
 * remove their callback when they are destroyed.
 *
 * @param {Function} callback
 *     The callback to add.
 */
export function addDynamicModuleInvalidationCallback(callback) {
  invalidationCallbacks.add(callback);
}

/**
 * Remove a callback added via addDynamicModuleInvalidationCallback.
 *
 * @param {Function} callback
 *     The callback to remove.
 */
export function removeDynamicModuleInvalidationCallback(callback) {
  invalidationCallbacks.delete(callback);
}

/**
 * Retrieve the module class registered via registerDynamicModule for the
 * provided namespace and name.
 *
 * @param {string} namespace
 *     The namespace of the module, eg "ext".
 * @param {string} name
 *     The name of the module within the namespace.
 * @returns {class<Module>|null}
 *     The registered class, or null if there is none.
 */
export function getDynamicModule(namespace, name) {
  return dynamicModules.get(`${namespace}:${name}`) ?? null;
}
