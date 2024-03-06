/** @odoo-module alias=@mail/../tests/discuss/core/web/messaging_menu_tests default=false */

import { rpc } from "@web/core/network/rpc";

import { startServer } from "@bus/../tests/helpers/mock_python_environment";

import { Command } from "@mail/../tests/helpers/command";
import { patchBrowserNotification } from "@mail/../tests/helpers/patch_notifications";
import { patchUiSize } from "@mail/../tests/helpers/patch_ui_size";
import { openDiscuss, start } from "@mail/../tests/helpers/test_utils";

import { patchWithCleanup, triggerHotkey } from "@web/../tests/helpers/utils";
import { click, contains, insertText } from "@web/../tests/utils";

QUnit.module("messaging menu");

QUnit.test('"Start a conversation" item selection opens chat', async () => {
    patchUiSize({ height: 360, width: 640 });
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ name: "Gandalf" });
    pyEnv["res.users"].create({ partner_id: partnerId });
    await start();
    await openDiscuss();
    await contains("button.active", { text: "Inbox" });
    await click("button", { text: "Chat" });
    await click("button", { text: "Start a conversation" });
    await insertText("input[placeholder='Start a conversation']", "Gandalf");
    await click(".o-discuss-ChannelSelector-suggestion");
    await contains(".o-discuss-ChannelSelector-suggestion", { count: 0 });
    triggerHotkey("Enter");
    await contains(".o-mail-ChatWindow", { text: "Gandalf" });
});

QUnit.test('"New channel" item selection opens channel (existing)', async () => {
    patchUiSize({ height: 360, width: 640 });
    const pyEnv = await startServer();
    pyEnv["discuss.channel"].create({ name: "Gryffindors" });
    await start();
    await openDiscuss();
    await contains("button.active", { text: "Inbox" });
    await click("button", { text: "Channel" });
    await click("button", { text: "New Channel" });
    await insertText("input[placeholder='Add or join a channel']", "Gryff");
    await click(":nth-child(1 of .o-discuss-ChannelSelector-suggestion)");
    await contains(".o-discuss-ChannelSelector-suggestion", { count: 0 });
    await contains(".o-mail-ChatWindow", { text: "Gryffindors" });
});

QUnit.test('"New channel" item selection opens channel (new)', async () => {
    patchUiSize({ height: 360, width: 640 });
    await start();
    await openDiscuss();
    await contains("button.active", { text: "Inbox" });
    await click("button", { text: "Channel" });
    await click("button", { text: "New Channel" });
    await insertText("input[placeholder='Add or join a channel']", "slytherins");
    await click(".o-discuss-ChannelSelector-suggestion");
    await contains(".o-discuss-ChannelSelector-suggestion", { count: 0 });
    await contains(".o-mail-ChatWindow", { text: "slytherins" });
});

QUnit.test("new message [REQUIRE FOCUS]", async () => {
    await start();
    await click(".o_menu_systray .dropdown-toggle i[aria-label='Messages']");
    await click(".o-mail-MessagingMenu button", { text: "New Message" });
    await contains(".o-mail-ChatWindow .o-discuss-ChannelSelector input:focus");
});

QUnit.test("channel preview ignores empty message", async () => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ name: "Demo" });
    const channelId = pyEnv["discuss.channel"].create({
        name: "General",
    });
    pyEnv["mail.message"].create({
        author_id: partnerId,
        body: "<p>before last</p>",
        model: "discuss.channel",
        res_id: channelId,
    });
    pyEnv["mail.message"].create({
        author_id: partnerId,
        body: "<p></p>",
        model: "discuss.channel",
        res_id: channelId,
    });
    await start();
    await openDiscuss(channelId);
    await contains(".o-mail-Message", { text: "before last" });
    await click(".o_menu_systray .dropdown-toggle:has(i[aria-label='Messages'])");
    await contains(".o-mail-NotificationItem-text", { text: "Demo: before last" });
});

QUnit.test("channel preview ignores transient message", async () => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ name: "Demo" });
    const channelId = pyEnv["discuss.channel"].create({
        name: "General",
    });
    pyEnv["mail.message"].create({
        author_id: partnerId,
        body: "<p>test</p>",
        model: "discuss.channel",
        res_id: channelId,
    });
    await start();
    await openDiscuss(channelId);
    await insertText(".o-mail-Composer-input", "/who");
    await click(".o-mail-Composer-send:enabled");
    await contains(".o_mail_notification", { text: "You are alone in this channel." });
    await click(".o_menu_systray .dropdown-toggle:has(i[aria-label='Messages'])");
    await contains(".o-mail-NotificationItem-text", { text: "Demo: test" });
});

QUnit.test("channel preview ignores messages from the past", async () => {
    // make scroll behavior instantaneous.
    patchWithCleanup(Element.prototype, {
        scrollIntoView() {
            return super.scrollIntoView(true);
        },
    });
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    const messageId = pyEnv["mail.message"].create({
        body: "first message",
        message_type: "comment",
        model: "discuss.channel",
        res_id: channelId,
    });
    for (let i = 0; i < 100; i++) {
        pyEnv["mail.message"].create({
            body: `message ${i}`,
            message_type: "comment",
            model: "discuss.channel",
            res_id: channelId,
        });
    }
    pyEnv["mail.message"].create({
        body: "last message",
        message_type: "comment",
        model: "discuss.channel",
        parent_id: messageId,
        res_id: channelId,
    });
    await start();
    await openDiscuss(channelId);
    await contains(".o-mail-Message", { count: 30 });
    await contains(".o-mail-Message-content", { text: "last message" });
    await contains(".o-mail-Thread", { scroll: "bottom" });
    await click(".o-mail-MessageInReply-content", { text: "first message" });
    await contains(".o-mail-Message", { count: 16 });
    await contains(".o-mail-Message-content", { text: "first message" });
    await contains(".o-mail-Message-content", { text: "last message", count: 0 });
    await click(".o_menu_systray .dropdown-toggle:has(i[aria-label='Messages'])");
    await contains(".o-mail-NotificationItem-text", { text: "You: last message" });
    pyEnv.withUser(pyEnv.currentUserId, () =>
        rpc("/mail/message/post", {
            post_data: { body: "new message", message_type: "comment" },
            thread_id: channelId,
            thread_model: "discuss.channel",
        })
    );
    await contains(".o-mail-NotificationItem-text", { text: "You: new message" });
});

QUnit.test("counter is taking into account non-fetched channels", async (assert) => {
    patchBrowserNotification("denied");
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ name: "Jane" });
    const channelId = pyEnv["discuss.channel"].create({
        name: "General",
        channel_member_ids: [
            Command.create({
                fold_state: "closed", // minimized channels are fetched at init
                message_unread_counter: 1,
                partner_id: pyEnv.currentPartnerId,
            }),
            Command.create({ partner_id: partnerId }),
        ],
    });
    pyEnv["mail.message"].create({
        author_id: partnerId,
        body: "first message",
        message_type: "comment",
        model: "discuss.channel",
        res_id: channelId,
    });
    const { env } = await start();
    await contains(".o-mail-MessagingMenu-counter", { text: "1" });
    assert.notOk(
        env.services["mail.store"].Thread.get({ model: "discuss.channel", id: channelId })
    );
});

QUnit.test("counter is updated on receiving message on non-fetched channels", async (assert) => {
    patchBrowserNotification("denied");
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ name: "Jane" });
    const userId = pyEnv["res.users"].create({ partner_id: partnerId });
    const channelId = pyEnv["discuss.channel"].create({
        name: "General",
        channel_member_ids: [
            Command.create({
                fold_state: "closed", // minimized channels are fetched at init
                partner_id: pyEnv.currentPartnerId,
            }),
            Command.create({ partner_id: partnerId }),
        ],
    });
    pyEnv["mail.message"].create({
        author_id: partnerId,
        body: "first message",
        message_type: "comment",
        model: "discuss.channel",
        res_id: channelId,
    });
    const { env } = await start();
    await contains(".o_menu_systray .dropdown-toggle i[aria-label='Messages']");
    await contains(".o-mail-MessagingMenu-counter", { count: 0 });
    assert.notOk(
        env.services["mail.store"].Thread.get({ model: "discuss.channel", id: channelId })
    );
    pyEnv.withUser(userId, () =>
        rpc("/mail/message/post", {
            post_data: { body: "new message", message_type: "comment" },
            thread_id: channelId,
            thread_model: "discuss.channel",
        })
    );
    await contains(".o-mail-MessagingMenu-counter", { text: "1" });
});
