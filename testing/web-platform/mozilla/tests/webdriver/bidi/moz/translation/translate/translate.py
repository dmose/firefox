import pytest
from webdriver.bidi.undefined import UNDEFINED

pytestmark = pytest.mark.asyncio


async def test_empty_text_returns_an_empty_translation(bidi_session):
    assert await bidi_session.moz.translation.translate(
        text="", source_language="en", target_language="fr"
    ) == {"translatedText": ""}


@pytest.mark.parametrize("is_html", [UNDEFINED, False])
async def test_same_language_text_does_not_require_translation_resources(
    bidi_session, is_html
):
    result = await bidi_session.moz.translation.translate(
        text="Hello", source_language="en", target_language="en", is_html=is_html
    )

    assert result == {"translatedText": "Hello"}


async def test_same_language_html_is_preserved(bidi_session):
    assert await bidi_session.moz.translation.translate(
        text="<p>Hello</p>",
        source_language="en",
        target_language="en",
        is_html=True,
    ) == {"translatedText": "<p>Hello</p>"}
