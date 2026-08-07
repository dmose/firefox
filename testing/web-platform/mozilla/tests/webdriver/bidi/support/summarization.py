from typing import Mapping

from webdriver.bidi.modules._module import BidiModule, command


class Summarization(BidiModule):
    prefix = "moz"

    @command
    def summarize(self, text: str) -> Mapping[str, str]:
        return {"text": text}
