from typing import Any, Mapping

from webdriver.bidi.modules._module import BidiModule, command
from webdriver.bidi.undefined import UNDEFINED, Maybe


class PageExtractor(BidiModule):
    prefix = "moz"

    @command
    def get_text(
        self,
        context: str,
        options: Maybe[Mapping[str, Any]] = UNDEFINED,
    ) -> Mapping[str, Any]:
        return {"context": context, "options": options}

    @command
    def get_page_metadata(self, context: str) -> Mapping[str, Any]:
        return {"context": context}

    @command
    def get_headless_text(
        self,
        url: str,
        anonymous_fetch: Maybe[bool] = UNDEFINED,
        options: Maybe[Mapping[str, Any]] = UNDEFINED,
    ) -> Mapping[str, Any]:
        return {
            "url": url,
            "anonymousFetch": anonymous_fetch,
            "options": options,
        }
