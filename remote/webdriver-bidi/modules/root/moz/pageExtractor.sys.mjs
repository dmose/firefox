/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { RootBiDiModule } from "chrome://remote/content/webdriver-bidi/modules/RootBiDiModule.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  assert: "chrome://remote/content/shared/webdriver/Assert.sys.mjs",
  error: "chrome://remote/content/shared/webdriver/Errors.sys.mjs",
  PageExtractorParent: "resource://gre/actors/PageExtractorParent.sys.mjs",
  pprint: "chrome://remote/content/shared/Format.sys.mjs",
});

const GET_TEXT_OPTION_VALIDATORS = {
  sufficientLength(value) {
    lazy.assert.positiveInteger(
      value,
      lazy.pprint`Expected "sufficientLength" to be a positive integer, got ${value}`
    );
    if (value === 0) {
      throw new lazy.error.InvalidArgumentError(
        'Expected "sufficientLength" to be greater than zero'
      );
    }
  },

  justViewport(value) {
    lazy.assert.boolean(
      value,
      lazy.pprint`Expected "justViewport" to be a boolean, got ${value}`
    );
  },

  removeBoilerplate(value) {
    lazy.assert.boolean(
      value,
      lazy.pprint`Expected "removeBoilerplate" to be a boolean, got ${value}`
    );
  },
};

function createProtocolError(ErrorClass, message) {
  const error = new ErrorClass(message);
  error.stack = "";
  return error;
}

function getTextOptions(options, sourceUrl) {
  return { sourceUrl, ...validateGetTextOptions(options) };
}

function validateGetTextOptions(options) {
  lazy.assert.object(
    options,
    lazy.pprint`Expected "options" to be an object, got ${options}`
  );

  const sanitized = {};
  for (const [name, value] of Object.entries(options)) {
    if (!Object.hasOwn(GET_TEXT_OPTION_VALIDATORS, name)) {
      throw new lazy.error.InvalidArgumentError(
        `Unsupported PageExtractor option "${name}"`
      );
    }
    const validate = GET_TEXT_OPTION_VALIDATORS[name];
    validate(value);
    sanitized[name] = value;
  }
  return sanitized;
}

function validateHeadlessUrl(urlString, anonymousFetch) {
  const url = URL.parse(urlString);
  if (!url || !["http:", "https:"].includes(url.protocol)) {
    throw new lazy.error.InvalidArgumentError(
      "Expected url to be a valid http or https URL"
    );
  }
  if (anonymousFetch && url.protocol === "http:") {
    const principal = Services.scriptSecurityManager.createContentPrincipal(
      url.URI,
      {}
    );
    if (!principal.isLoopbackHost && !principal.isLocalIpAddress) {
      throw new lazy.error.InvalidArgumentError(
        "Anonymous fetch requires https except for loopback or local addresses"
      );
    }
  }
}

class PageExtractorModule extends RootBiDiModule {
  destroy() {}

  /**
   * Extract the visible text and links from a browsing context using the
   * platform PageExtractor.
   *
   * @param {object} options
   * @param {string} options.context
   *     Id of the browsing context to extract from.
   * @param {object=} options.options
   *     Extraction options forwarded to PageExtractor. A subset of GetTextOptions:
   *     `sufficientLength`, `justViewport`, and `removeBoilerplate`.
   *
   * @returns {Promise<{ text: string, links: string[] }>}
   *
   * @throws {NoSuchFrameError}
   *     If the browsing context cannot be found.
   * @throws {UnsupportedOperationError}
   *     If PageExtractor is not available for the context.
   */
  async getText(options = {}) {
    const { context: contextId, options: extractOptions = {} } = options;

    lazy.assert.string(
      contextId,
      lazy.pprint`Expected "context" to be a string, got ${contextId}`
    );

    const context = this._getNavigable(contextId);
    const safeOptions = getTextOptions(extractOptions, context.currentURI.spec);
    let result;
    try {
      const actor = this.#getActor(contextId);
      result = await actor.getText(safeOptions);
    } catch (error) {
      if (lazy.error.isWebDriverError(error)) {
        throw error;
      }
      throw createProtocolError(
        lazy.error.UnknownError,
        "PageExtractor text extraction failed"
      );
    }

    return { text: result?.text ?? "", links: result?.links ?? [] };
  }

  /**
   * Get page metadata (structured-data types, word count, language, readability)
   * for a browsing context.
   *
   * @param {object} options
   * @param {string} options.context
   *     Id of the browsing context.
   *
   * @returns {Promise<object>}
   */
  async getPageMetadata(options = {}) {
    const { context: contextId } = options;

    lazy.assert.string(
      contextId,
      lazy.pprint`Expected "context" to be a string, got ${contextId}`
    );

    try {
      return await this.#getActor(contextId).getPageMetadata();
    } catch (error) {
      if (lazy.error.isWebDriverError(error)) {
        throw error;
      }
      throw createProtocolError(
        lazy.error.UnknownError,
        "PageExtractor metadata extraction failed"
      );
    }
  }

  /**
   * Fetch a URL in a headless (hidden) browser and extract its text and links,
   * without disturbing any visible tab.
   *
   * @param {object} options
   * @param {string} options.url
   *     The http(s) URL to load and extract.
   * @param {boolean=} options.anonymousFetch
   *     If true, load the page without sending user data (cookies, referrer,
   *     history, cache). http is then only allowed for loopback/local URLs.
   * @param {object=} options.options
   *     Extraction options forwarded to PageExtractor (see getText).
   *
   * @returns {Promise<{ text: string, links: string[] }>}
   */
  async getHeadlessText(options = {}) {
    const {
      url,
      anonymousFetch = false,
      options: extractOptions = {},
    } = options;

    lazy.assert.string(
      url,
      lazy.pprint`Expected "url" to be a string, got ${url}`
    );

    lazy.assert.boolean(
      anonymousFetch,
      lazy.pprint`Expected "anonymousFetch" to be a boolean, got ${anonymousFetch}`
    );
    validateHeadlessUrl(url, anonymousFetch);
    const safeOptions = validateGetTextOptions(extractOptions);

    let result;
    try {
      result = await lazy.PageExtractorParent.getHeadlessExtractor({
        urlString: url,
        anonymousFetch,
        callback: actor =>
          actor.getText({
            sourceUrl: actor.browsingContext.currentURI.spec,
            ...safeOptions,
          }),
      });
    } catch (error) {
      if (lazy.error.isWebDriverError(error)) {
        throw error;
      }
      throw createProtocolError(
        lazy.error.UnknownError,
        "PageExtractor headless extraction failed"
      );
    }

    return { text: result?.text ?? "", links: result?.links ?? [] };
  }

  #getActor(contextId) {
    const context = this._getNavigable(contextId);
    const actor = context?.currentWindowGlobal?.getActor("PageExtractor");
    if (!actor) {
      throw createProtocolError(
        lazy.error.UnsupportedOperationError,
        `PageExtractor is not available for the browsing context with id ${contextId}`
      );
    }
    return actor;
  }

  static get supportedEvents() {
    return [];
  }
}

// To export the class as lower-case
export const pageExtractor = PageExtractorModule;
