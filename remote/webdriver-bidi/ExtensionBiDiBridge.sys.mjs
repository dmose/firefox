/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

import { RootBiDiModule } from "chrome://remote/content/webdriver-bidi/modules/RootBiDiModule.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
  error: "chrome://remote/content/shared/webdriver/Errors.sys.mjs",
  registerDynamicModule:
    "chrome://remote/content/webdriver-bidi/modules/ModuleRegistry.sys.mjs",
  RootMessageHandlerRegistry:
    "chrome://remote/content/shared/messagehandler/RootMessageHandlerRegistry.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
  unregisterDynamicModule:
    "chrome://remote/content/webdriver-bidi/modules/ModuleRegistry.sys.mjs",
  WindowGlobalMessageHandler:
    "chrome://remote/content/shared/messagehandler/WindowGlobalMessageHandler.sys.mjs",
});

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "commandTimeoutMs",
  "remote.webdriver-bidi.extension-command-timeout-ms",
  30000
);

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "experimentalEnabled",
  "remote.experimental.enabled",
  false
);

export const NAMESPACE = "ext";

// splitMethod allows exactly one "." and ModuleCache splits on exactly one ":",
// so neither character can appear in a module, command, or event name.
export const MODULE_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

class ExtensionBiDiBridge {
  #registrations = new Map();

  registerModule({ extensionId, name, commands, events, invoke }) {
    if (!MODULE_NAME_RE.test(name)) {
      throw new Error(
        `Invalid module name "${name}", expected ${MODULE_NAME_RE}`
      );
    }
    for (const command of commands) {
      if (!MODULE_NAME_RE.test(command)) {
        throw new Error(
          `Invalid command name "${command}", expected ${MODULE_NAME_RE}`
        );
      }
      // Commands become prototype methods of the generated module class, so a
      // name inherited from the base class would silently replace it.
      if (command in RootBiDiModule.prototype) {
        throw new Error(
          `Invalid command name "${command}", it is reserved by the module base class`
        );
      }
    }
    for (const event of events) {
      if (!MODULE_NAME_RE.test(event)) {
        throw new Error(
          `Invalid event name "${event}", expected ${MODULE_NAME_RE}`
        );
      }
    }

    const existing = this.#registrations.get(name);
    if (existing) {
      throw new Error(
        `Module "${NAMESPACE}:${name}" is already registered by ${existing.extensionId}`
      );
    }

    const registration = {
      commands: new Set(commands),
      events: new Set(events),
      extensionId,
      invoke,
      name,
    };

    this.#registrations.set(name, registration);
    try {
      lazy.registerDynamicModule(
        NAMESPACE,
        name,
        this.#createModuleClass(registration)
      );
    } catch (e) {
      this.#registrations.delete(name);
      throw e;
    }
  }

  unregisterModule(name) {
    if (!this.#registrations.has(name)) {
      return;
    }
    this.#registrations.delete(name);
    lazy.unregisterDynamicModule(NAMESPACE, name);
  }

  hasModule(name) {
    return this.#registrations.has(name);
  }

  async invoke(name, command, params) {
    const registration = this.#registrations.get(name);
    if (!registration?.commands.has(command)) {
      throw new lazy.error.UnknownCommandError(
        `${NAMESPACE}:${name}.${command}`
      );
    }

    let timer;
    const timeout = new Promise((resolve, reject) => {
      timer = lazy.setTimeout(
        () =>
          reject(
            new lazy.error.UnknownError(
              `${NAMESPACE}:${name}.${command} timed out after ${lazy.commandTimeoutMs}ms`
            )
          ),
        lazy.commandTimeoutMs
      );
    });

    try {
      return await Promise.race([
        Promise.resolve(registration.invoke(command, params)),
        timeout,
      ]);
    } catch (e) {
      throw lazy.error.wrap(e, lazy.error.UnknownError);
    } finally {
      lazy.clearTimeout(timer);
    }
  }

  emitEvent(name, eventName, params, contextId = null) {
    const registration = this.#registrations.get(name);
    if (!registration?.events.has(eventName)) {
      throw new Error(
        `Event "${eventName}" is not declared by module "${NAMESPACE}:${name}"`
      );
    }

    const protocolName = `${NAMESPACE}:${name}.${eventName}`;
    const relatedContexts =
      contextId === null
        ? []
        : [
            {
              contextId,
              type: lazy.WindowGlobalMessageHandler.type,
            },
          ];
    for (const messageHandler of lazy.RootMessageHandlerRegistry.getAllMessageHandlers()) {
      messageHandler.emitEvent(protocolName, params, relatedContexts);
    }
  }

  #createModuleClass(registration) {
    const bridge = this;
    const { commands, events, name } = registration;
    const supportedEvents = [...events].map(
      event => `${NAMESPACE}:${name}.${event}`
    );

    class ExtensionModule extends RootBiDiModule {
      destroy() {}

      static get supportedEvents() {
        return lazy.experimentalEnabled ? supportedEvents : [];
      }

      // Only declared commands are dispatchable. The inherited implementation
      // walks the prototype chain, which would expose destroy(), emitEvent()
      // and friends as ext:<module>.<name> commands.
      static supportsMethod(methodName) {
        return commands.has(methodName);
      }
    }

    for (const command of commands) {
      ExtensionModule.prototype[command] = function (params = {}) {
        this.assertExperimentalCommandsEnabled(
          `${NAMESPACE}:${name}.${command}`
        );
        return bridge.invoke(name, command, params);
      };
    }

    return ExtensionModule;
  }
}

export const extensionBiDiBridge = new ExtensionBiDiBridge();
