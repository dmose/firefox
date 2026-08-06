import os

import pytest
import pytest_asyncio

from bidi.support.ext import Ext


@pytest_asyncio.fixture(autouse=True)
async def setup_ext_bidi(bidi_session):
    bidi_session.ext = Ext(bidi_session)
    yield


@pytest.fixture
def demo_extension_path():
    return os.path.join(os.path.dirname(__file__), "support", "demo_extension")
