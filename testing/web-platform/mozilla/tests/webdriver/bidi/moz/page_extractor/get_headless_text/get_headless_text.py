from urllib.parse import quote, urlsplit

import pytest

pytestmark = pytest.mark.asyncio


async def test_get_headless_text(bidi_session, inline, top_context):
    url = inline(
        """
        <h1>Headless Title</h1>
        <p>Extracted without a visible tab.</p>
        <a href="https://example.com/headless">link</a>
        """
    )

    # No context is passed: extraction happens in a hidden browser.
    result = await bidi_session.moz.page_extractor.get_headless_text(url=url)

    assert "Extracted without a visible tab." in result["text"]
    assert any("example.com/headless" in link for link in result["links"])

    # The visible top-level context must not have navigated to the target.
    contexts = await bidi_session.browsing_context.get_tree(root=top_context["context"])
    assert contexts[0]["url"] != url


async def test_get_headless_text_anonymous_fetch_allows_local_http(
    bidi_session, inline
):
    url = inline("<p>Anonymous local HTTP extraction.</p>", protocol="http").replace(
        "web-platform.test", "127.0.0.1"
    )

    result = await bidi_session.moz.page_extractor.get_headless_text(
        url=url, anonymous_fetch=True
    )

    assert "Anonymous local HTTP extraction." in result["text"]


async def test_get_headless_text_uses_redirect_destination(bidi_session, inline):
    destination = inline("<p>Redirect destination extraction.</p>")
    parts = urlsplit(destination)
    redirect_url = (
        f"{parts.scheme}://{parts.netloc}/common/redirect.py?location="
        f"{quote(destination, safe='')}"
    )

    result = await bidi_session.moz.page_extractor.get_headless_text(url=redirect_url)

    assert "Redirect destination extraction." in result["text"]


async def test_get_headless_text_cleans_up_after_each_call(bidi_session, inline):
    url = inline("<p>Repeat headless extraction.</p>")
    contexts_before = await bidi_session.browsing_context.get_tree()

    for _ in range(2):
        result = await bidi_session.moz.page_extractor.get_headless_text(url=url)

        assert "Repeat headless extraction." in result["text"]
        assert await bidi_session.browsing_context.get_tree() == contexts_before
