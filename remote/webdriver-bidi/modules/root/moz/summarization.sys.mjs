/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { RootBiDiModule } from "chrome://remote/content/webdriver-bidi/modules/RootBiDiModule.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  assert: "chrome://remote/content/shared/webdriver/Assert.sys.mjs",
  createEngine: "chrome://global/content/ml/EngineProcess.sys.mjs",
  error: "chrome://remote/content/shared/webdriver/Errors.sys.mjs",
  pprint: "chrome://remote/content/shared/Format.sys.mjs",
});

function createProtocolError(ErrorClass, message) {
  const error = new ErrorClass(message);
  error.stack = "";
  return error;
}

export class SummarizationService {
  #createEngine;
  #enginePromise = null;

  constructor(createEngine = lazy.createEngine) {
    this.#createEngine = createEngine;
  }

  async #getEngine() {
    if (!this.#enginePromise) {
      const enginePromise = this.#createEngine({ taskName: "summarization" });
      this.#enginePromise = enginePromise;
      enginePromise.catch(() => {
        if (this.#enginePromise === enginePromise) {
          this.#enginePromise = null;
        }
      });
    }

    try {
      return await this.#enginePromise;
    } catch {
      throw createProtocolError(
        lazy.error.UnsupportedOperationError,
        "Firefox summarization is unavailable"
      );
    }
  }

  async summarize(text) {
    const engine = await this.#getEngine();
    let result;
    try {
      result = await engine.run({ args: [text] });
    } catch {
      throw createProtocolError(
        lazy.error.UnknownError,
        "Firefox summarization failed"
      );
    }

    const summary = result?.[0]?.summary_text;
    if (typeof summary !== "string") {
      throw createProtocolError(
        lazy.error.UnknownError,
        "Firefox summarization returned an invalid result"
      );
    }
    return summary;
  }

  async destroy() {
    const enginePromise = this.#enginePromise;
    this.#enginePromise = null;
    if (!enginePromise) {
      return;
    }

    try {
      const engine = await enginePromise;
      await engine.terminate();
    } catch (error) {
      console.error("Failed to terminate the summarization engine", error);
    }
  }
}

class SummarizationModule extends RootBiDiModule {
  #service = new SummarizationService();

  destroy() {
    void this.#service.destroy();
  }

  async summarize(options = {}) {
    const { text } = options;
    lazy.assert.string(
      text,
      lazy.pprint`Expected "text" to be a string, got ${text}`
    );
    if (text === "") {
      return { summary: "" };
    }
    return { summary: await this.#service.summarize(text) };
  }

  static get supportedEvents() {
    return [];
  }
}

export const summarization = SummarizationModule;
