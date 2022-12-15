/** @odoo-module **/

import { loadEmoji } from "@mail/new/composer/emoji_picker";
import { Thread } from "@mail/new/core/thread_model";
import { Discuss } from "@mail/new/discuss/discuss";
import { startServer, start } from "@mail/../tests/helpers/test_utils";

import { deserializeDateTime } from "@web/core/l10n/dates";

const { DateTime } = luxon;

import {
    click,
    editInput,
    getFixture,
    mount,
    nextTick,
    patchWithCleanup,
    triggerEvent,
    triggerHotkey,
} from "@web/../tests/helpers/utils";
import { makeTestEnv, TestServer } from "../helpers/helpers";

import { registry } from "@web/core/registry";

let target;

QUnit.module("message", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test("Start edition on click edit", async (assert) => {
    const server = new TestServer();
    server.addChannel(1, "general", "General announcements...");
    server.addMessage("comment", 1, 1, "mail.channel", 3, "Hello world");
    const env = makeTestEnv((route, params) => server.rpc(route, params));
    await env.services["mail.messaging"].isReady;
    env.services["mail.messaging"].setDiscussThread(
        Thread.createLocalId({ model: "mail.channel", id: 1 })
    );
    await mount(Discuss, target, { env });
    target.querySelector(".o-mail-message-actions").classList.remove("invisible");
    await click(target, "i[aria-label='Edit']");

    assert.containsOnce(target, ".o-mail-message-editable-content .o-mail-composer");
    assert.strictEqual(
        target.querySelector(".o-mail-message-editable-content .o-mail-composer-textarea").value,
        "Hello world"
    );
});

QUnit.test("Stop edition on click cancel", async (assert) => {
    const server = new TestServer();
    server.addChannel(1, "general", "General announcements...");
    server.addMessage("comment", 1, 1, "mail.channel", 3, "Hello world");
    const env = makeTestEnv((route, params) => server.rpc(route, params));
    await env.services["mail.messaging"].isReady;
    env.services["mail.messaging"].setDiscussThread(
        Thread.createLocalId({ model: "mail.channel", id: 1 })
    );
    await mount(Discuss, target, { env });
    target.querySelector(".o-mail-message-actions").classList.remove("invisible");
    await click(target, "i[aria-label='Edit']");

    await click($("a:contains('cancel')")[0]);
    assert.containsNone(target, ".o-mail-message-editable-content .o-mail-composer");
});

QUnit.test("Stop edition on press escape", async (assert) => {
    const server = new TestServer();
    server.addChannel(1, "general", "General announcements...");
    server.addMessage("comment", 1, 1, "mail.channel", 3, "Hello world");
    const env = makeTestEnv((route, params) => server.rpc(route, params));
    await env.services["mail.messaging"].isReady;
    env.services["mail.messaging"].setDiscussThread(
        Thread.createLocalId({ model: "mail.channel", id: 1 })
    );
    await mount(Discuss, target, { env });
    target.querySelector(".o-mail-message-actions").classList.remove("invisible");
    await click(target, "i[aria-label='Edit']");

    await triggerHotkey("Escape", false);
    await nextTick();
    assert.containsNone(target, ".o-mail-message-editable-content .o-mail-composer");
});

QUnit.test("Stop edition on click save", async (assert) => {
    const server = new TestServer();
    server.addChannel(1, "general", "General announcements...");
    server.addMessage("comment", 1, 1, "mail.channel", 3, "Hello world");
    const env = makeTestEnv((route, params) => server.rpc(route, params));
    await env.services["mail.messaging"].isReady;
    env.services["mail.messaging"].setDiscussThread(
        Thread.createLocalId({ model: "mail.channel", id: 1 })
    );
    await mount(Discuss, target, { env });
    target.querySelector(".o-mail-message-actions").classList.remove("invisible");
    await click(target, "i[aria-label='Edit']");

    await click($("a:contains('save')")[0]);
    assert.containsNone(target, ".o-mail-message-editable-content .o-mail-composer");
});

QUnit.test("Stop edition on press enter", async (assert) => {
    const server = new TestServer();
    server.addChannel(1, "general", "General announcements...");
    server.addMessage("comment", 1, 1, "mail.channel", 3, "Hello world");
    const env = makeTestEnv((route, params) => server.rpc(route, params));
    await env.services["mail.messaging"].isReady;
    env.services["mail.messaging"].setDiscussThread(
        Thread.createLocalId({ model: "mail.channel", id: 1 })
    );
    await mount(Discuss, target, { env });
    target.querySelector(".o-mail-message-actions").classList.remove("invisible");
    await click(target, "i[aria-label='Edit']");

    await triggerHotkey("Enter", false);
    await nextTick();
    assert.containsNone(target, ".o-mail-message-editable-content .o-mail-composer");
});

QUnit.test("Stop edition on click away", async (assert) => {
    const server = new TestServer();
    server.addChannel(1, "general", "General announcements...");
    server.addMessage("comment", 1, 1, "mail.channel", 3, "Hello world");
    const env = makeTestEnv((route, params) => server.rpc(route, params));
    await env.services["mail.messaging"].isReady;
    env.services["mail.messaging"].setDiscussThread(
        Thread.createLocalId({ model: "mail.channel", id: 1 })
    );
    await mount(Discuss, target, { env });
    target.querySelector(".o-mail-message-actions").classList.remove("invisible");
    await click(target, "i[aria-label='Edit']");

    await triggerEvent(target, ".o-mail-discuss-sidebar", "click");
    await nextTick();
    assert.containsNone(target, ".o-mail-message-editable-content .o-mail-composer");
});

QUnit.test("Do not stop edition on click away when clicking on emoji", async (assert) => {
    const server = new TestServer();
    server.addChannel(1, "general", "General announcements...");
    server.addMessage("comment", 1, 1, "mail.channel", 3, "Hello world");
    const env = makeTestEnv((route, params) => server.rpc(route, params));
    await env.services["mail.messaging"].isReady;
    env.services["mail.messaging"].setDiscussThread(
        Thread.createLocalId({ model: "mail.channel", id: 1 })
    );
    const { Component: PopoverContainer, props } = registry
        .category("main_components")
        .get("PopoverContainer");
    await mount(PopoverContainer, target, { env, props });
    await mount(Discuss, target, { env });
    target.querySelector(".o-mail-message-actions").classList.remove("invisible");
    await click(target, "i[aria-label='Edit']");

    await click(target.querySelector("i[aria-label='Emojis']").closest("button"));
    await loadEmoji(); // wait for emoji being loaded (required for rendering)
    await nextTick(); // wait for following rendering
    await click(target.querySelector(".o-mail-emoji-picker-content .o-emoji"));
    assert.containsOnce(target, ".o-mail-message-editable-content .o-mail-composer");
});

QUnit.test("Save on click", async (assert) => {
    const server = new TestServer();
    server.addChannel(1, "general", "General announcements...");
    server.addMessage("comment", 1, 1, "mail.channel", 3, "Hello world");
    const env = makeTestEnv((route, params) => server.rpc(route, params));
    await env.services["mail.messaging"].isReady;
    env.services["mail.messaging"].setDiscussThread(
        Thread.createLocalId({ model: "mail.channel", id: 1 })
    );
    await mount(Discuss, target, { env });
    target.querySelector(".o-mail-message-actions").classList.remove("invisible");
    await click(target, "i[aria-label='Edit']");

    await editInput(target, ".o-mail-message textarea", "Goodbye World");
    await click($("a:contains('save')")[0]);
    assert.strictEqual(document.querySelector(".o-mail-message-body").innerText, "Goodbye World");
});

QUnit.test("Do not call server on save if no changes", async (assert) => {
    const server = new TestServer();
    server.addChannel(1, "general", "General announcements...");
    server.addMessage("comment", 1, 1, "mail.channel", 3, "Hello world\nGoodbye world");
    const env = makeTestEnv((route, params) => {
        if (route === "/mail/message/update_content") {
            assert.step("update_content");
        }
        return server.rpc(route, params);
    });
    await env.services["mail.messaging"].isReady;
    env.services["mail.messaging"].setDiscussThread(
        Thread.createLocalId({ model: "mail.channel", id: 1 })
    );
    await mount(Discuss, target, { env });
    target.querySelector(".o-mail-message-actions").classList.remove("invisible");
    await click(target, "i[aria-label='Edit']");

    await click($("a:contains('save')")[0]);
    await nextTick();
    assert.verifySteps([]);
});

QUnit.test("Scroll bar to the top when edit starts", async (assert) => {
    const server = new TestServer();
    server.addChannel(1, "general", "General announcements...");
    server.addMessage("comment", 1, 1, "mail.channel", 3, "Hello world ! ".repeat(1000));
    const env = makeTestEnv((route, params) => server.rpc(route, params));
    await env.services["mail.messaging"].isReady;
    env.services["mail.messaging"].setDiscussThread(
        Thread.createLocalId({ model: "mail.channel", id: 1 })
    );
    await mount(Discuss, target, { env });
    target.querySelector(".o-mail-message-actions").classList.remove("invisible");
    await click(target, "i[aria-label='Edit']");

    const messageTextarea = document.querySelector(
        ".o-mail-message-editable-content .o-mail-composer-textarea"
    );
    assert.ok(
        messageTextarea.scrollHeight > messageTextarea.clientHeight,
        "Composer textarea has a vertical scroll bar"
    );
    assert.strictEqual(
        messageTextarea.scrollTop,
        0,
        "Composer text area is scrolled to the top when edit starts"
    );
});

QUnit.test("Other messages are grayed out when replying to another one", async function (assert) {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({
        channel_type: "channel",
        name: "channel1",
    });
    const [firstMessageId, secondMessageId] = pyEnv["mail.message"].create([
        { body: "Hello world", res_id: channelId, model: "mail.channel" },
        { body: "Goodbye world", res_id: channelId, model: "mail.channel" },
    ]);
    const { click, openDiscuss } = await start({
        discuss: {
            context: {
                active_id: `mail.channel_${channelId}`,
            },
        },
    });
    await openDiscuss();
    assert.containsN(target, ".o-mail-message", 2);
    await click(`.o-mail-message[data-message-id='${firstMessageId}'] i[aria-label='Reply']`);
    assert.doesNotHaveClass(
        document.querySelector(`.o-mail-message[data-message-id='${firstMessageId}']`),
        "opacity-50",
        "First message should not be grayed out"
    );
    assert.hasClass(
        document.querySelector(`.o-mail-message[data-message-id='${secondMessageId}']`),
        "opacity-50",
        "Second message should be grayed out"
    );
});

QUnit.test("Parent message body is displayed on replies", async function (assert) {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({
        channel_type: "channel",
        name: "channel1",
    });
    pyEnv["mail.message"].create({
        body: "Hello world",
        res_id: channelId,
        model: "mail.channel",
    });
    const { click, openDiscuss } = await start({
        discuss: {
            context: {
                active_id: `mail.channel_${channelId}`,
            },
        },
    });
    await openDiscuss();

    await click(".o-mail-message i[aria-label='Reply']");
    await editInput(target, ".o-mail-composer textarea", "FooBarFoo");
    await click(".o-mail-composer-send-button");
    assert.containsOnce(target, ".o-mail-message-in-reply-body");
    assert.ok(document.querySelector(".o-mail-message-in-reply-body").innerText, "Hello world");
});

QUnit.test(
    "Updating the parent message of a reply also updates the visual of the reply",
    async function (assert) {
        const pyEnv = await startServer();
        const channelId = pyEnv["mail.channel"].create({
            channel_type: "channel",
            name: "channel1",
        });
        pyEnv["mail.message"].create({
            body: "Hello world",
            res_id: channelId,
            message_type: "comment",
            model: "mail.channel",
        });
        const { click, openDiscuss } = await start({
            discuss: {
                context: {
                    active_id: `mail.channel_${channelId}`,
                },
            },
        });
        await openDiscuss();

        await click("i[aria-label='Reply']");
        await editInput(target, ".o-mail-composer textarea", "FooBarFoo");
        await triggerHotkey("Enter", false);
        await click("i[aria-label='Edit']");
        await editInput(target, ".o-mail-message textarea", "Goodbye World");
        await triggerHotkey("Enter", false);
        await nextTick();
        assert.strictEqual(
            document.querySelector(".o-mail-message-in-reply-body").innerText,
            "Goodbye World"
        );
    }
);

QUnit.test("Deleting parent message of a reply should adapt reply visual", async function (assert) {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({
        channel_type: "channel",
        name: "channel1",
    });
    pyEnv["mail.message"].create({
        body: "Hello world",
        res_id: channelId,
        message_type: "comment",
        model: "mail.channel",
    });
    const { click, openDiscuss } = await start({
        discuss: {
            context: {
                active_id: `mail.channel_${channelId}`,
            },
        },
    });
    await openDiscuss();

    await click("i[aria-label='Reply']");
    await editInput(target, ".o-mail-composer textarea", "FooBarFoo");
    await triggerHotkey("Enter", false);
    await click("i[aria-label='Delete']");
    $('button:contains("Delete")').click();
    await nextTick();
    assert.strictEqual(
        document.querySelector(".o-mail-message-in-reply-deleted-message").innerText,
        "Original message was deleted"
    );
});

QUnit.test("Can open emoji picker after edit mode", async (assert) => {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({
        channel_type: "channel",
        name: "channel1",
    });
    pyEnv["mail.message"].create({
        body: "Hello world",
        res_id: channelId,
        message_type: "comment",
        model: "mail.channel",
    });
    const { click, openDiscuss } = await start({
        discuss: {
            context: {
                active_id: `mail.channel_${channelId}`,
            },
        },
    });
    await openDiscuss();
    await click("i[aria-label='Edit']");
    await triggerEvent(target, ".o-mail-discuss-sidebar", "click");
    await click("i[aria-label='Add a Reaction']");
    assert.containsOnce(target, ".o-mail-emoji-picker");
});

QUnit.test("Can add a reaction", async (assert) => {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({
        channel_type: "channel",
        name: "channel1",
    });
    pyEnv["mail.message"].create({
        body: "Hello world",
        res_id: channelId,
        message_type: "comment",
        model: "mail.channel",
    });
    const { click, openDiscuss } = await start({
        discuss: {
            context: {
                active_id: `mail.channel_${channelId}`,
            },
        },
    });
    await openDiscuss();
    await click("i[aria-label='Add a Reaction']");
    await click(".o-emoji[data-codepoints='😅']");
    assert.containsOnce(target, ".o-mail-message-reaction:contains('😅')");
});

QUnit.test("Can remove a reaction", async (assert) => {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({
        channel_type: "channel",
        name: "channel1",
    });
    pyEnv["mail.message"].create({
        body: "Hello world",
        res_id: channelId,
        message_type: "comment",
        model: "mail.channel",
    });
    const { click, openDiscuss } = await start({
        discuss: {
            context: {
                active_id: `mail.channel_${channelId}`,
            },
        },
    });
    await openDiscuss();
    await click("i[aria-label='Add a Reaction']");
    await click(".o-emoji[data-codepoints='😅']");
    await click(".o-mail-message-reaction");
    assert.containsNone(target, ".o-mail-message-reaction:contains('😅')");
});

QUnit.test("Two users reacting with the same emoji", async (assert) => {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({
        channel_type: "channel",
        name: "channel1",
    });
    pyEnv["mail.message"].create({
        body: "Hello world",
        res_id: channelId,
        message_type: "comment",
        model: "mail.channel",
    });
    const { click, env, openDiscuss } = await start({
        discuss: {
            context: {
                active_id: `mail.channel_${channelId}`,
            },
        },
    });
    await openDiscuss();
    await click("i[aria-label='Add a Reaction']");
    await click(".o-emoji[data-codepoints='😅']");

    pyEnv.currentPartnerId = pyEnv["res.partner"].create({ name: "Jean Pierre" });
    patchWithCleanup(env.services.user, {
        partnerId: pyEnv.currentPartnerId,
    });
    await click("i[aria-label='Add a Reaction']");
    await click(".o-emoji[data-codepoints='😅']");
    assert.containsOnce(target, ".o-mail-message-reaction:contains(2)");

    await click(".o-mail-message-reaction");
    assert.containsOnce(
        target,
        ".o-mail-message-reaction:contains('😅')",
        "Reaction should still be visible after one of the partners deleted its reaction"
    );
    assert.containsOnce(target, ".o-mail-message-reaction:contains(1)");
});

QUnit.test("Reaction summary", async (assert) => {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({
        channel_type: "channel",
        name: "channel1",
    });
    pyEnv["mail.message"].create({
        body: "Hello world",
        res_id: channelId,
        message_type: "comment",
        model: "mail.channel",
    });
    const { click, openDiscuss } = await start({
        discuss: {
            context: {
                active_id: `mail.channel_${channelId}`,
            },
        },
    });
    await openDiscuss();
    const partnerNames = ["Foo", "Bar", "FooBar", "Bob"];
    const expectedSummaries = [
        "Foo has reacted with 😅",
        "Foo and Bar have reacted with 😅",
        "Foo, Bar, FooBar have reacted with 😅",
        "Foo, Bar, FooBar and 1 other person have reacted with 😅",
    ];
    for (const [idx, name] of partnerNames.entries()) {
        const partnerId = pyEnv["res.partner"].create({ name });
        pyEnv.currentPartnerId = partnerId;
        await click("i[aria-label='Add a Reaction']");
        await click(".o-emoji[data-codepoints='😅']");
        assert.hasAttrValue(
            target.querySelector(".o-mail-message-reaction"),
            "title",
            expectedSummaries[idx]
        );
    }
});

QUnit.test("Toggle reaction from the emoji picker", async (assert) => {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({
        channel_type: "channel",
        name: "channel1",
    });
    pyEnv["mail.message"].create({
        body: "Hello world",
        res_id: channelId,
        message_type: "comment",
        model: "mail.channel",
    });
    const { click, openDiscuss } = await start({
        discuss: {
            context: {
                active_id: `mail.channel_${channelId}`,
            },
        },
    });
    await openDiscuss();
    await click("i[aria-label='Add a Reaction']");
    await click(".o-emoji[data-codepoints='😅']");
    await click("i[aria-label='Add a Reaction']");
    await click(".o-emoji[data-codepoints='😅']");
    assert.containsNone(target, ".o-mail-message-reaction:contains('😅')");
});

QUnit.test("basic rendering of message", async function (assert) {
    const pyEnv = await startServer();
    const mailChannelId1 = pyEnv["mail.channel"].create({ name: "general" });
    const resPartnerId1 = pyEnv["res.partner"].create({ name: "Demo" });
    const mailMessageId1 = pyEnv["mail.message"].create({
        author_id: resPartnerId1,
        body: "<p>body</p>",
        date: "2019-04-20 10:00:00",
        model: "mail.channel",
        res_id: mailChannelId1,
    });
    const { openDiscuss } = await start({
        discuss: {
            params: {
                default_active_id: `mail.channel_${mailChannelId1}`,
            },
        },
    });
    await openDiscuss();
    assert.containsOnce(target, `.o-mail-message[data-message-id=${mailMessageId1}]`);
    const $message = $(target).find(`.o-mail-message[data-message-id=${mailMessageId1}]`);
    assert.containsOnce($message, ".o-mail-message-sidebar");
    assert.containsOnce($message, ".o-mail-message-sidebar .o-mail-avatar-container img");
    assert.hasAttrValue(
        $message.find(".o-mail-message-sidebar .o-mail-avatar-container img"),
        "data-src",
        `/mail/channel/${mailChannelId1}/partner/${resPartnerId1}/avatar_128`
    );
    assert.containsOnce($message, ".o-mail-msg-header");
    assert.containsOnce($message, ".o-mail-msg-header .o-mail-own-name:contains(Demo)");
    assert.containsOnce($message, ".o-mail-msg-header .o-mail-message-date");
    assert.hasAttrValue(
        $message.find(".o-mail-msg-header .o-mail-message-date"),
        "title",
        deserializeDateTime("2019-04-20 10:00:00").toLocaleString(DateTime.DATETIME_SHORT)
    );
    assert.containsOnce($message, ".o-mail-message-actions");
    assert.containsN($message, ".o-mail-message-actions i", 3);
    assert.containsOnce($message, ".o-mail-message-actions i[aria-label='Add a Reaction']");
    assert.containsOnce($message, ".o-mail-message-actions i[aria-label='Mark as Todo']");
    assert.containsOnce($message, ".o-mail-message-actions i[aria-label='Reply']");
    assert.containsOnce($message, ".o-mail-message-content");
    assert.strictEqual($message.find(".o-mail-message-content").text(), "body");
});

QUnit.test("should not be able to reply to temporary/transient messages", async function (assert) {
    const pyEnv = await startServer();
    const mailChannelId1 = pyEnv["mail.channel"].create({ name: "general" });
    const { click, insertText, openDiscuss } = await start({
        discuss: {
            params: {
                default_active_id: `mail.channel_${mailChannelId1}`,
            },
        },
    });
    await openDiscuss();
    // these user interactions is to forge a transient message response from channel command "/who"
    await insertText(".o-mail-composer-textarea", "/who");
    await click(".o-mail-composer-send-button");
    assert.containsNone(target, ".o-mail-message .o-mail-message-actions i[aria-label='Reply']");
});

QUnit.test(
    "message comment of same author within 1min. should be squashed",
    async function (assert) {
        // messages are squashed when "close", e.g. less than 1 minute has elapsed
        // from messages of same author and same thread. Note that this should
        // be working in non-mailboxes
        const pyEnv = await startServer();
        const mailChannelId1 = pyEnv["mail.channel"].create({ name: "general" });
        const resPartnerId1 = pyEnv["res.partner"].create({ name: "Demo" });
        const [mailMessageId1, mailMessageId2] = pyEnv["mail.message"].create([
            {
                author_id: resPartnerId1,
                body: "<p>body1</p>",
                date: "2019-04-20 10:00:00",
                message_type: "comment",
                model: "mail.channel",
                res_id: mailChannelId1,
            },
            {
                author_id: resPartnerId1,
                body: "<p>body2</p>",
                date: "2019-04-20 10:00:30",
                message_type: "comment",
                model: "mail.channel",
                res_id: mailChannelId1,
            },
        ]);
        const { openDiscuss } = await start({
            discuss: {
                params: {
                    default_active_id: `mail.channel_${mailChannelId1}`,
                },
            },
        });
        await openDiscuss();
        assert.containsN(target, ".o-mail-message", 2);
        assert.containsOnce(target, `.o-mail-message[data-message-id=${mailMessageId1}]`);
        assert.containsOnce(target, `.o-mail-message[data-message-id=${mailMessageId2}]`);
        const $message1 = $(target).find(`.o-mail-message[data-message-id=${mailMessageId1}]`);
        const $message2 = $(target).find(`.o-mail-message[data-message-id=${mailMessageId2}]`);
        assert.containsOnce($message1, ".o-mail-msg-header");
        assert.containsNone($message2, ".o-mail-msg-header");
        assert.containsNone($message1, ".o-mail-message-sidebar .o-mail-message-date");
        assert.containsOnce($message2, ".o-mail-message-sidebar .o-mail-message-date");
    }
);

QUnit.test("redirect to author (open chat)", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({ name: "Demo" });
    pyEnv["res.users"].create({ partner_id: resPartnerId1 });
    const [mailChannelId1] = pyEnv["mail.channel"].create([
        { name: "General" },
        {
            channel_member_ids: [
                [0, 0, { partner_id: pyEnv.currentPartnerId }],
                [0, 0, { partner_id: resPartnerId1 }],
            ],
            channel_type: "chat",
        },
    ]);
    pyEnv["mail.message"].create({
        author_id: resPartnerId1,
        body: "not empty",
        model: "mail.channel",
        res_id: mailChannelId1,
    });
    const { click, openDiscuss } = await start({
        discuss: {
            params: {
                default_active_id: `mail.channel_${mailChannelId1}`,
            },
        },
    });
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-category-item.o-active:contains(General)");
    assert.containsOnce(
        target,
        ".o-mail-discuss-content .o-mail-message .o-mail-avatar-container img"
    );

    await click(".o-mail-discuss-content .o-mail-message .o-mail-avatar-container img");
    assert.containsOnce(target, ".o-mail-category-item.o-active:contains(Demo)");
});

QUnit.test("toggle_star message", async function (assert) {
    const pyEnv = await startServer();
    const mailChannelId1 = pyEnv["mail.channel"].create({ name: "general" });
    const mailMessageId1 = pyEnv["mail.message"].create({
        body: "not empty",
        model: "mail.channel",
        res_id: mailChannelId1,
    });
    const { click, openDiscuss } = await start({
        discuss: {
            params: {
                default_active_id: `mail.channel_${mailChannelId1}`,
            },
        },
        async mockRPC(route, args) {
            if (args.method === "toggle_message_starred") {
                assert.step("rpc:toggle_message_starred");
                assert.strictEqual(
                    args.args[0][0],
                    mailMessageId1,
                    "should have message Id in args"
                );
            }
        },
    });
    await openDiscuss();
    assert.containsNone(target, 'button[data-mailbox="starred"] .badge');
    assert.containsOnce(target, ".o-mail-message");
    let $message = $(target).find(".o-mail-message");
    assert.hasClass($message.find(".o-mail-message-action-toggle-star"), "fa-star-o");
    assert.containsOnce($message, ".o-mail-message-action-toggle-star");

    await click(".o-mail-message-action-toggle-star");
    assert.verifySteps(["rpc:toggle_message_starred"]);
    assert.strictEqual($(target).find('button[data-mailbox="starred"] .badge').text(), "1");
    assert.containsOnce(target, ".o-mail-message");
    $message = $(target).find(".o-mail-message");
    assert.hasClass($message.find(".o-mail-message-action-toggle-star"), "fa-star");

    await click(".o-mail-message-action-toggle-star");
    assert.verifySteps(["rpc:toggle_message_starred"]);
    assert.containsNone(target, 'button[data-mailbox="starred"] .badge');
    assert.containsOnce(target, ".o-mail-message");
    $message = $(target).find(".o-mail-message");
    assert.hasClass($message.find(".o-mail-message-action-toggle-star"), "fa-star-o");
});
