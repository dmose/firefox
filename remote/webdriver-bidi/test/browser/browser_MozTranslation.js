/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { Translator: TranslationsTranslator } = ChromeUtils.importESModule(
  "chrome://global/content/translations/Translator.mjs"
);
const { TranslationsParent: TranslationsParentActor } =
  ChromeUtils.importESModule(
    "resource://gre/actors/TranslationsParent.sys.mjs"
  );
const { TranslationService } = ChromeUtils.importESModule(
  "chrome://remote/content/webdriver-bidi/modules/root/moz/translation.sys.mjs"
);

function createMockPort({ response = "BONJOUR", ready = true } = {}) {
  return {
    closed: false,
    messages: [],
    postMessage(message) {
      this.messages.push(message);
      if (message.type === "TranslationsPort:GetEngineStatusRequest") {
        setTimeout(() => {
          this.onmessage({
            data: {
              type: "TranslationsPort:GetEngineStatusResponse",
              status: ready ? "ready" : "error",
              error: "private readiness failure",
            },
          });
        });
      } else if (message.type === "TranslationsPort:TranslationRequest") {
        this.onmessage({
          data: {
            type: "TranslationsPort:TranslationResponse",
            translationId: message.translationId,
            targetText: response,
          },
        });
      }
    },
    close() {
      this.closed = true;
    },
  };
}

function createTranslatorWithPort(port, expectedLanguagePair) {
  return async options => {
    Assert.deepEqual(options.languagePair, expectedLanguagePair);
    return TranslationsTranslator.create({
      ...options,
      requestTranslationsPort: async languagePair => {
        Assert.deepEqual(languagePair, expectedLanguagePair);
        return port;
      },
    });
  };
}

add_task(async function test_translate_uses_translator_and_forwards_html() {
  const port = createMockPort({ response: "<p>BONJOUR</p>" });
  const service = new TranslationService(
    createTranslatorWithPort(port, {
      sourceLanguage: "en",
      targetLanguage: "fr",
    })
  );

  Assert.equal(
    await service.translate("<p>Hello</p>", "en", "fr", true),
    "<p>BONJOUR</p>"
  );
  Assert.deepEqual(port.messages, [
    { type: "TranslationsPort:GetEngineStatusRequest" },
    {
      type: "TranslationsPort:TranslationRequest",
      translationId: 1,
      sourceText: "<p>Hello</p>",
      isHTML: true,
    },
    { type: "TranslationsPort:Close" },
  ]);
  Assert.ok(port.closed);
});

add_task(
  async function test_translate_closes_a_captured_client_port_on_success() {
    const port = createMockPort();
    const originalRequestTranslationsPort =
      TranslationsParentActor.requestTranslationsPort;
    TranslationsParentActor.requestTranslationsPort = async () => {
      throw new Error("unexpected default requestTranslationsPort");
    };
    const service = new TranslationService(
      options => TranslationsTranslator.create(options),
      async languagePair => {
        Assert.deepEqual(languagePair, {
          sourceLanguage: "en",
          targetLanguage: "fr",
        });
        return port;
      }
    );

    try {
      Assert.equal(
        await service.translate("Hello", "en", "fr", false),
        "BONJOUR"
      );
    } finally {
      TranslationsParentActor.requestTranslationsPort =
        originalRequestTranslationsPort;
    }
    Assert.ok(port.closed);
  }
);

add_task(async function test_translate_closes_port_after_a_null_result() {
  const port = createMockPort({ response: null });
  const service = new TranslationService(
    createTranslatorWithPort(port, {
      sourceLanguage: "en",
      targetLanguage: "fr",
    })
  );

  const error = await captureRejectedError(
    service.translate("Hello", "en", "fr", false)
  );
  Assert.deepEqual(getBiDiErrorPacket(error), {
    type: "error",
    id: 1,
    error: "unknown error",
    message: "Firefox translation failed",
    stacktrace: "",
  });
  Assert.ok(port.closed);
});

add_task(async function test_translate_maps_port_acquisition_failures() {
  const service = new TranslationService(async options =>
    TranslationsTranslator.create({
      ...options,
      requestTranslationsPort: async () => {
        throw new Error("private port acquisition failure");
      },
    })
  );

  let error;
  try {
    await service.translate("Hello", "en", "fr", false);
  } catch (caughtError) {
    error = caughtError;
  }
  Assert.equal(error.name, "UnsupportedOperationError");
  Assert.equal(
    error.message,
    "Firefox translation is unavailable for the requested language pair"
  );
  Assert.ok(!error.message.includes("private port acquisition failure"));
  Assert.deepEqual(getBiDiErrorPacket(error), {
    type: "error",
    id: 1,
    error: "unsupported operation",
    message:
      "Firefox translation is unavailable for the requested language pair",
    stacktrace: "",
  });
});

add_task(
  async function test_translate_maps_readiness_failures_to_unknown_error() {
    const port = createMockPort({ ready: false });
    const service = new TranslationService(
      createTranslatorWithPort(port, {
        sourceLanguage: "en",
        targetLanguage: "fr",
      })
    );

    let error;
    try {
      await service.translate("Hello", "en", "fr", false);
    } catch (caughtError) {
      error = caughtError;
    }
    Assert.equal(error.name, "UnknownError");
    Assert.equal(error.message, "Firefox translation failed");
    Assert.ok(!error.message.includes("private readiness failure"));
    Assert.deepEqual(getBiDiErrorPacket(error), {
      type: "error",
      id: 1,
      error: "unknown error",
      message: "Firefox translation failed",
      stacktrace: "",
    });
  }
);

add_task(
  async function test_translate_closes_client_port_after_readiness_failure() {
    const port = createMockPort({ ready: false });
    const originalRequestTranslationsPort =
      TranslationsParentActor.requestTranslationsPort;
    TranslationsParentActor.requestTranslationsPort = async languagePair => {
      Assert.deepEqual(languagePair, {
        sourceLanguage: "en",
        targetLanguage: "fr",
      });
      return port;
    };

    try {
      await Assert.rejects(
        new TranslationService().translate("Hello", "en", "fr", false),
        /UnknownError: Firefox translation failed/
      );
    } finally {
      TranslationsParentActor.requestTranslationsPort =
        originalRequestTranslationsPort;
    }
    Assert.ok(port.closed);
  }
);

add_task(async function test_translate_maps_failures_and_cleans_up() {
  let destroyed = false;
  const service = new TranslationService(async () => ({
    async translate() {
      throw new Error("private translation failure");
    },
    destroy() {
      destroyed = true;
    },
  }));

  let error;
  try {
    await service.translate("Hello", "en", "fr", false);
  } catch (caughtError) {
    error = caughtError;
  }
  Assert.equal(error.name, "UnknownError");
  Assert.equal(error.message, "Firefox translation failed");
  Assert.ok(!error.message.includes("private translation failure"));
  Assert.deepEqual(getBiDiErrorPacket(error), {
    type: "error",
    id: 1,
    error: "unknown error",
    message: "Firefox translation failed",
    stacktrace: "",
  });
  Assert.ok(destroyed);
});

add_task(async function test_translate_rejects_malformed_results() {
  const port = createMockPort({ response: {} });
  const service = new TranslationService(
    createTranslatorWithPort(port, {
      sourceLanguage: "en",
      targetLanguage: "fr",
    })
  );

  const error = await captureRejectedError(
    service.translate("Hello", "en", "fr", false)
  );
  Assert.deepEqual(getBiDiErrorPacket(error), {
    type: "error",
    id: 1,
    error: "unknown error",
    message: "Firefox translation failed",
    stacktrace: "",
  });
  Assert.ok(port.closed);
});
