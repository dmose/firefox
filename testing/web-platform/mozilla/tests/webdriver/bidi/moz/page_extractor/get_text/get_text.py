import pytest

pytestmark = pytest.mark.asyncio


async def test_get_text_returns_visible_text_and_links(bidi_session, inline, new_tab):
    url = inline(
        """
        <h1>Article Title</h1>
        <p>Hello from the page extractor.</p>
        <a href="https://example.com/target">A link</a>
        """
    )
    await bidi_session.browsing_context.navigate(
        context=new_tab["context"], url=url, wait="complete"
    )

    result = await bidi_session.moz.page_extractor.get_text(context=new_tab["context"])

    assert "Hello from the page extractor." in result["text"]
    assert any("example.com/target" in link for link in result["links"])


@pytest.mark.parametrize(
    "options",
    [
        {"sufficientLength": 100},
        {"justViewport": False},
        {"removeBoilerplate": False},
    ],
)
async def test_get_text_accepts_valid_options(bidi_session, inline, new_tab, options):
    await bidi_session.browsing_context.navigate(
        context=new_tab["context"],
        url=inline("<p>Valid PageExtractor options.</p>"),
        wait="complete",
    )

    result = await bidi_session.moz.page_extractor.get_text(
        context=new_tab["context"], options=options
    )

    assert "Valid PageExtractor options." in result["text"]
