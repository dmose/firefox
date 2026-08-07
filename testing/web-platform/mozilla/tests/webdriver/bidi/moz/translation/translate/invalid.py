import pytest
from tests.bidi import get_invalid_cases
from webdriver.bidi import error

pytestmark = pytest.mark.asyncio


async def test_params_text_missing_with_languages_present(bidi_session):
    with pytest.raises(error.InvalidArgumentException):
        future = await bidi_session.send_command(
            "moz:translation.translate",
            {"sourceLanguage": "en", "targetLanguage": "fr"},
        )
        await future


async def test_params_source_language_missing_with_text_and_target_present(
    bidi_session,
):
    with pytest.raises(error.InvalidArgumentException):
        future = await bidi_session.send_command(
            "moz:translation.translate",
            {"text": "Hello", "targetLanguage": "fr"},
        )
        await future


@pytest.mark.parametrize(
    "params", [{}, {"text": "Hello"}, {"text": "Hello", "sourceLanguage": "en"}]
)
async def test_required_params_missing(bidi_session, params):
    with pytest.raises(error.InvalidArgumentException):
        future = await bidi_session.send_command("moz:translation.translate", params)
        await future


@pytest.mark.parametrize("value", get_invalid_cases("string"))
async def test_text_invalid_type(bidi_session, value):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.translation.translate(
            text=value, source_language="en", target_language="fr"
        )


@pytest.mark.parametrize("value", get_invalid_cases("string"))
async def test_source_language_invalid_type(bidi_session, value):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.translation.translate(
            text="Hello", source_language=value, target_language="fr"
        )


@pytest.mark.parametrize("value", get_invalid_cases("string"))
async def test_target_language_invalid_type(bidi_session, value):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.translation.translate(
            text="Hello", source_language="en", target_language=value
        )


@pytest.mark.parametrize("value", get_invalid_cases("boolean"))
async def test_is_html_invalid_type(bidi_session, value):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.translation.translate(
            text="Hello",
            source_language="en",
            target_language="fr",
            is_html=value,
        )


@pytest.mark.parametrize(
    ("source_language", "target_language"),
    [
        ("not_a_language_tag", "fr"),
        ("en", "not_a_language_tag"),
        ("", "fr"),
        ("en", ""),
    ],
)
async def test_language_tags_must_be_valid(
    bidi_session, source_language, target_language
):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.translation.translate(
            text="Hello",
            source_language=source_language,
            target_language=target_language,
        )
