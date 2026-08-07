import pytest
from tests.bidi import get_invalid_cases
from webdriver.bidi import error

pytestmark = pytest.mark.asyncio


@pytest.mark.parametrize("value", get_invalid_cases("string"))
async def test_params_context_invalid_type(bidi_session, value):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.page_extractor.get_text(context=value)


async def test_params_context_unknown(bidi_session):
    with pytest.raises(error.NoSuchFrameException):
        await bidi_session.moz.page_extractor.get_text(context="does-not-exist")


@pytest.mark.parametrize("value", get_invalid_cases("dict"))
async def test_params_options_invalid_type(bidi_session, inline, new_tab, value):
    await bidi_session.browsing_context.navigate(
        context=new_tab["context"],
        url=inline("<p>PageExtractor test.</p>"),
        wait="complete",
    )

    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.page_extractor.get_text(
            context=new_tab["context"], options=value
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
async def test_params_options_invalid(bidi_session, inline, new_tab, name, value):
    await bidi_session.browsing_context.navigate(
        context=new_tab["context"],
        url=inline("<p>PageExtractor test.</p>"),
        wait="complete",
    )

    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.page_extractor.get_text(
            context=new_tab["context"], options={name: value}
        )
