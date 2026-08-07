import pytest

pytestmark = pytest.mark.asyncio


async def test_get_page_metadata(bidi_session, inline, new_tab):
    url = inline(
        """
        <script type="application/ld+json">
        {"@context": "https://schema.org", "@type": "Recipe", "name": "Test Recipe"}
        </script>
        <h1>Article Title</h1>
        <p>Some words here so that the word count is greater than zero.</p>
        """
    )
    await bidi_session.browsing_context.navigate(
        context=new_tab["context"], url=url, wait="complete"
    )

    result = await bidi_session.moz.page_extractor.get_page_metadata(
        context=new_tab["context"]
    )

    assert "Recipe" in result["structuredDataTypes"]
    assert result["wordCount"] > 0
    assert isinstance(result["isReaderable"], bool)
    assert "language" in result
