import pytest_asyncio

from bidi.support.moz import Moz


@pytest_asyncio.fixture(autouse=True)
async def setup_moz_bidi(bidi_session):
    bidi_session.moz = Moz(bidi_session)
    yield
