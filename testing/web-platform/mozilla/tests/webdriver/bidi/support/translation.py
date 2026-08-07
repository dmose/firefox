from typing import Mapping

from webdriver.bidi.modules._module import BidiModule, command
from webdriver.bidi.undefined import UNDEFINED, Maybe


class Translation(BidiModule):
    prefix = "moz"

    @command
    def translate(
        self,
        text: str,
        source_language: str,
        target_language: str,
        is_html: Maybe[bool] = UNDEFINED,
    ) -> Mapping[str, str]:
        return {
            "text": text,
            "sourceLanguage": source_language,
            "targetLanguage": target_language,
            "isHTML": is_html,
        }
