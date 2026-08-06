/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// This file expects tabTracker to be defined in the global scope (e.g.
// by ext-browser.js on desktop or ext-android.js on GeckoView).
/* global tabTracker */

ChromeUtils.defineESModuleGetters(this, {
  NavigableManager: "chrome://remote/content/shared/NavigableManager.sys.mjs",
  extensionBiDiBridge:
    "chrome://remote/content/webdriver-bidi/ExtensionBiDiBridge.sys.mjs",
});

// Named BiDiTabManager: this shared script global already has a `TabManager`
// class from ext-browser.js, and defineESModuleGetters cannot alias an export
// to a different property name. The import stays lazy because chrome://remote/
// only exists in builds with the WebDriver components enabled.
ChromeUtils.defineLazyGetter(this, "BiDiTabManager", () => {
  const { TabManager } = ChromeUtils.importESModule(
    "chrome://remote/content/shared/TabManager.sys.mjs"
  );
  return TabManager;
});

var { ExtensionError } = ExtensionUtils;

this.webDriverBiDi = class extends ExtensionAPIPersistent {
  // Insertion-ordered: any extension context may add an onCommand listener, and
  // the most recently registered one that is still live handles the command.
  #invokes = new Set();
  #moduleName = null;

  PERSISTENT_EVENTS = {
    onCommand({ fire }) {
      const invoke = (command, params) => fire.async(command, params);
      this.#invokes.add(invoke);

      return {
        unregister: () => {
          this.#invokes.delete(invoke);
        },
        convert(_fire) {
          fire = _fire;
        },
      };
    },
  };

  onManifestEntry(entryName) {
    if (entryName !== "webdriver_bidi") {
      return;
    }

    // onManifestEntry fires for any extension declaring the key, whether or not
    // it also requested the permission which gates the API namespace.
    if (!this.extension.hasPermission("webDriverBiDi")) {
      this.extension.manifestError(
        'The "webdriver_bidi" manifest entry requires the "webDriverBiDi" permission'
      );
      return;
    }

    const { commands, events, module } = this.extension.manifest.webdriver_bidi;

    try {
      extensionBiDiBridge.registerModule({
        commands,
        events,
        extensionId: this.extension.id,
        invoke: (command, params) => this.#invoke(command, params),
        name: module,
      });
      this.#moduleName = module;
    } catch (e) {
      this.extension.manifestError(
        `Invalid "webdriver_bidi" manifest entry: ${e.message}`
      );
    }
  }

  onShutdown() {
    if (this.#moduleName !== null) {
      extensionBiDiBridge.unregisterModule(this.#moduleName);
      this.#moduleName = null;
    }
  }

  #invoke(command, params) {
    const invoke = Array.from(this.#invokes).at(-1);
    if (!invoke) {
      throw new ExtensionError(
        `No webDriverBiDi.onCommand listener registered by ${this.extension.id}`
      );
    }
    return invoke(command, params);
  }

  getAPI(context) {
    const self = this;

    return {
      webDriverBiDi: {
        emitEvent(eventName, params, contextId) {
          if (self.#moduleName === null) {
            throw new ExtensionError("No webdriver_bidi module is registered");
          }
          try {
            extensionBiDiBridge.emitEvent(
              self.#moduleName,
              eventName,
              params,
              contextId ?? null
            );
          } catch (e) {
            throw new ExtensionError(e.message);
          }
        },

        getTabIdForContext(contextId) {
          const browsingContext =
            NavigableManager.getBrowsingContextById(contextId);
          if (!browsingContext) {
            return null;
          }
          const nativeTab =
            BiDiTabManager.getTabForBrowsingContext(browsingContext);
          return nativeTab ? tabTracker.getId(nativeTab) : null;
        },

        getContextForTabId(tabId) {
          const nativeTab = tabTracker.getTab(tabId, null);
          const browsingContext = nativeTab?.linkedBrowser?.browsingContext;
          return browsingContext
            ? NavigableManager.getIdForBrowsingContext(browsingContext)
            : null;
        },

        onCommand: new EventManager({
          context,
          module: "webDriverBiDi",
          event: "onCommand",
          extensionApi: self,
        }).api(),
      },
    };
  }
};
