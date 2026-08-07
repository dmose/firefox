import pytest
from webdriver.bidi import error

pytestmark = pytest.mark.asyncio


async def test_empty_text_returns_an_empty_summary(bidi_session):
    assert await bidi_session.moz.summarization.summarize(text="") == {"summary": ""}


@pytest.mark.capabilities({
    "moz:firefoxOptions": {"prefs": {"browser.ml.enable": False}}
})
async def test_empty_text_does_not_initialize_an_engine(bidi_session):
    result = await bidi_session.moz.summarization.summarize(text="")

    assert result == {"summary": ""}


@pytest.mark.capabilities({
    "moz:firefoxOptions": {"prefs": {"browser.ml.enable": False}}
})
async def test_disabled_feature_is_unsupported(bidi_session):
    with pytest.raises(error.UnsupportedOperationException) as exception:
        await bidi_session.moz.summarization.summarize(text="Non-empty text")

    assert exception.value.message == "Firefox summarization is unavailable"
    assert exception.value.stacktrace == ""
