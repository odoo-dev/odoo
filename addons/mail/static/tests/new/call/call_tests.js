/** @odoo-module **/

import { afterNextRender, click, start, startServer } from "@mail/../tests/helpers/test_utils";
import { getFixture } from "@web/../tests/helpers/utils";

let target;
QUnit.module("call", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test("basic rendering", async function (assert) {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({
        name: "General",
    });
    const { openDiscuss } = await start({
        discuss: { context: { active_id: `mail.channel_${channelId}` } },
    });
    await openDiscuss();
    await click(".o-mail-discuss-actions button[title='Start a Call']");
    assert.containsOnce(target, ".o-mail-call");
    assert.containsOnce(target, ".o-mail-call-participant-card[aria-label='Mitchell Admin']");
    assert.containsOnce(target, ".o-mail-call-participant-card-overlay:contains(Mitchell Admin)");
    assert.containsOnce(target, ".o-mail-call-action-list");
    assert.containsN(target, ".o-mail-call-action-list button", 6);
    assert.containsOnce(target, "button[aria-label='Unmute'], button[aria-label='Mute']"); // FIXME depends on current browser permission
    assert.containsOnce(target, ".o-mail-call-action-list button[aria-label='Deafen']");
    assert.containsOnce(target, ".o-mail-call-action-list button[aria-label='Turn camera on']");
    assert.containsOnce(target, ".o-mail-call-action-list button[aria-label='Share screen']");
    assert.containsOnce(
        target,
        ".o-mail-call-action-list button[aria-label='Activate Full Screen']"
    );
    assert.containsOnce(target, ".o-mail-call-action-list button[aria-label='Disconnect']");
});

QUnit.test(
    "should not display call UI when no more members (self disconnect)",
    async function (assert) {
        const pyEnv = await startServer();
        const channelId = pyEnv["mail.channel"].create({
            name: "General",
        });
        const { openDiscuss } = await start({
            discuss: { context: { active_id: `mail.channel_${channelId}` } },
        });
        await openDiscuss();
        await click(".o-mail-discuss-actions button[title='Start a Call']");
        assert.containsOnce(target, ".o-mail-call");

        await click(".o-mail-call-action-list button[aria-label='Disconnect']");
        assert.containsNone(target, ".o-mail-call");
    }
);

QUnit.test("show call UI in chat window when in call", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({
        name: "General",
    });
    await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    await click(".o-mail-messaging-menu .o-mail-notification-item:contains(General)");
    assert.containsOnce(target, ".o-mail-chat-window");
    assert.containsNone(target, ".o-mail-call");
    assert.containsOnce(target, ".o-mail-chat-window-header .o-mail-command[title='Start a Call']");

    await click(".o-mail-chat-window-header .o-mail-command[title='Start a Call']");
    assert.containsOnce(target, ".o-mail-call");
    assert.containsNone(target, ".o-mail-chat-window-header .o-mail-command[title='Start a Call']");
});

QUnit.test("should disconnect when closing page while in call", async function (assert) {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({
        name: "General",
    });
    const { openDiscuss } = await start({
        discuss: { context: { active_id: `mail.channel_${channelId}` } },
    });
    await openDiscuss();
    await click(".o-mail-discuss-actions button[title='Start a Call']");
    assert.containsOnce(target, ".o-mail-call");

    // simulate page close
    await afterNextRender(() => window.dispatchEvent(new Event("beforeunload"), { bubble: true }));
    assert.containsNone(target, ".o-mail-call");
});
