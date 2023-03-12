/** @odoo-module **/

import { afterNextRender, click, start, startServer } from "@mail/../tests/helpers/test_utils";
import { editInput, nextTick, patchWithCleanup, triggerEvent } from "@web/../tests/helpers/utils";
import { browser } from "@web/core/browser/browser";

QUnit.module("call");

QUnit.test("basic rendering", async (assert) => {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({
        name: "General",
    });
    const { openDiscuss } = await start();
    await openDiscuss(channelId);
    await click(".o-mail-Discuss-header button[title='Start a Call']");
    assert.containsOnce($, ".o-mail-Call");
    assert.containsOnce($, ".o-mail-CallParticipantCard[aria-label='Mitchell Admin']");
    assert.containsOnce($, ".o-mail-CallActionList");
    assert.containsN($, ".o-mail-CallActionList button", 6);
    assert.containsOnce($, "button[aria-label='Unmute'], button[aria-label='Mute']"); // FIXME depends on current browser permission
    assert.containsOnce($, ".o-mail-CallActionList button[aria-label='Deafen']");
    assert.containsOnce($, ".o-mail-CallActionList button[aria-label='Turn camera on']");
    assert.containsOnce($, ".o-mail-CallActionList button[aria-label='Share screen']");
    assert.containsOnce($, ".o-mail-CallActionList button[aria-label='Enter Full Screen']");
    assert.containsOnce($, ".o-mail-CallActionList button[aria-label='Disconnect']");
});

QUnit.test("should not display call UI when no more members (self disconnect)", async (assert) => {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({ name: "General" });
    const { openDiscuss } = await start();
    await openDiscuss(channelId);
    await click(".o-mail-Discuss-header button[title='Start a Call']");
    assert.containsOnce($, ".o-mail-Call");

    await click(".o-mail-CallActionList button[aria-label='Disconnect']");
    assert.containsNone($, ".o-mail-Call");
});

QUnit.test("show call UI in chat window when in call", async (assert) => {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({ name: "General" });
    await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    await click(".o-mail-NotificationItem:contains(General)");
    assert.containsOnce($, ".o-mail-ChatWindow");
    assert.containsNone($, ".o-mail-Call");
    assert.containsOnce(
        $,
        ".o-mail-ChatWindow-header .o-mail-ChatWindow-command[title='Start a Call']"
    );

    await click(".o-mail-ChatWindow-header .o-mail-ChatWindow-command[title='Start a Call']");
    assert.containsOnce($, ".o-mail-Call");
    assert.containsNone(
        $,
        ".o-mail-ChatWindow-header .o-mail-ChatWindow-command[title='Start a Call']"
    );
});

QUnit.test("should disconnect when closing page while in call", async (assert) => {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({ name: "General" });
    const { openDiscuss, env } = await start();
    await openDiscuss(channelId);
    patchWithCleanup(browser, {
        navigator: {
            ...browser.navigator,
            sendBeacon: async (route, data) => {
                if (data instanceof Blob && route === "/mail/rtc/channel/leave_call") {
                    assert.step("sendBeacon_leave_call");
                    const blobText = await data.text();
                    const blobData = JSON.parse(blobText);
                    assert.strictEqual(blobData.params.channel_id, channelId);
                }
            },
        },
    });

    await click(".o-mail-Discuss-header button[title='Start a Call']");
    assert.containsOnce($, ".o-mail-Call");
    // simulate page close
    await afterNextRender(() => window.dispatchEvent(new Event("pagehide"), { bubble: true }));
    await nextTick();
    assert.verifySteps(["sendBeacon_leave_call"]);
    /**
     * during the tests, the browser is not really closed,
     * so we need to end the call manually to avoid memory leaks.
     */
    env.services["mail.rtc"]?.endCall();
});

QUnit.test("no default rtc after joining a chat conversation", async (assert) => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ name: "Mario" });
    pyEnv["res.users"].create({ partner_id: partnerId });
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsNone($, ".o-mail-DiscussCategoryItem");

    await click(".o-mail-DiscussSidebar i[title='Start a conversation']");
    await afterNextRender(() => editInput(document.body, ".o-mail-ChannelSelector input", "mario"));
    await click(".o-mail-ChannelSelector-suggestion");
    await triggerEvent(document.body, ".o-mail-ChannelSelector input", "keydown", {
        key: "Enter",
    });
    assert.containsOnce($, ".o-mail-DiscussCategoryItem");
    assert.containsNone($, ".o-mail-Discuss-content .o-mail-Message");
    assert.containsNone($, ".o-mail-Call");
});

QUnit.test("no default rtc after joining a group conversation", async (assert) => {
    const pyEnv = await startServer();
    const [partnerId_1, partnerId_2] = pyEnv["res.partner"].create([
        { name: "Mario" },
        { name: "Luigi" },
    ]);
    pyEnv["res.users"].create([{ partner_id: partnerId_1 }, { partner_id: partnerId_2 }]);
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsNone($, ".o-mail-DiscussCategoryItem");
    await click(".o-mail-DiscussSidebar i[title='Start a conversation']");
    await afterNextRender(() => editInput(document.body, ".o-mail-ChannelSelector input", "mario"));
    await click(".o-mail-ChannelSelector-suggestion");
    await afterNextRender(() => editInput(document.body, ".o-mail-ChannelSelector input", "luigi"));
    await click(".o-mail-ChannelSelector-suggestion");
    await triggerEvent(document.body, ".o-mail-ChannelSelector input", "keydown", {
        key: "Enter",
    });
    assert.containsOnce($, ".o-mail-DiscussCategoryItem");
    assert.containsNone($, ".o-mail-Discuss-content .o-mail-Message");
    assert.containsNone($, ".o-mail-Call");
});
