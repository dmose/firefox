from typing import Any

from bidi.support.debugging import Debugging
from bidi.support.page_extractor import PageExtractor
from bidi.support.profiler import Profiler
from bidi.support.summarization import Summarization
from bidi.support.translation import Translation


class Moz:
    def __init__(self, bidi_session: Any):
        self.debugging = Debugging(bidi_session)
        self.page_extractor = PageExtractor(bidi_session)
        self.profiler = Profiler(bidi_session)
        self.summarization = Summarization(bidi_session)
        self.translation = Translation(bidi_session)
