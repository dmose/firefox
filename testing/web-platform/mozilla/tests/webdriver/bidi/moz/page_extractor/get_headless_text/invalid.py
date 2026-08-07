from urllib.parse import quote, urlsplit

import pytest
from tests.bidi import get_invalid_cases
from webdriver.bidi import error

pytestmark = pytest.mark.asyncio


@pytest.mark.parametrize("value", get_invalid_cases("string"))
async def test_params_url_invalid_type(bidi_session, value):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.page_extractor.get_headless_text(url=value)


@pytest.mark.parametrize("value", get_invalid_cases("dict"))
async def test_params_options_invalid_type(bidi_session, inline, value):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.page_extractor.get_headless_text(
            url=inline("<p>PageExtractor test.</p>"), options=value
        )


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("sufficientLength", 0),
        ("sufficientLength", 1.5),
        ("sufficientLength", "100"),
        ("justViewport", 1),
        ("removeBoilerplate", "false"),
        ("sourceUrl", "https://example.com/override"),
        ("toString", True),
        ("constructor", True),
        ("unknownOption", True),
    ],
)
async def test_params_options_invalid(bidi_session, inline, name, value):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.page_extractor.get_headless_text(
            url=inline("<p>PageExtractor test.</p>"), options={name: value}
        )


@pytest.mark.parametrize("value", get_invalid_cases("boolean"))
async def test_params_anonymous_fetch_invalid_type(bidi_session, inline, value):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.page_extractor.get_headless_text(
            url=inline("<p>PageExtractor test.</p>"), anonymous_fetch=value
        )


@pytest.mark.parametrize("url", ["not a URL", "file:///tmp/page.html"])
async def test_params_url_invalid_value(bidi_session, url):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.page_extractor.get_headless_text(url=url)


async def test_params_anonymous_fetch_rejects_public_http(bidi_session):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.page_extractor.get_headless_text(
            url="http://example.com/article", anonymous_fetch=True
        )


@pytest.mark.capabilities({
    "moz:firefoxOptions": {"prefs": {"browser.ml.pageExtractor.headlessTimeoutMs": 100}}
})
async def test_params_options_are_validated_before_headless_navigation(
    bidi_session, inline
):
    source = inline("<p>Source page.</p>")
    destination = inline("<p>Destination page.</p>", domain="alt")
    parts = urlsplit(source)
    redirect_url = (
        f"{parts.scheme}://{parts.netloc}/common/redirect.py?location="
        f"{quote(destination, safe='')}"
    )

    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.page_extractor.get_headless_text(
            url=redirect_url, options={"sufficientLength": 0}
        )
