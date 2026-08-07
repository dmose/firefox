/**
 * Load a given URL in the currently selected tab
 */
async function loadURL(url, expectedURL = undefined) {
  expectedURL = expectedURL || url;

  const browser = gBrowser.selectedTab.linkedBrowser;
  const loaded = BrowserTestUtils.browserLoaded(browser, true, expectedURL);

  BrowserTestUtils.startLoadingURIString(browser, url);
  await loaded;
}

/** Creates an inline URL for the given source document. */
function inline(src, doctype = "html") {
  let doc;
  switch (doctype) {
    case "html":
      doc = `<!doctype html>\n<meta charset=utf-8>\n${src}`;
      break;
    default:
      throw new Error("Unexpected doctype: " + doctype);
  }

  return `https://example.com/document-builder.sjs?html=${encodeURIComponent(
    doc
  )}`;
}

async function captureRejectedError(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected promise to reject");
}

function getBiDiErrorPacket(error) {
  const { WebDriverBiDiConnection } = ChromeUtils.importESModule(
    "chrome://remote/content/webdriver-bidi/WebDriverBiDiConnection.sys.mjs"
  );
  let packet;
  WebDriverBiDiConnection.prototype.sendError.call(
    {
      send(value) {
        packet = value;
      },
    },
    1,
    error
  );
  return packet;
}
