/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { SummarizationService } = ChromeUtils.importESModule(
  "chrome://remote/content/webdriver-bidi/modules/root/moz/summarization.sys.mjs"
);

add_task(async function test_summarize_uses_the_summarization_engine() {
  const calls = [];
  let terminateCount = 0;
  const service = new SummarizationService(async options => {
    Assert.deepEqual(options, { taskName: "summarization" });
    return {
      async run(request) {
        calls.push(request);
        return [{ summary_text: "Short summary." }];
      },
      async terminate() {
        terminateCount++;
      },
    };
  });

  Assert.equal(await service.summarize("Long article."), "Short summary.");
  Assert.deepEqual(calls, [{ args: ["Long article."] }]);
  await service.destroy();
  Assert.equal(terminateCount, 1);
});

add_task(
  async function test_summarize_reuses_one_initialization_for_concurrent_calls() {
    let createCount = 0;
    const service = new SummarizationService(async () => {
      createCount++;
      return {
        async run({ args: [text] }) {
          return [{ summary_text: text }];
        },
        async terminate() {},
      };
    });

    Assert.deepEqual(
      await Promise.all([
        service.summarize("First."),
        service.summarize("Second."),
      ]),
      ["First.", "Second."]
    );
    Assert.equal(createCount, 1);
    await service.destroy();
  }
);

add_task(
  async function test_summarize_retries_initialization_after_a_failure() {
    let createCount = 0;
    const service = new SummarizationService(async () => {
      createCount++;
      if (createCount === 1) {
        throw new Error("private initialization failure");
      }
      return {
        async run() {
          return [{ summary_text: "Recovered summary." }];
        },
        async terminate() {},
      };
    });

    let error;
    try {
      await service.summarize("Long article.");
    } catch (caughtError) {
      error = caughtError;
    }
    Assert.equal(error.name, "UnsupportedOperationError");
    Assert.equal(error.message, "Firefox summarization is unavailable");
    Assert.ok(!error.message.includes("private initialization failure"));
    Assert.deepEqual(getBiDiErrorPacket(error), {
      type: "error",
      id: 1,
      error: "unsupported operation",
      message: "Firefox summarization is unavailable",
      stacktrace: "",
    });
    Assert.equal(
      await service.summarize("Long article."),
      "Recovered summary."
    );
    Assert.equal(createCount, 2);
    await service.destroy();
  }
);

add_task(
  async function test_summarize_maps_run_failures_without_exposing_internal_errors() {
    const service = new SummarizationService(async () => ({
      async run() {
        throw new Error("private inference failure");
      },
      async terminate() {},
    }));

    let error;
    try {
      await service.summarize("Long article.");
    } catch (caughtError) {
      error = caughtError;
    }
    Assert.equal(error.name, "UnknownError");
    Assert.equal(error.message, "Firefox summarization failed");
    Assert.ok(!error.message.includes("private inference failure"));
    Assert.deepEqual(getBiDiErrorPacket(error), {
      type: "error",
      id: 1,
      error: "unknown error",
      message: "Firefox summarization failed",
      stacktrace: "",
    });
    await service.destroy();
  }
);

add_task(async function test_summarize_rejects_invalid_engine_results() {
  for (const result of [[], [{}], [{ summary_text: 1 }]]) {
    const service = new SummarizationService(async () => ({
      async run() {
        return result;
      },
      async terminate() {},
    }));

    const error = await captureRejectedError(
      service.summarize("Long article.")
    );
    Assert.deepEqual(getBiDiErrorPacket(error), {
      type: "error",
      id: 1,
      error: "unknown error",
      message: "Firefox summarization returned an invalid result",
      stacktrace: "",
    });
    await service.destroy();
  }
});

add_task(
  async function test_destroy_is_safe_before_initialization_and_runs_once() {
    let terminateCount = 0;
    const service = new SummarizationService(async () => ({
      async run() {
        return [{ summary_text: "Short summary." }];
      },
      async terminate() {
        terminateCount++;
      },
    }));

    await service.destroy();
    await service.summarize("Long article.");
    await Promise.all([service.destroy(), service.destroy()]);
    Assert.equal(terminateCount, 1);
  }
);
