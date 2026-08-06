import pytest
import pytest_asyncio
from webdriver.bidi import error

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def demo_installed(install_webextension, demo_extension_path):
    yield await install_webextension(
        extension_data={"type": "path", "path": demo_extension_path}
    )


async def test_command_is_available_right_after_install(bidi_session, demo_installed):
    result = await bidi_session.ext.demo.list_tabs()

    assert "tabs" in result
    assert isinstance(result["tabs"], list)


async def test_command_resolves_bidi_context_to_tab(
    bidi_session, demo_installed, inline, new_tab
):
    url = inline("<title>Bridged title</title><p>hello</p>")
    await bidi_session.browsing_context.navigate(
        context=new_tab["context"], url=url, wait="complete"
    )

    result = await bidi_session.ext.demo.title_for_context(context=new_tab["context"])

    assert result["title"] == "Bridged title"
    assert isinstance(result["tabId"], int)


async def test_undeclared_command_is_unknown(bidi_session, demo_installed):
    future = await bidi_session.send_command("ext:demo.notDeclared", {})
    with pytest.raises(error.UnknownCommandException):
        await future


async def test_unknown_module_is_unknown(bidi_session):
    future = await bidi_session.send_command("ext:nosuchmodule.anything", {})
    with pytest.raises(error.UnknownCommandException):
        await future


async def test_extension_event_reaches_subscriber(
    bidi_session,
    demo_installed,
    subscribe_events,
    wait_for_event,
    wait_for_future_safe,
):
    await subscribe_events(events=["ext:demo.pinged"])
    on_pinged = wait_for_event("ext:demo.pinged")

    await bidi_session.ext.demo.ping(nonce="abc123")

    data = await wait_for_future_safe(on_pinged)
    assert data == {"nonce": "abc123"}


async def test_autonomous_extension_event_reaches_subscriber(
    bidi_session,
    demo_installed,
    subscribe_events,
    wait_for_event,
    wait_for_future_safe,
):
    await subscribe_events(events=["ext:demo.tabCreated"])
    on_tab_created = wait_for_event("ext:demo.tabCreated")

    new_context = None
    try:
        new_context = await bidi_session.browsing_context.create(type_hint="tab")
        data = await wait_for_future_safe(on_tab_created)
        assert isinstance(data["tabId"], int)
    finally:
        if new_context is not None:
            await bidi_session.browsing_context.close(context=new_context["context"])


async def test_event_reaches_subscriber_after_reinstall(
    bidi_session,
    demo_extension_path,
    install_webextension,
    subscribe_events,
    wait_for_event,
    wait_for_future_safe,
):
    first_install = await bidi_session.web_extension.install(
        extension_data={"type": "path", "path": demo_extension_path}
    )
    await bidi_session.ext.demo.list_tabs()
    await bidi_session.web_extension.uninstall(extension=first_install)

    await install_webextension(
        extension_data={"type": "path", "path": demo_extension_path}
    )

    await subscribe_events(events=["ext:demo.pinged"])
    on_pinged = wait_for_event("ext:demo.pinged")

    await bidi_session.ext.demo.ping(nonce="xyz789")

    data = await wait_for_future_safe(on_pinged)
    assert data == {"nonce": "xyz789"}


async def test_event_subscription_rejects_unknown_event(bidi_session, demo_installed):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.session.subscribe(events=["ext:demo.neverDeclared"])


async def test_handler_error_becomes_unknown_error(bidi_session, demo_installed):
    with pytest.raises(error.UnknownErrorException, match="demo command failed"):
        await bidi_session.ext.demo.fail()


async def test_nested_context_resolves_to_enclosing_tab(
    bidi_session, demo_installed, inline, iframe, new_tab
):
    url = inline(f"<title>Top title</title>{iframe('<p>child</p>')}")
    await bidi_session.browsing_context.navigate(
        context=new_tab["context"], url=url, wait="complete"
    )
    contexts = await bidi_session.browsing_context.get_tree(root=new_tab["context"])
    child_context = contexts[0]["children"][0]["context"]

    top = await bidi_session.ext.demo.title_for_context(context=new_tab["context"])
    child = await bidi_session.ext.demo.title_for_context(context=child_context)

    assert child["tabId"] == top["tabId"]
    assert child["title"] == top["title"] == "Top title"


async def test_command_gone_after_uninstall(bidi_session, demo_extension_path):
    extension = await bidi_session.web_extension.install(
        extension_data={"type": "path", "path": demo_extension_path}
    )
    await bidi_session.web_extension.uninstall(extension=extension)

    with pytest.raises(error.UnknownCommandException):
        await bidi_session.ext.demo.list_tabs()
