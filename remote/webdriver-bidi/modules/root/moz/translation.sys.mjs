/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { RootBiDiModule } from "chrome://remote/content/webdriver-bidi/modules/RootBiDiModule.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  Translator: "chrome://global/content/translations/Translator.mjs",
  TranslationsParent: "resource://gre/actors/TranslationsParent.sys.mjs",
  TranslationsUtils:
    "chrome://global/content/translations/TranslationsUtils.mjs",
  assert: "chrome://remote/content/shared/webdriver/Assert.sys.mjs",
  error: "chrome://remote/content/shared/webdriver/Errors.sys.mjs",
  pprint: "chrome://remote/content/shared/Format.sys.mjs",
});

function createProtocolError(ErrorClass, message) {
  const error = new ErrorClass(message);
  error.stack = "";
  return error;
}

export class TranslationService {
  #createTranslator;
  #requestTranslationsPort;

  constructor(
    createTranslator = options => lazy.Translator.create(options),
    requestTranslationsPort = lazy.TranslationsParent.requestTranslationsPort.bind(
      lazy.TranslationsParent
    )
  ) {
    this.#createTranslator = createTranslator;
    this.#requestTranslationsPort = requestTranslationsPort;
  }

  async translate(text, sourceLanguage, targetLanguage, isHTML) {
    let translator;
    let port;
    try {
      try {
        translator = await this.#createTranslator({
          languagePair: { sourceLanguage, targetLanguage },
          requestTranslationsPort: async languagePair => {
            port = await this.#requestTranslationsPort(languagePair);
            return port;
          },
        });
      } catch {
        throw createProtocolError(
          lazy.error.UnsupportedOperationError,
          "Firefox translation is unavailable for the requested language pair"
        );
      }

      try {
        const translatedText = await translator.translate(text, isHTML);
        if (typeof translatedText !== "string") {
          throw new Error("Invalid translation result");
        }
        return translatedText;
      } catch {
        throw createProtocolError(
          lazy.error.UnknownError,
          "Firefox translation failed"
        );
      }
    } finally {
      try {
        translator?.destroy();
      } finally {
        try {
          port?.close();
        } catch {}
      }
    }
  }
}

class TranslationModule extends RootBiDiModule {
  #service = new TranslationService();

  destroy() {}

  async translate(options = {}) {
    const { text, sourceLanguage, targetLanguage, isHTML = false } = options;
    lazy.assert.string(
      text,
      lazy.pprint`Expected "text" to be a string, got ${text}`
    );
    lazy.assert.string(
      sourceLanguage,
      lazy.pprint`Expected "sourceLanguage" to be a string, got ${sourceLanguage}`
    );
    lazy.assert.string(
      targetLanguage,
      lazy.pprint`Expected "targetLanguage" to be a string, got ${targetLanguage}`
    );
    lazy.assert.boolean(
      isHTML,
      lazy.pprint`Expected "isHTML" to be a boolean, got ${isHTML}`
    );
    if (
      !lazy.TranslationsUtils.isLangTagValid(sourceLanguage) ||
      !lazy.TranslationsUtils.isLangTagValid(targetLanguage)
    ) {
      throw new lazy.error.InvalidArgumentError(
        "sourceLanguage and targetLanguage must be valid BCP 47 language tags"
      );
    }
    if (
      text === "" ||
      lazy.TranslationsUtils.langTagsMatch(sourceLanguage, targetLanguage)
    ) {
      return { translatedText: text };
    }
    return {
      translatedText: await this.#service.translate(
        text,
        sourceLanguage,
        targetLanguage,
        isHTML
      ),
    };
  }

  static get supportedEvents() {
    return [];
  }
}

export const translation = TranslationModule;
