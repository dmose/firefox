/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { pageExtractor: PageExtractorModule } = ChromeUtils.importESModule(
  "chrome://remote/content/webdriver-bidi/modules/root/moz/pageExtractor.sys.mjs"
);
const { PageExtractorParent } = ChromeUtils.importESModule(
  "resource://gre/actors/PageExtractorParent.sys.mjs"
);

function createPageExtractorModule(actor) {
  const module = new PageExtractorModule(null);
  module._getNavigable = () => ({
    currentURI: { spec: "https://example.com/article" },
    currentWindowGlobal: {
      getActor: () => actor,
    },
  });
  return module;
}

add_task(async function test_getText_validates_options_before_getting_actor() {
  const module = new PageExtractorModule(null);
  module._getNavigable = () => ({
    currentURI: { spec: "https://example.com/article" },
    currentWindowGlobal: {
      getActor() {
        throw new Error("actor should not be acquired");
      },
    },
  });

  const error = await captureRejectedError(
    module.getText({
      context: "test-context",
      options: { constructor: true },
    })
  );

  Assert.equal(error.name, "InvalidArgumentError");
});

add_task(async function test_getText_wraps_platform_errors() {
  const module = createPageExtractorModule({
    async getText() {
      throw new Error("private platform failure");
    },
  });

  const error = await captureRejectedError(
    module.getText({ context: "test-context" })
  );
  Assert.deepEqual(getBiDiErrorPacket(error), {
    type: "error",
    id: 1,
    error: "unknown error",
    message: "PageExtractor text extraction failed",
    stacktrace: "",
  });
});

add_task(async function test_getPageMetadata_wraps_platform_errors() {
  const module = createPageExtractorModule({
    async getPageMetadata() {
      throw new Error("private metadata failure");
    },
  });

  const error = await captureRejectedError(
    module.getPageMetadata({ context: "test-context" })
  );
  Assert.deepEqual(getBiDiErrorPacket(error), {
    type: "error",
    id: 1,
    error: "unknown error",
    message: "PageExtractor metadata extraction failed",
    stacktrace: "",
  });
});

add_task(async function test_getText_hides_actor_acquisition_stack() {
  const module = createPageExtractorModule(null);

  const error = await captureRejectedError(
    module.getText({ context: "test-context" })
  );
  Assert.deepEqual(getBiDiErrorPacket(error), {
    type: "error",
    id: 1,
    error: "unsupported operation",
    message:
      "PageExtractor is not available for the browsing context with id test-context",
    stacktrace: "",
  });
});

add_task(async function test_getHeadlessText_wraps_platform_errors() {
  const originalGetHeadlessExtractor = PageExtractorParent.getHeadlessExtractor;
  PageExtractorParent.getHeadlessExtractor = async () => {
    throw new Error("private headless failure");
  };

  let error;
  try {
    error = await captureRejectedError(
      new PageExtractorModule(null).getHeadlessText({
        url: "https://example.com/article",
      })
    );
  } finally {
    PageExtractorParent.getHeadlessExtractor = originalGetHeadlessExtractor;
  }

  Assert.deepEqual(getBiDiErrorPacket(error), {
    type: "error",
    id: 1,
    error: "unknown error",
    message: "PageExtractor headless extraction failed",
    stacktrace: "",
  });
});
