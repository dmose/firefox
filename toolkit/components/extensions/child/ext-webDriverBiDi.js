/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionError } = ExtensionUtils;

this.webDriverBiDi = class extends ExtensionAPI {
  getAPI(context) {
    return {
      webDriverBiDi: {
        onCommand: new EventManager({
          context,
          name: "webDriverBiDi.onCommand",
          // Parent event already resets idle if needed, no need to do it here.
          resetIdleOnEvent: false,
          register: fire => {
            // Errors thrown by the listener are only forwarded to the parent
            // when they are ExtensionError instances, so convert them here.
            const listener = async (command, params) => {
              try {
                return await fire.raw(command, params);
              } catch (e) {
                throw new ExtensionError(
                  e?.message ?? "An unexpected error occurred"
                );
              }
            };
            const parentEvent = context.childManager.getParentEvent(
              "webDriverBiDi.onCommand"
            );
            parentEvent.addListener(listener);
            return () => {
              parentEvent.removeListener(listener);
            };
          },
        }).api(),
      },
    };
  }
};
