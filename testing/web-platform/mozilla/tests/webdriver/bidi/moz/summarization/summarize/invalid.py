import pytest
from tests.bidi import get_invalid_cases
from webdriver.bidi import error

pytestmark = pytest.mark.asyncio


async def test_params_text_missing(bidi_session):
    with pytest.raises(error.InvalidArgumentException):
        future = await bidi_session.send_command("moz:summarization.summarize", {})
        await future


@pytest.mark.parametrize("value", get_invalid_cases("string"))
async def test_params_text_invalid_type(bidi_session, value):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.summarization.summarize(text=value)
