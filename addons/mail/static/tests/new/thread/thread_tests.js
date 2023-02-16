/** @odoo-module **/

import { config as transitionConfig } from "@web/core/transition";
import {
    afterNextRender,
    click,
    dragenterFiles,
    insertText,
    isScrolledTo,
    isScrolledToBottom,
    nextAnimationFrame,
    start,
    startServer,
} from "@mail/../tests/helpers/test_utils";
import { makeDeferred } from "@mail/utils/deferred";

import { getFixture, nextTick, patchWithCleanup } from "@web/../tests/helpers/utils";

let target;

QUnit.module("thread", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test("dragover files on thread with composer", async function (assert) {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({
        channel_type: "channel",
        group_public_id: false,
        name: "General",
    });
    const { openDiscuss } = await start();
    await openDiscuss(channelId);
    await afterNextRender(() => dragenterFiles(target.querySelector(".o-mail-thread")));
    assert.containsOnce(target, ".o-dropzone");
});

QUnit.test("load more messages from channel (auto-load on scroll)", async function (assert) {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({
        channel_type: "channel",
        group_public_id: false,
        name: "General",
    });
    for (let i = 0; i <= 60; i++) {
        pyEnv["mail.message"].create({
            body: "not empty",
            model: "mail.channel",
            res_id: channelId,
        });
    }
    const { openDiscuss } = await start();
    await openDiscuss(channelId);
    assert.containsN(target, "button:contains(Load More) ~ .o-mail-message", 30);

    await afterNextRender(() => (target.querySelector(".o-mail-thread").scrollTop = 0));
    assert.containsN(target, ".o-mail-message", 60);
});

QUnit.test(
    "show message subject when subject is not the same as the thread name",
    async function (assert) {
        const pyEnv = await startServer();
        const channelId = pyEnv["mail.channel"].create({
            channel_type: "channel",
            group_public_id: false,
            name: "General",
        });
        pyEnv["mail.message"].create({
            body: "not empty",
            model: "mail.channel",
            res_id: channelId,
            subject: "Salutations, voyageur",
        });
        const { openDiscuss } = await start();
        await openDiscuss(channelId);
        assert.containsOnce(target, ".o-mail-message");
        assert.containsOnce(target, ".o-mail-message-subject");
        assert.strictEqual(
            target.querySelector(".o-mail-message-subject").textContent,
            "Subject: Salutations, voyageur"
        );
    }
);

QUnit.test(
    "do not show message subject when subject is the same as the thread name",
    async function (assert) {
        const pyEnv = await startServer();
        const channelId = pyEnv["mail.channel"].create({
            channel_type: "channel",
            group_public_id: false,
            name: "Salutations, voyageur",
        });
        pyEnv["mail.message"].create({
            body: "not empty",
            model: "mail.channel",
            res_id: channelId,
            subject: "Salutations, voyageur",
        });
        const { openDiscuss } = await start();
        await openDiscuss(channelId);
        assert.containsNone(target, ".o-mail-message-subject");
    }
);

QUnit.test("auto-scroll to bottom of thread on load", async function (assert) {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({ name: "general" });
    for (let i = 1; i <= 25; i++) {
        pyEnv["mail.message"].create({
            body: "not empty",
            model: "mail.channel",
            res_id: channelId,
        });
    }
    const { openDiscuss } = await start();
    await openDiscuss(channelId);
    assert.containsN(target, ".o-mail-message", 25);
    const $thread = $(target).find(".o-mail-thread");
    assert.ok(isScrolledToBottom($thread[0]));
});

QUnit.test("display day separator before first message of the day", async function (assert) {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({ name: "" });
    pyEnv["mail.message"].create([
        {
            body: "not empty",
            model: "mail.channel",
            res_id: channelId,
        },
        {
            body: "not empty",
            model: "mail.channel",
            res_id: channelId,
        },
    ]);
    const { openDiscuss } = await start();
    await openDiscuss(channelId);
    assert.containsOnce(target, ".o-mail-thread-date");
});

QUnit.test(
    "do not display day separator if all messages of the day are empty",
    async function (assert) {
        const pyEnv = await startServer();
        const channelId = pyEnv["mail.channel"].create({ name: "" });
        pyEnv["mail.message"].create({
            body: "",
            model: "mail.channel",
            res_id: channelId,
        });
        const { openDiscuss } = await start();
        await openDiscuss(channelId);
        assert.containsNone(target, ".o-mail-thread-date");
    }
);

QUnit.test(
    "scroll position is kept when navigating from one channel to another",
    async function (assert) {
        const pyEnv = await startServer();
        const channelId_1 = pyEnv["mail.channel"].create({ name: "channel-1" });
        const channelId_2 = pyEnv["mail.channel"].create({ name: "channel-2" });
        // Fill both channels with random messages in order for the scrollbar to
        // appear.
        pyEnv["mail.message"].create(
            Array(40)
                .fill(0)
                .map((_, index) => ({
                    body: "Non Empty Body ".repeat(25),
                    message_type: "comment",
                    model: "mail.channel",
                    res_id: index & 1 ? channelId_1 : channelId_2,
                }))
        );
        const { openDiscuss } = await start();
        await openDiscuss(channelId_1);
        const scrolltop_1 = target.querySelector(".o-mail-thread").scrollHeight / 2;
        target.querySelector(".o-mail-thread").scrollTo({ top: scrolltop_1 });
        await click(".o-mail-category-item:contains(channel-2)");
        const scrolltop_2 = target.querySelector(".o-mail-thread").scrollHeight / 3;
        target.querySelector(".o-mail-thread").scrollTo({ top: scrolltop_2 });
        await click(".o-mail-category-item:contains(channel-1)");
        assert.ok(isScrolledTo(target.querySelector(".o-mail-thread"), scrolltop_1));

        await click(".o-mail-category-item:contains(channel-2)");
        assert.ok(isScrolledTo(target.querySelector(".o-mail-thread"), scrolltop_2));
    }
);

QUnit.test("thread is still scrolling after scrolling up then to bottom", async function (assert) {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({ name: "channel-1" });
    pyEnv["mail.message"].create(
        Array(20)
            .fill(0)
            .map(() => ({
                body: "Non Empty Body ".repeat(25),
                message_type: "comment",
                model: "mail.channel",
                res_id: channelId,
            }))
    );
    const { openDiscuss } = await start();
    await openDiscuss(channelId);
    const thread = target.querySelector(".o-mail-thread");
    thread.scrollTo({ top: thread.scrollHeight / 2 });
    thread.scrollTo({ top: thread.scrollHeight });
    await insertText(".o-mail-composer-textarea", "123");
    await click(".o-mail-composer-send-button");
    assert.ok(isScrolledToBottom(thread));
});

QUnit.test("mention a channel with space in the name", async function (assert) {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({ name: "General good boy" });
    const { openDiscuss } = await start();
    await openDiscuss(channelId);
    await insertText(".o-mail-composer-textarea", "#");
    await click(".o-composer-suggestion");
    await click(".o-mail-composer-send-button");
    assert.containsOnce(document.querySelector(".o-mail-message-body"), ".o_channel_redirect");
    assert.strictEqual(
        document.querySelector(".o_channel_redirect").textContent,
        "#General good boy"
    );
});

QUnit.test('mention a channel with "&" in the name', async function (assert) {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({ name: "General & good" });
    const { openDiscuss } = await start();
    await openDiscuss(channelId);
    await insertText(".o-mail-composer-textarea", "#");
    await click(".o-composer-suggestion");
    await click(".o-mail-composer-send-button");
    assert.containsOnce(document.querySelector(".o-mail-message-body"), ".o_channel_redirect");
    assert.strictEqual(
        document.querySelector(".o_channel_redirect").textContent,
        "#General & good"
    );
});

QUnit.test(
    "mark channel as fetched when a new message is loaded and as seen when focusing composer [REQUIRE FOCUS]",
    async function (assert) {
        const pyEnv = await startServer();
        const partnerId = pyEnv["res.partner"].create({
            email: "fred@example.com",
            name: "Fred",
        });
        const userId = pyEnv["res.users"].create({ partner_id: partnerId });
        const channelId = pyEnv["mail.channel"].create({
            name: "test",
            uuid: "uuid-uuid",
            channel_member_ids: [
                [0, 0, { partner_id: pyEnv.currentPartnerId }],
                [0, 0, { partner_id: partnerId }],
            ],
            channel_type: "chat",
        });
        const { env } = await start({
            mockRPC(route, args) {
                if (args.method === "channel_fetched") {
                    assert.strictEqual(args.args[0][0], channelId);
                    assert.strictEqual(args.model, "mail.channel");
                    assert.step("rpc:channel_fetch");
                } else if (route === "/mail/channel/set_last_seen_message") {
                    assert.strictEqual(args.channel_id, channelId);
                    assert.step("rpc:set_last_seen_message");
                }
            },
        });
        await click(".o_menu_systray i[aria-label='Messages']");
        await afterNextRender(async () =>
            env.services.rpc("/mail/chat_post", {
                context: { mockedUserId: userId },
                message_content: "new message",
                uuid: "uuid-uuid",
            })
        );
        assert.verifySteps(["rpc:channel_fetch"]);

        document.querySelector(".o-mail-composer-textarea").focus();
        assert.verifySteps(["rpc:set_last_seen_message"]);
    }
);

QUnit.test(
    "mark channel as fetched and seen when a new message is loaded if composer is focused [REQUIRE FOCUS]",
    async function (assert) {
        const pyEnv = await startServer();
        const partnerId = pyEnv["res.partner"].create({});
        const userId = pyEnv["res.users"].create({ partner_id: partnerId });
        const channelId = pyEnv["mail.channel"].create({
            name: "test",
            uuid: "uuid-uuid",
        });
        const deferred = makeDeferred();
        const { env, openDiscuss } = await start({
            async mockRPC(route, args) {
                if (args.method === "channel_fetched" && args.args[0] === channelId) {
                    throw new Error(
                        "'channel_fetched' RPC must not be called for created channel as message is directly seen"
                    );
                } else if (route === "/mail/channel/set_last_seen_message") {
                    assert.strictEqual(args.channel_id, channelId);
                    assert.step("rpc:set_last_seen_message");
                    await deferred;
                }
            },
        });
        await openDiscuss(channelId);
        document.querySelector(".o-mail-composer-textarea").focus();
        // simulate receiving a message
        await env.services.rpc("/mail/chat_post", {
            context: { mockedUserId: userId },
            message_content: "<p>Some new message</p>",
            uuid: "uuid-uuid",
        });
        await afterNextRender(() => deferred.resolve());
        assert.verifySteps(["rpc:set_last_seen_message"]);
    }
);

QUnit.test(
    "should scroll to bottom on receiving new message if the list is initially scrolled to bottom (asc order)",
    async function (assert) {
        const pyEnv = await startServer();
        const partnerId = pyEnv["res.partner"].create({ name: "Foreigner partner" });
        const userId = pyEnv["res.users"].create({ name: "Foreigner user", partner_id: partnerId });
        const channelId = pyEnv["mail.channel"].create({ uuid: "channel-uuid" });
        for (let i = 0; i <= 10; i++) {
            pyEnv["mail.message"].create({
                body: "not empty",
                model: "mail.channel",
                res_id: channelId,
            });
        }
        const { env } = await start();
        await click(".o_menu_systray i[aria-label='Messages']");
        await click(".o-mail-notification-item");
        assert.ok(isScrolledToBottom($(".o-mail-thread")[0]));

        // simulate receiving a message
        await afterNextRender(() =>
            env.services.rpc("/mail/chat_post", {
                context: { mockedUserId: userId },
                message_content: "hello",
                uuid: "channel-uuid",
            })
        );
        assert.ok(isScrolledToBottom($(".o-mail-thread")[0]));
    }
);

QUnit.test(
    "should not scroll on receiving new message if the list is initially scrolled anywhere else than bottom (asc order)",
    async function (assert) {
        const pyEnv = await startServer();
        const partnerId = pyEnv["res.partner"].create({ name: "Foreigner partner" });
        const userId = pyEnv["res.users"].create({ name: "Foreigner user", partner_id: partnerId });
        const channelId = pyEnv["mail.channel"].create({ uuid: "channel-uuid" });
        for (let i = 0; i <= 10; i++) {
            pyEnv["mail.message"].create({
                body: "not empty",
                model: "mail.channel",
                res_id: channelId,
            });
        }
        const { env } = await start();
        await click(".o_menu_systray i[aria-label='Messages']");
        await click(".o-mail-notification-item");
        assert.ok(isScrolledToBottom($(".o-mail-thread")[0]));

        $(".o-mail-thread").scrollTop(0);
        await nextAnimationFrame();
        assert.strictEqual($(".o-mail-thread")[0].scrollTop, 0);

        // simulate receiving a message
        await afterNextRender(() =>
            env.services.rpc("/mail/chat_post", {
                context: { mockedUserId: userId },
                message_content: "hello",
                uuid: "channel-uuid",
            })
        );
        assert.strictEqual($(".o-mail-thread")[0].scrollTop, 0);
    }
);

QUnit.test("show empty placeholder when thread contains no message", async function (assert) {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({ name: "general" });
    const { openDiscuss } = await start();
    await openDiscuss(channelId);
    assert.containsOnce(
        target,
        ".o-mail-thread:contains(There are no messages in this conversation.)"
    );
    assert.containsNone(target, ".o-mail-message");
});

QUnit.test(
    "show empty placeholder when thread contains only empty messages",
    async function (assert) {
        const pyEnv = await startServer();
        const channelId = pyEnv["mail.channel"].create({ name: "General" });
        pyEnv["mail.message"].create({ model: "mail.channel", res_id: channelId });
        const { openDiscuss } = await start();
        await openDiscuss(channelId);
        assert.containsOnce(
            target,
            ".o-mail-thread:contains(There are no messages in this conversation.)"
        );
        assert.containsNone(target, ".o-mail-message");
    }
);

QUnit.test(
    "message list with a full page of empty messages should load more messages until there are some non-empty",
    async function (assert) {
        // Technical assumptions :
        // - /mail/channel/messages fetching exactly 30 messages,
        // - empty messages not being displayed
        // - auto-load more being triggered on scroll, not automatically when the 30 first messages are empty
        const pyEnv = await startServer();
        const channelId = pyEnv["mail.channel"].create({ name: "General" });
        for (let i = 0; i < 50; i++) {
            pyEnv["mail.message"].create({
                body: "not empty",
                model: "mail.channel",
                res_id: channelId,
            });
        }
        for (let i = 0; i < 50; i++) {
            pyEnv["mail.message"].create({ model: "mail.channel", res_id: channelId });
        }
        const { openDiscuss } = await start();
        await openDiscuss(channelId);
        // initial load: +30 empty ; (auto) load more: +20 empty +10 non-empty
        assert.containsN(target, ".o-mail-message", 10);
        assert.containsOnce(target, "button:contains(Load More)"); // still 40 non-empty
    }
);

QUnit.test(
    "no new messages separator on posting message (some message history)",
    async function (assert) {
        const pyEnv = await startServer();
        const channelId = pyEnv["mail.channel"].create({
            channel_member_ids: [
                [0, 0, { message_unread_counter: 0, partner_id: pyEnv.currentPartnerId }],
            ],
            channel_type: "channel",
            name: "General",
        });
        const messageId = pyEnv["mail.message"].create({
            body: "first message",
            model: "mail.channel",
            res_id: channelId,
        });
        const [memberId] = pyEnv["mail.channel.member"].search([
            ["channel_id", "=", channelId],
            ["partner_id", "=", pyEnv.currentPartnerId],
        ]);
        pyEnv["mail.channel.member"].write([memberId], { seen_message_id: messageId });
        const { openDiscuss } = await start();
        await openDiscuss(channelId);
        assert.containsOnce(target, ".o-mail-message");
        assert.containsNone(target, "hr + span:contains(New messages)");

        await insertText(".o-mail-composer-textarea", "hey!");
        await afterNextRender(() => {
            // need to remove focus from text area to avoid set_last_seen_message
            target.querySelector(".o-mail-composer-send-button").focus();
            target.querySelector(".o-mail-composer-send-button").click();
        });
        assert.containsN(target, ".o-mail-message", 2);
        assert.containsNone(target, "hr + span:contains(New messages)");
    }
);

QUnit.test(
    "new messages separator on receiving new message [REQUIRE FOCUS]",
    async function (assert) {
        patchWithCleanup(transitionConfig, { disabled: true });
        const pyEnv = await startServer();
        const partnerId = pyEnv["res.partner"].create({ name: "Foreigner partner" });
        const userId = pyEnv["res.users"].create({
            name: "Foreigner user",
            partner_id: partnerId,
        });
        const channelId = pyEnv["mail.channel"].create({
            channel_member_ids: [
                [0, 0, { message_unread_counter: 0, partner_id: pyEnv.currentPartnerId }],
            ],
            channel_type: "channel",
            name: "General",
            uuid: "randomuuid",
        });
        const messageId = pyEnv["mail.message"].create({
            body: "blah",
            model: "mail.channel",
            res_id: channelId,
        });
        const [memberId] = pyEnv["mail.channel.member"].search([
            ["channel_id", "=", channelId],
            ["partner_id", "=", pyEnv.currentPartnerId],
        ]);
        pyEnv["mail.channel.member"].write([memberId], { seen_message_id: messageId });
        const { env, openDiscuss } = await start();
        await openDiscuss(channelId);
        assert.containsOnce(target, ".o-mail-message", "should have an initial message");
        assert.containsNone(target, "hr + span:contains(New messages)");

        document.querySelector(".o-mail-composer-textarea").blur();
        // simulate receiving a message
        await afterNextRender(() =>
            env.services.rpc("/mail/chat_post", {
                context: { mockedUserId: userId },
                message_content: "hu",
                uuid: "randomuuid",
            })
        );
        assert.containsN(target, ".o-mail-message", 2);
        assert.containsOnce(target, "hr + span:contains(New messages)");
        assert.containsOnce(target, ".o-mail-thread-new-message ~ .o-mail-message:contains(hu)");

        target.querySelector(".o-mail-composer-textarea").focus();
        await nextTick();
        assert.containsNone(target, "hr + span:contains(New messages)");
    }
);

QUnit.test(
    "no new messages separator on posting message (no message history)",
    async function (assert) {
        const pyEnv = await startServer();
        const channelId = pyEnv["mail.channel"].create({
            channel_member_ids: [
                [0, 0, { message_unread_counter: 0, partner_id: pyEnv.currentPartnerId }],
            ],
            channel_type: "channel",
            name: "General",
        });
        const { openDiscuss } = await start();
        await openDiscuss(channelId);
        assert.containsNone(target, ".o-mail-message");
        assert.containsNone(target, "hr + span:contains(New messages)");

        await insertText(".o-mail-composer-textarea", "hey!");
        await click(".o-mail-composer-send-button");
        assert.containsOnce(target, ".o-mail-message");
        assert.containsNone(target, "hr + span:contains(New messages)");
    }
);

QUnit.test("Mention a partner with special character (e.g. apostrophe ')", async function (assert) {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({
        email: "usatyi@example.com",
        name: "Pynya's spokesman",
    });
    const channelId = pyEnv["mail.channel"].create({
        name: "test",
        channel_member_ids: [
            [0, 0, { partner_id: pyEnv.currentPartnerId }],
            [0, 0, { partner_id: partnerId }],
        ],
    });
    const { openDiscuss } = await start();
    await openDiscuss(channelId);
    await insertText(".o-mail-composer-textarea", "@");
    await insertText(".o-mail-composer-textarea", "Pyn");
    await click(".o-composer-suggestion");
    await click(".o-mail-composer-send-button");
    assert.containsOnce(
        target.querySelector(".o-mail-message-body"),
        `.o_mail_redirect[data-oe-id="${partnerId}"][data-oe-model="res.partner"]:contains("@Pynya's spokesman")`
    );
});

QUnit.test("mention 2 different partners that have the same name", async function (assert) {
    const pyEnv = await startServer();
    const [partnerId_1, partnerId_2] = pyEnv["res.partner"].create([
        {
            email: "partner1@example.com",
            name: "TestPartner",
        },
        {
            email: "partner2@example.com",
            name: "TestPartner",
        },
    ]);
    const channelId = pyEnv["mail.channel"].create({
        name: "test",
        channel_member_ids: [
            [0, 0, { partner_id: pyEnv.currentPartnerId }],
            [0, 0, { partner_id: partnerId_1 }],
            [0, 0, { partner_id: partnerId_2 }],
        ],
    });
    const { openDiscuss } = await start();
    await openDiscuss(channelId);
    await insertText(".o-mail-composer-textarea", "@");
    await insertText(".o-mail-composer-textarea", "Te");
    await afterNextRender(() => target.querySelectorAll(".o-composer-suggestion")[0].click());
    await insertText(".o-mail-composer-textarea", "@");
    await insertText(".o-mail-composer-textarea", "Te");
    await afterNextRender(() => target.querySelectorAll(".o-composer-suggestion")[1].click());
    await click(".o-mail-composer-send-button");
    assert.containsOnce(target, ".o-mail-message-body");
    assert.containsOnce(
        target.querySelector(`.o-mail-message-body`),
        `.o_mail_redirect[data-oe-id="${partnerId_1}"][data-oe-model="res.partner"]:contains("@TestPartner")`
    );
    assert.containsOnce(
        target.querySelector(`.o-mail-message-body`),
        `.o_mail_redirect[data-oe-id="${partnerId_2}"][data-oe-model="res.partner"]:contains("@TestPartner")`
    );
});

QUnit.test(
    "mention a channel on a second line when the first line contains #",
    async function (assert) {
        const pyEnv = await startServer();
        const channelId = pyEnv["mail.channel"].create({ name: "General good" });
        const { openDiscuss } = await start();
        await openDiscuss(channelId);
        await insertText(".o-mail-composer-textarea", "#blabla\n");
        await insertText(".o-mail-composer-textarea", "#");
        await click(".o-composer-suggestion");
        await click(".o-mail-composer-send-button");
        assert.containsOnce(target.querySelector(".o-mail-message-body"), ".o_channel_redirect");
        assert.strictEqual(
            target.querySelector(".o_channel_redirect").textContent,
            "#General good"
        );
    }
);

QUnit.test(
    "mention a channel when replacing the space after the mention by another char",
    async function (assert) {
        const pyEnv = await startServer();
        const channelId = pyEnv["mail.channel"].create({ name: "General good" });
        const { openDiscuss } = await start();
        await openDiscuss(channelId);
        await insertText(".o-mail-composer-textarea", "#");
        await click(".o-composer-suggestion");
        const text = target.querySelector(`.o-mail-composer-textarea`).value;
        target.querySelector(`.o-mail-composer-textarea`).value = text.slice(0, -1);
        await insertText(".o-mail-composer-textarea", ", test");
        await click(".o-mail-composer-send-button");
        assert.containsOnce(target.querySelector(".o-mail-message-body"), ".o_channel_redirect");
        assert.strictEqual(
            target.querySelector(".o_channel_redirect").textContent,
            "#General good"
        );
    }
);

QUnit.test("mention 2 different channels that have the same name", async function (assert) {
    const pyEnv = await startServer();
    const [channelId_1, channelId_2] = pyEnv["mail.channel"].create([
        {
            channel_type: "channel",
            group_public_id: false,
            name: "my channel",
        },
        {
            channel_type: "channel",
            name: "my channel",
        },
    ]);
    const { openDiscuss } = await start();
    await openDiscuss(channelId_1);
    await insertText(".o-mail-composer-textarea", "#");
    await insertText(".o-mail-composer-textarea", "m");
    await afterNextRender(() => target.querySelectorAll(".o-composer-suggestion")[0].click());
    await insertText(".o-mail-composer-textarea", "#");
    await insertText(".o-mail-composer-textarea", "m");
    await afterNextRender(() => target.querySelectorAll(".o-composer-suggestion")[1].click());
    await click(".o-mail-composer-send-button");
    assert.containsOnce(target, ".o-mail-message-body");
    assert.containsOnce(
        target.querySelector(`.o-mail-message-body`),
        `.o_channel_redirect[data-oe-id="${channelId_1}"][data-oe-model="mail.channel"]:contains("#my channel")`
    );
    assert.containsOnce(
        target.querySelector(`.o-mail-message-body`),
        `.o_channel_redirect[data-oe-id="${channelId_2}"][data-oe-model="mail.channel"]:contains("#my channel")`
    );
});

QUnit.test(
    "Post a message containing an email address followed by a mention on another line",
    async function (assert) {
        const pyEnv = await startServer();
        const partnerId = pyEnv["res.partner"].create({
            email: "testpartner@odoo.com",
            name: "TestPartner",
        });
        const channelId = pyEnv["mail.channel"].create({
            name: "test",
            channel_member_ids: [
                [0, 0, { partner_id: pyEnv.currentPartnerId }],
                [0, 0, { partner_id: partnerId }],
            ],
        });
        const { openDiscuss } = await start();
        await openDiscuss(channelId);
        await insertText(".o-mail-composer-textarea", "email@odoo.com\n");
        await insertText(".o-mail-composer-textarea", "@");
        await insertText(".o-mail-composer-textarea", "Te");
        await click(".o-composer-suggestion");
        await click(".o-mail-composer-send-button");
        assert.containsOnce(
            target.querySelector(`.o-mail-message-body`),
            `.o_mail_redirect[data-oe-id="${partnerId}"][data-oe-model="res.partner"]:contains("@TestPartner")`
        );
    }
);

QUnit.test("basic rendering of canceled notification", async function (assert) {
    const pyEnv = await startServer();
    const channeld = pyEnv["mail.channel"].create({ name: "test" });
    const partnerId = pyEnv["res.partner"].create({ name: "Someone" });
    const messageId = pyEnv["mail.message"].create({
        body: "not empty",
        message_type: "email",
        model: "mail.channel",
        res_id: channeld,
    });
    pyEnv["mail.notification"].create({
        failure_type: "SMTP",
        mail_message_id: messageId,
        notification_status: "canceled",
        notification_type: "email",
        res_partner_id: partnerId,
    });
    const { openDiscuss } = await start();
    await openDiscuss(channeld);
    assert.containsOnce(target, ".o-mail-message-notification .fa-envelope-o");

    await click(".o-mail-message-notification");
    assert.containsOnce(target, ".o-mail-message-notification-popover");
    assert.containsOnce(target, ".o-mail-message-notification-popover .fa-trash-o");
    assert.containsOnce(target, ".o-mail-message-notification-popover-partner-name");
    assert.containsOnce(
        target,
        ".o-mail-message-notification-popover-partner-name:contains(Someone)"
    );
});

QUnit.test(
    "first unseen message should be directly preceded by the new message separator if there is a transient message just before it while composer is not focused [REQUIRE FOCUS]",
    async function (assert) {
        // The goal of removing the focus is to ensure the thread is not marked as seen automatically.
        // Indeed that would trigger set_last_seen_message no matter what, which is already covered by other tests.
        // The goal of this test is to cover the conditions specific to transient messages,
        // and the conditions from focus would otherwise shadow them.
        const pyEnv = await startServer();
        // Needed partner & user to allow simulation of message reception
        const partnerId = pyEnv["res.partner"].create({ name: "Foreigner partner" });
        const userId = pyEnv["res.users"].create({
            name: "Foreigner user",
            partner_id: partnerId,
        });
        const channelId = pyEnv["mail.channel"].create({
            channel_type: "channel",
            name: "General",
            uuid: "channel20uuid",
        });
        pyEnv["mail.message"].create([
            {
                body: "not empty",
                model: "mail.channel",
                res_id: channelId,
            },
        ]);
        const { openDiscuss, env } = await start();
        await openDiscuss(channelId);
        // send a command that leads to receiving a transient message
        await insertText(".o-mail-composer-textarea", "/who");
        await click(".o-mail-composer-send-button");
        // composer is focused by default, we remove that focus
        document.querySelector(".o-mail-composer-textarea").blur();
        // simulate receiving a message
        await afterNextRender(() =>
            env.services.rpc("/mail/chat_post", {
                context: { mockedUserId: userId },
                message_content: "test",
                uuid: "channel20uuid",
            })
        );
        assert.containsN(target, ".o-mail-message", 3);
        assert.containsOnce(target, "hr + span:contains(New messages)");
        assert.containsOnce(
            target,
            ".o-mail-message[aria-label='Note'] + .o-mail-thread-new-message"
        );
    }
);
