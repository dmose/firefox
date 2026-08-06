from typing import Any, Mapping

from webdriver.bidi.modules._module import BidiModule, command


class Demo(BidiModule):
    prefix = "ext"

    @command
    def list_tabs(self) -> Mapping[str, Any]:
        return {}

    @command
    def title_for_context(self, context: str) -> Mapping[str, Any]:
        return {"context": context}

    @command
    def ping(self, nonce: str) -> Mapping[str, Any]:
        return {"nonce": nonce}

    @command
    def fail(self) -> Mapping[str, Any]:
        return {}


class Ext:
    def __init__(self, bidi_session: Any):
        self.demo = Demo(bidi_session)
