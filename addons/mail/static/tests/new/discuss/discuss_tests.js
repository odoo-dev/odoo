/** @odoo-module **/

import { TEST_USER_IDS } from "@bus/../tests/helpers/test_constants";
import {
    afterNextRender,
    click,
    insertText,
    start,
    startServer,
} from "@mail/../tests/helpers/test_utils";
import {
    click as webClick,
    editInput,
    getFixture,
    nextTick,
    triggerEvent,
    triggerHotkey,
} from "@web/../tests/helpers/utils";
import { makeFakeNotificationService } from "@web/../tests/helpers/mock_services";
import { makeFakePresenceService } from "@bus/../tests/helpers/mock_services";

let target;

QUnit.module("discuss", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test("sanity check", async (assert) => {
    const { openDiscuss } = await start({
        mockRPC(route, args, originRPC) {
            if (route.startsWith("/mail")) {
                assert.step(route);
            }
            return originRPC(route, args);
        },
    });
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-discuss-sidebar");
    assert.containsOnce(
        target,
        ".o-mail-discuss-content h4:contains(Congratulations, your inbox is empty)"
    );

    assert.verifySteps([
        "/mail/init_messaging",
        "/mail/load_message_failures",
        "/mail/inbox/messages",
    ]);
});

QUnit.test("can change the thread name of #general", async (assert) => {
    const pyEnv = await startServer();
    const mailChannelId1 = pyEnv["mail.channel"].create({
        name: "general",
        channel_type: "channel",
    });
    const { openDiscuss } = await start({
        discuss: {
            context: { active_id: `mail.channel_${mailChannelId1}` },
        },
        mockRPC(route, params) {
            if (route === "/web/dataset/call_kw/mail.channel/channel_rename") {
                assert.step(route);
            }
        },
    });
    await openDiscuss();
    assert.containsOnce(target, "input.o-mail-discuss-thread-name");
    const threadNameElement = target.querySelector("input.o-mail-discuss-thread-name");

    await webClick(threadNameElement);
    assert.strictEqual(threadNameElement.value, "general");
    await editInput(target, "input.o-mail-discuss-thread-name", "special");
    await triggerEvent(target, "input.o-mail-discuss-thread-name", "keydown", {
        key: "Enter",
    });
    assert.strictEqual(threadNameElement.value, "special");

    assert.verifySteps(["/web/dataset/call_kw/mail.channel/channel_rename"]);
});

QUnit.test("can change the thread description of #general", async (assert) => {
    const pyEnv = await startServer();
    const mailChannelId1 = pyEnv["mail.channel"].create({
        name: "general",
        channel_type: "channel",
        description: "General announcements...",
    });
    const { openDiscuss } = await start({
        discuss: {
            context: { active_id: `mail.channel_${mailChannelId1}` },
        },
        mockRPC(route, params) {
            if (route === "/web/dataset/call_kw/mail.channel/channel_change_description") {
                assert.step(route);
            }
        },
    });
    await openDiscuss();

    assert.containsOnce(target, "input.o-mail-discuss-thread-description");
    const threadDescriptionElement = target.querySelector(
        "input.o-mail-discuss-thread-description"
    );

    await webClick(threadDescriptionElement);
    assert.strictEqual(threadDescriptionElement.value, "General announcements...");
    await editInput(target, "input.o-mail-discuss-thread-description", "I want a burger today!");
    await triggerEvent(target, "input.o-mail-discuss-thread-description", "keydown", {
        key: "Enter",
    });
    assert.strictEqual(threadDescriptionElement.value, "I want a burger today!");

    assert.verifySteps(["/web/dataset/call_kw/mail.channel/channel_change_description"]);
});

QUnit.test("can create a new channel", async (assert) => {
    await startServer();
    const { openDiscuss } = await start({
        mockRPC(route, params) {
            if (
                route.startsWith("/mail") ||
                [
                    "/web/dataset/call_kw/mail.channel/search_read",
                    "/web/dataset/call_kw/mail.channel/channel_create",
                ].includes(route)
            ) {
                assert.step(route);
            }
        },
    });
    await openDiscuss();
    assert.containsNone(target, ".o-mail-category-item");

    await click(".o-mail-discuss-sidebar i[title='Add or join a channel']");
    await afterNextRender(() => editInput(target, ".o-mail-channel-selector-input", "abc"));
    await click(".o-mail-channel-selector-suggestion");
    assert.containsOnce(target, ".o-mail-category-item");
    assert.containsNone(target, ".o-mail-discuss-content .o-mail-message");
    assert.verifySteps([
        "/mail/init_messaging",
        "/mail/load_message_failures",
        "/mail/inbox/messages",
        "/web/dataset/call_kw/mail.channel/search_read",
        "/web/dataset/call_kw/mail.channel/channel_create",
        "/mail/channel/messages",
        "/mail/channel/set_last_seen_message",
        "/mail/channel/messages",
    ]);
});

QUnit.test(
    "do not close channel selector when creating chat conversation after selection",
    async (assert) => {
        const pyEnv = await startServer();
        const resPartnerId = pyEnv["res.partner"].create({
            name: "Mario",
        });
        pyEnv["res.users"].create({
            partner_id: resPartnerId,
        });
        const { openDiscuss } = await start();
        await openDiscuss();
        assert.containsNone(target, ".o-mail-category-item");

        await click(".o-mail-discuss-sidebar i[title='Start a conversation']");
        await afterNextRender(() => editInput(target, ".o-mail-channel-selector-input", "mario"));
        await click(".o-mail-channel-selector-suggestion");
        assert.containsOnce(target, ".o-mail-channel-selector span[title='Mario']");
        assert.containsNone(target, ".o-mail-category-item");

        await triggerEvent(target, ".o-mail-channel-selector-input", "keydown", {
            key: "Backspace",
        });
        assert.containsNone(target, ".o-mail-channel-selector span[title='Mario']");

        await afterNextRender(() => editInput(target, ".o-mail-channel-selector-input", "mario"));
        await triggerEvent(target, ".o-mail-channel-selector-input", "keydown", {
            key: "Enter",
        });
        assert.containsOnce(target, ".o-mail-channel-selector span[title='Mario']");
        assert.containsNone(target, ".o-mail-category-item");
    }
);

QUnit.test("can join a chat conversation", async (assert) => {
    const pyEnv = await startServer();
    const resPartnerId = pyEnv["res.partner"].create({
        name: "Mario",
    });
    pyEnv["res.users"].create({
        partner_id: resPartnerId,
    });
    const { openDiscuss } = await start({
        mockRPC(route, params) {
            if (
                route.startsWith("/mail") ||
                ["/web/dataset/call_kw/mail.channel/channel_get"].includes(route)
            ) {
                assert.step(route);
            }
            if (route === "/web/dataset/call_kw/mail.channel/channel_get") {
                assert.equal(params.kwargs.partners_to[0], resPartnerId);
            }
        },
    });
    await openDiscuss();
    assert.containsNone(target, ".o-mail-category-item");

    await click(".o-mail-discuss-sidebar i[title='Start a conversation']");
    await afterNextRender(() => editInput(target, ".o-mail-channel-selector-input", "mario"));
    await click(".o-mail-channel-selector-suggestion");
    await triggerEvent(target, ".o-mail-channel-selector-input", "keydown", {
        key: "Enter",
    });
    assert.containsOnce(target, ".o-mail-category-item");
    assert.containsNone(target, ".o-mail-discuss-content .o-mail-message");
    assert.verifySteps([
        "/mail/init_messaging",
        "/mail/load_message_failures",
        "/mail/inbox/messages",
        "/web/dataset/call_kw/mail.channel/channel_get",
        "/mail/channel/messages",
    ]);
});

QUnit.test("can create a group chat conversation", async (assert) => {
    const pyEnv = await startServer();
    const [resPartnerId1, resPartnerId2] = pyEnv["res.partner"].create([
        {
            name: "Mario",
        },
        { name: "Luigi" },
    ]);
    pyEnv["res.users"].create([
        {
            partner_id: resPartnerId1,
        },
        {
            partner_id: resPartnerId2,
        },
    ]);
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsNone(target, ".o-mail-category-item");
    await click(".o-mail-discuss-sidebar i[title='Start a conversation']");
    await insertText(".o-mail-channel-selector-input", "Mario");
    await click(".o-mail-channel-selector-suggestion");
    await insertText(".o-mail-channel-selector-input", "Luigi");
    await click(".o-mail-channel-selector-suggestion");
    await triggerEvent(target, ".o-mail-channel-selector-input", "keydown", {
        key: "Enter",
    });
    assert.containsN(target, ".o-mail-category-item", 1);
    assert.containsNone(target, ".o-mail-discuss-content .o-mail-message");
});

QUnit.test("Message following a notification should not be squashed", async (assert) => {
    const pyEnv = await startServer();
    const mailChannelId = pyEnv["mail.channel"].create({
        name: "general",
        channel_type: "channel",
    });
    pyEnv["mail.message"].create({
        author_id: pyEnv.currentPartnerId,
        body: '<div class="o_mail_notification">created <a href="#" class="o_channel_redirect">#general</a></div>',
        model: "mail.channel",
        res_id: mailChannelId,
        message_type: "notification",
    });
    const { openDiscuss } = await start({
        discuss: {
            context: { active_id: `mail.channel_${mailChannelId}` },
        },
    });
    await openDiscuss();
    await editInput(target, ".o-mail-composer-textarea", "Hello world!");
    await click(".o-mail-composer button[data-action='send']");
    assert.containsOnce(target, ".o-mail-message-sidebar .o-mail-avatar-container");
});

QUnit.test("Posting message should transform links.", async (assert) => {
    const pyEnv = await startServer();
    const mailChannelId1 = pyEnv["mail.channel"].create({
        name: "general",
        channel_type: "channel",
    });
    const { openDiscuss } = await start({
        discuss: {
            context: { active_id: `mail.channel_${mailChannelId1}` },
        },
    });
    await openDiscuss();
    await insertText(".o-mail-composer-textarea", "test https://www.odoo.com/");
    await click(target, ".o-mail-composer-send-button");
    assert.containsOnce(target, "a[href='https://www.odoo.com/']", "Message should have a link");
});

QUnit.test("Posting message should transform relevant data to emoji.", async (assert) => {
    const pyEnv = await startServer();
    const mailChannelId1 = pyEnv["mail.channel"].create({
        name: "general",
        channel_type: "channel",
    });
    const { openDiscuss } = await start({
        discuss: {
            context: { active_id: `mail.channel_${mailChannelId1}` },
        },
    });
    await openDiscuss();
    await insertText(".o-mail-composer-textarea", "test :P :laughing:");
    await click(target, ".o-mail-composer-send-button");
    assert.equal(target.querySelector(".o-mail-message-body").textContent, "test 😛 😆");
});

QUnit.test(
    "posting a message immediately after another one is displayed in 'simple' mode (squashed)",
    async (assert) => {
        const pyEnv = await startServer();
        const mailChannelId1 = pyEnv["mail.channel"].create({
            name: "general",
            channel_type: "channel",
        });
        let flag = false;
        const { openDiscuss } = await start({
            discuss: {
                context: { active_id: `mail.channel_${mailChannelId1}` },
            },
            async mockRPC(route, params) {
                if (flag && route === "/mail/message/post") {
                    await new Promise(() => {});
                }
            },
        });

        await openDiscuss();
        // write 1 message
        await editInput(target, ".o-mail-composer-textarea", "abc");
        await webClick(target, ".o-mail-composer button[data-action='send']");

        // write another message, but /mail/message/post is delayed by promise
        flag = true;
        await editInput(target, ".o-mail-composer-textarea", "def");
        await webClick(target, ".o-mail-composer button[data-action='send']");
        assert.containsN(target, ".o-mail-message", 2);
        assert.containsN(target, ".o-mail-msg-header", 1); // just 1, because 2nd message is squashed
    }
);

QUnit.test("Click on avatar opens its partner chat window", async (assert) => {
    const pyEnv = await startServer();
    const testPartnerId = pyEnv["res.partner"].create({
        name: "testPartner",
    });
    pyEnv["mail.message"].create({
        author_id: testPartnerId,
        body: "Test",
        attachment_ids: [],
        model: "res.partner",
        res_id: testPartnerId,
    });
    const { openFormView } = await start();
    await openFormView({
        res_id: testPartnerId,
        res_model: "res.partner",
    });
    assert.containsOnce(target, ".o-mail-message-sidebar .o-mail-avatar-container .cursor-pointer");
    await webClick(
        target.querySelector(".o-mail-message-sidebar .o-mail-avatar-container .cursor-pointer")
    );
    assert.containsOnce(target, ".o-mail-chat-window-header-name");
    assert.ok(
        target.querySelector(".o-mail-chat-window-header-name").textContent.includes("testPartner")
    );
});

QUnit.test("Can use channel command /who", async (assert) => {
    const pyEnv = await startServer();
    const mailChannelId1 = pyEnv["mail.channel"].create({
        channel_type: "channel",
        name: "my-channel",
    });
    const { openDiscuss } = await start({
        discuss: {
            params: {
                default_active_id: `mail.channel_${mailChannelId1}`,
            },
        },
    });
    await openDiscuss();
    await insertText(".o-mail-composer-textarea", "/who");
    await click(".o-mail-composer button[data-action='send']");

    assert.strictEqual(
        document.querySelector(".o_mail_notification").textContent,
        "You are alone in this channel.",
        "should display '/who' result"
    );
});

QUnit.test("sidebar: chat im_status rendering", async function (assert) {
    const pyEnv = await startServer();
    const [resPartnerId1, resPartnerId2, resPartnerId3] = pyEnv["res.partner"].create([
        { im_status: "offline", name: "Partner1" },
        { im_status: "online", name: "Partner2" },
        { im_status: "away", name: "Partner3" },
    ]);
    pyEnv["mail.channel"].create([
        {
            channel_member_ids: [
                [0, 0, { partner_id: pyEnv.currentPartnerId }],
                [0, 0, { partner_id: resPartnerId1 }],
            ],
            channel_type: "chat",
        },
        {
            channel_member_ids: [
                [0, 0, { partner_id: pyEnv.currentPartnerId }],
                [0, 0, { partner_id: resPartnerId2 }],
            ],
            channel_type: "chat",
        },
        {
            channel_member_ids: [
                [0, 0, { partner_id: pyEnv.currentPartnerId }],
                [0, 0, { partner_id: resPartnerId3 }],
            ],
            channel_type: "chat",
        },
    ]);
    const { openDiscuss } = await start({ hasTimeControl: true });
    await openDiscuss();
    assert.containsN(target, ".o-mail-discuss-sidebar-threadIcon", 3);
    const chat1 = target.querySelectorAll(".o-mail-category-item")[0];
    const chat2 = target.querySelectorAll(".o-mail-category-item")[1];
    const chat3 = target.querySelectorAll(".o-mail-category-item")[2];
    assert.strictEqual(chat1.textContent, "Partner1", "First chat should have Partner1");
    assert.strictEqual(chat2.textContent, "Partner2", "First chat should have Partner2");
    assert.strictEqual(chat3.textContent, "Partner3", "First chat should have Partner3");
    assert.containsOnce(chat1, ".o-mail-chatwindow-icon-offline", "chat1 should have offline icon");
    assert.containsOnce(chat2, ".o-mail-chatwindow-icon-online", "chat2 should have online icon");
    assert.containsOnce(chat3, ".o-mail-chatwindow-icon-away", "chat3 should have away icon");
});

QUnit.test("No load more when fetch below fetch limit of 30", async function (assert) {
    const pyEnv = await startServer();
    const mailChannelId1 = pyEnv["mail.channel"].create({ name: "general" });
    const resPartnerId1 = pyEnv["res.partner"].create({});
    pyEnv["res.partner"].create({});
    for (let i = 28; i >= 0; i--) {
        pyEnv["mail.message"].create({
            author_id: resPartnerId1,
            body: "not empty",
            date: "2019-04-20 10:00:00",
            model: "mail.channel",
            res_id: mailChannelId1,
        });
    }
    const { openDiscuss } = await start({
        discuss: {
            params: {
                default_active_id: `mail.channel_${mailChannelId1}`,
            },
        },
        async mockRPC(route, args) {
            if (route === "/mail/channel/messages") {
                assert.strictEqual(args.limit, 30, "should fetch up to 30 messages");
            }
        },
    });
    await openDiscuss();
    assert.containsN(target, ".o-mail-message", 29);
    assert.containsNone(target, "button:contains(Load more)");
});

QUnit.test("show date separator above mesages of similar date", async function (assert) {
    const pyEnv = await startServer();
    const mailChannelId1 = pyEnv["mail.channel"].create({ name: "general" });
    const resPartnerId1 = pyEnv["res.partner"].create({});
    pyEnv["res.partner"].create({});
    for (let i = 28; i >= 0; i--) {
        pyEnv["mail.message"].create({
            author_id: resPartnerId1,
            body: "not empty",
            date: "2019-04-20 10:00:00",
            model: "mail.channel",
            res_id: mailChannelId1,
        });
    }
    const { openDiscuss } = await start({
        discuss: {
            params: {
                default_active_id: `mail.channel_${mailChannelId1}`,
            },
        },
    });
    await openDiscuss();
    assert.ok(
        $(target).find("hr + span:contains(April 20, 2019) + hr").offset().top <
            $(target).find(".o-mail-message").offset().top,
        "should have a single date separator above all the messages" // to check: may be client timezone dependent
    );
});

QUnit.test("sidebar: chat custom name", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({ name: "Marc Demo" });
    pyEnv["mail.channel"].create({
        channel_member_ids: [
            [
                0,
                0,
                {
                    custom_channel_name: "Marc",
                    partner_id: pyEnv.currentPartnerId,
                },
            ],
            [0, 0, { partner_id: resPartnerId1 }],
        ],
        channel_type: "chat",
    });
    const { openDiscuss } = await start();
    await openDiscuss();
    const chat = document.querySelector(".o-mail-category-item");
    assert.strictEqual(chat.querySelector("span").textContent, "Marc");
});

QUnit.test("reply to message from inbox (message linked to document)", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({ name: "Refactoring" });
    const mailMessageId1 = pyEnv["mail.message"].create({
        body: "<p>Test</p>",
        date: "2019-04-20 11:00:00",
        message_type: "comment",
        needaction: true,
        model: "res.partner",
        res_id: resPartnerId1,
    });
    pyEnv["mail.notification"].create({
        mail_message_id: mailMessageId1,
        notification_type: "inbox",
        res_partner_id: pyEnv.currentPartnerId,
    });
    const { openDiscuss } = await start({
        async mockRPC(route, args) {
            if (route === "/mail/message/post") {
                assert.step("message_post");
                assert.strictEqual(args.thread_model, "res.partner");
                assert.strictEqual(args.thread_id, resPartnerId1);
                assert.strictEqual(args.post_data.body, "Test");
                assert.strictEqual(args.post_data.message_type, "comment");
            }
        },
        services: {
            notification: makeFakeNotificationService((notification) => {
                assert.ok(true, "should display a notification after posting reply");
                assert.strictEqual(notification, 'Message posted on "Refactoring"');
            }),
        },
    });
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-message");
    assert.strictEqual(
        target.querySelector(".o-mail-message-recod-name").textContent,
        " on Refactoring"
    );

    await click("i[aria-label='Reply']");
    assert.ok(target.querySelector(".o-mail-composer"));
    assert.strictEqual(
        target.querySelector(".o-mail-composer-origin-thread").textContent,
        " on: Refactoring"
    );
    assert.strictEqual(document.activeElement, target.querySelector(".o-mail-composer-textarea"));

    await insertText(".o-mail-composer-textarea", "Test");
    await click(".o-mail-composer-send-button");
    assert.verifySteps(["message_post"]);
    assert.containsNone(target, ".o-mail-composer");
    assert.containsOnce(target, ".o-mail-message");
    assert.strictEqual(
        parseInt(target.querySelector(".o-mail-message").dataset.messageId),
        mailMessageId1
    );
    assert.doesNotHaveClass(target.querySelector(".o-mail-message"), "o-selected");
});

QUnit.test("Can reply to starred message", async function (assert) {
    const pyEnv = await startServer();
    const mailChannelId = pyEnv["mail.channel"].create({ name: "RandomName" });
    pyEnv["mail.message"].create({
        body: "not empty",
        model: "mail.channel",
        starred_partner_ids: [pyEnv.currentPartnerId],
        res_id: mailChannelId,
    });
    const { openDiscuss } = await start({
        discuss: {
            context: {
                active_id: "mail.box_starred",
            },
        },
        services: {
            notification: makeFakeNotificationService((message) => assert.step(message)),
        },
    });
    await openDiscuss();
    await click("i[aria-label='Reply']");
    assert.containsOnce(target, ".o-mail-composer-origin-thread:contains('RandomName')");
    await insertText(".o-mail-composer-textarea", "abc");
    await click(".o-mail-composer-send-button");
    assert.verifySteps(['Message posted on "RandomName"']);
    assert.containsOnce(target, ".o-mail-message");
});

QUnit.test("Can reply to history message", async function (assert) {
    const pyEnv = await startServer();
    const mailChannelId = pyEnv["mail.channel"].create({ name: "RandomName" });
    const mailMessageId1 = pyEnv["mail.message"].create({
        body: "not empty",
        model: "mail.channel",
        history_partner_ids: [pyEnv.currentPartnerId],
        res_id: mailChannelId,
    });
    pyEnv["mail.notification"].create({
        mail_message_id: mailMessageId1,
        notification_type: "inbox",
        res_partner_id: pyEnv.currentPartnerId,
        is_read: true,
    });
    const { openDiscuss } = await start({
        discuss: {
            context: {
                active_id: "mail.box_history",
            },
        },
        services: {
            notification: makeFakeNotificationService((message) => assert.step(message)),
        },
    });
    await openDiscuss();
    await click("i[aria-label='Reply']");
    assert.containsOnce(target, ".o-mail-composer-origin-thread:contains('RandomName')");
    await insertText(".o-mail-composer-textarea", "abc");
    await click(".o-mail-composer-send-button");
    assert.verifySteps(['Message posted on "RandomName"']);
    assert.containsOnce(target, ".o-mail-message");
});

QUnit.test("receive new needaction messages", async function (assert) {
    const { openDiscuss, pyEnv } = await start();
    await openDiscuss();
    assert.containsOnce(target, 'button[data-mailbox="inbox"]');
    assert.hasClass(document.querySelector('button[data-mailbox="inbox"]'), "o-active");
    assert.containsNone(target, '.button[data-mailbox="inbox"] .badge');
    assert.containsNone(target, ".o-mail-discuss-content .o-mail-thread .o-mail-message");

    // simulate receiving a new needaction message
    await afterNextRender(() => {
        pyEnv["bus.bus"]._sendone(pyEnv.currentPartner, "mail.message/inbox", {
            body: "not empty",
            id: 100,
            needaction_partner_ids: [pyEnv.currentPartnerId],
            model: "res.partner",
            res_id: 20,
        });
    });
    assert.containsOnce(target, 'button[data-mailbox="inbox"] .badge');
    assert.strictEqual(
        document.querySelector('button[data-mailbox="inbox"] .badge').textContent,
        "1"
    );
    assert.containsOnce(target, ".o-mail-discuss-content .o-mail-thread .o-mail-message");
    assert.strictEqual(
        parseInt(
            document.querySelector(".o-mail-discuss-content .o-mail-thread .o-mail-message").dataset
                .messageId
        ),
        100
    );

    // simulate receiving another new needaction message
    await afterNextRender(() => {
        pyEnv["bus.bus"]._sendone(pyEnv.currentPartner, "mail.message/inbox", {
            body: "not empty",
            id: 101,
            needaction_partner_ids: [pyEnv.currentPartnerId],
            model: "res.partner",
            res_id: 20,
        });
    });
    assert.strictEqual(
        document.querySelector('button[data-mailbox="inbox"] .badge').textContent,
        "2"
    );
    assert.containsN(target, ".o-mail-discuss-content .o-mail-thread .o-mail-message", 2);
    assert.containsOnce(
        target,
        '.o-mail-discuss-content .o-mail-thread .o-mail-message[data-message-id="100"]'
    );
    assert.containsOnce(
        target,
        '.o-mail-discuss-content .o-mail-thread .o-mail-message[data-message-id="101"]'
    );
});

QUnit.test("basic rendering", async function (assert) {
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-discuss-sidebar");
    assert.containsOnce(target, ".o-mail-discuss-content");
    assert.containsOnce(target, ".o-mail-discuss-content .o-mail-thread");
});

QUnit.test("basic rendering: sidebar", async function (assert) {
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-discuss-sidebar button:contains(Inbox)");
    assert.containsOnce(target, ".o-mail-discuss-sidebar button:contains(Starred)");
    assert.containsOnce(target, ".o-mail-discuss-sidebar button:contains(History)");
    assert.containsN(target, ".o-mail-category", 2);
    assert.containsOnce(target, ".o-mail-category-channel");
    assert.containsOnce(target, ".o-mail-category-chat");
    assert.strictEqual($(target).find(".o-mail-category-channel").text(), "Channels");
    assert.strictEqual($(target).find(".o-mail-category-chat").text(), "Direct messages");
});

QUnit.test("sidebar: Inbox should have icon", async function (assert) {
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-discuss-sidebar button:contains(Inbox)");
    const $inbox = $(".o-mail-discuss-sidebar button:contains(Inbox)");
    assert.containsOnce($inbox, ".fa-inbox");
});

QUnit.test("sidebar: default active inbox", async function (assert) {
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-discuss-sidebar button:contains(Inbox)");
    const $inbox = $(".o-mail-discuss-sidebar button:contains(Inbox)");
    assert.hasClass($inbox, "o-active");
});

QUnit.test("sidebar: change active", async function (assert) {
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-discuss-sidebar button:contains(Inbox)");
    assert.containsOnce(target, ".o-mail-discuss-sidebar button:contains(Starred)");
    let $inbox = $(target).find(".o-mail-discuss-sidebar button:contains(Inbox)");
    let $starred = $(target).find(".o-mail-discuss-sidebar button:contains(Starred)");
    assert.hasClass($inbox[0], "o-active");
    assert.doesNotHaveClass($starred[0], "o-active");
    await click(".o-mail-discuss-sidebar button:contains(Starred)");
    $inbox = $(target).find(".o-mail-discuss-sidebar button:contains(Inbox)");
    $starred = $(target).find(".o-mail-discuss-sidebar button:contains(Starred)");
    assert.doesNotHaveClass($inbox[0], "o-active");
    assert.hasClass($starred[0], "o-active");
});

QUnit.test("sidebar: add channel", async function (assert) {
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-category-channel .o-mail-category-add-button");
    assert.hasAttrValue(
        $(target).find(".o-mail-category-channel .o-mail-category-add-button")[0],
        "title",
        "Add or join a channel"
    );
    await click(".o-mail-category-channel .o-mail-category-add-button");
    assert.containsOnce(target, ".o-mail-channel-selector");
    assert.containsOnce(
        target,
        ".o-mail-channel-selector input[placeholder='Add or join a channel']"
    );
});

QUnit.test("sidebar: basic channel rendering", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({ name: "General" });
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-category-item");
    assert.strictEqual($(target).find(".o-mail-category-item").text(), "General");
    assert.containsOnce($(target).find(".o-mail-category-item"), "img[data-alt='Thread Image']");
    assert.containsOnce($(target).find(".o-mail-category-item"), ".o-mail-commands");
    assert.hasClass($(target).find(".o-mail-category-item .o-mail-commands"), "d-none");
    assert.containsOnce(
        $(target).find(".o-mail-category-item .o-mail-commands"),
        "i[title='Channel settings']"
    );
    assert.containsOnce(
        $(target).find(".o-mail-category-item .o-mail-commands"),
        "div[title='Leave this channel']"
    );
});

QUnit.test("channel become active", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({ name: "General" });
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-category-item");
    assert.containsNone(target, ".o-mail-category-item.o-active");
    await click(".o-mail-category-item");
    assert.containsOnce(target, ".o-mail-category-item.o-active");
});

QUnit.test("channel become active - show composer in discuss content", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({ name: "General" });
    const { openDiscuss } = await start();
    await openDiscuss();
    await click(".o-mail-category-item");
    assert.containsOnce(target, ".o-mail-discuss-content .o-mail-thread");
    assert.containsOnce(target, ".o-mail-discuss-content .o-mail-composer");
});

QUnit.test("sidebar: channel rendering with needaction counter", async function (assert) {
    const pyEnv = await startServer();
    const mailChannelId1 = pyEnv["mail.channel"].create({ name: "general" });
    const mailMessageId1 = pyEnv["mail.message"].create({
        body: "not empty",
        model: "mail.channel",
        res_id: mailChannelId1,
    });
    pyEnv["mail.notification"].create({
        mail_message_id: mailMessageId1,
        notification_type: "inbox",
        res_partner_id: pyEnv.currentPartnerId,
    });
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-category-item:contains(general)");
    assert.containsOnce(target, ".o-mail-category-item:contains(general) .badge:contains(1)");
});

QUnit.test("sidebar: chat rendering with unread counter", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({
        channel_member_ids: [
            [
                0,
                0,
                {
                    message_unread_counter: 100,
                    partner_id: pyEnv.currentPartnerId,
                },
            ],
        ],
        channel_type: "chat",
    });
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-category-item .badge:contains(100)");
    assert.containsNone(
        target,
        ".o-mail-category-item .o-mail-commands:contains(Unpin Conversation)"
    );
});

QUnit.test("initially load messages from inbox", async function (assert) {
    const { openDiscuss } = await start({
        async mockRPC(route, args) {
            if (route === "/mail/inbox/messages") {
                assert.step("/mail/channel/messages");
                assert.strictEqual(args.limit, 30, "should fetch up to 30 messages");
            }
        },
    });
    await openDiscuss();
    assert.verifySteps(["/mail/channel/messages"]);
});

QUnit.test("default active id on mailbox", async function (assert) {
    const { openDiscuss } = await start({
        discuss: {
            params: {
                default_active_id: "mail.box_starred",
            },
        },
    });
    await openDiscuss();
    assert.hasClass($(target).find(".o-starred-box"), "o-active");
});

QUnit.test("basic top bar rendering", async function (assert) {
    const pyEnv = await startServer();
    const mailChannelId1 = pyEnv["mail.channel"].create({ name: "General" });
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.strictEqual($(target).find(".o-mail-discuss-thread-name")[0].value, "Inbox");
    const $markAllReadButton = $(target).find(
        '.o-mail-discuss-actions button[data-action="mark-all-read"]'
    );
    assert.isVisible($markAllReadButton);
    assert.ok($markAllReadButton[0].disabled);

    await click('button[data-mailbox="starred"]');
    assert.strictEqual($(target).find(".o-mail-discuss-thread-name")[0].value, "Starred");
    const $unstarAllButton = $(target).find(
        '.o-mail-discuss-actions button[data-action="unstar-all"]'
    );
    assert.isVisible($unstarAllButton);
    assert.ok($unstarAllButton[0].disabled);

    await click(`.o-mail-category-item[data-channel-id="${mailChannelId1}"]`);
    assert.strictEqual($(target).find(".o-mail-discuss-thread-name")[0].value, "General");
    assert.isVisible(
        $(target).find('.o-mail-discuss-actions button[data-action="add-users"]'),
        "should have button 'Invite' in the top bar of channel"
    );
});

QUnit.test("rendering of inbox message", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({ name: "Refactoring" });
    const mailMessageId1 = pyEnv["mail.message"].create({
        body: "not empty",
        model: "res.partner",
        needaction: true,
        needaction_partner_ids: [pyEnv.currentPartnerId],
        res_id: resPartnerId1,
    });
    pyEnv["mail.notification"].create({
        mail_message_id: mailMessageId1,
        notification_status: "sent",
        notification_type: "inbox",
        res_partner_id: pyEnv.currentPartnerId,
    });
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-message");
    const $message = $(target).find(".o-mail-message");
    assert.containsOnce($message, ".o-mail-message-recod-name");
    assert.strictEqual($message.find(".o-mail-message-recod-name").text(), " on Refactoring");
    assert.containsN($message, ".o-mail-message-actions i", 4);
    assert.containsOnce($message, ".o-mail-message-action-add-reaction");
    assert.containsOnce($message, ".o-mail-message-action-toggle-star");
    assert.containsOnce($message, ".o-mail-message-action-reply-to");
    assert.containsOnce($message, ".o-mail-message-action-mark-read");
});

QUnit.test('messages marked as read move to "History" mailbox', async function (assert) {
    const pyEnv = await startServer();
    const mailChannelId1 = pyEnv["mail.channel"].create({ name: "other-disco" });
    const [mailMessageId1, mailMessageId2] = pyEnv["mail.message"].create([
        {
            body: "not empty",
            model: "mail.channel",
            needaction: true,
            res_id: mailChannelId1,
        },
        {
            body: "not empty",
            model: "mail.channel",
            needaction: true,
            res_id: mailChannelId1,
        },
    ]);
    pyEnv["mail.notification"].create([
        {
            mail_message_id: mailMessageId1,
            notification_type: "inbox",
            res_partner_id: pyEnv.currentPartnerId,
        },
        {
            mail_message_id: mailMessageId2,
            notification_type: "inbox",
            res_partner_id: pyEnv.currentPartnerId,
        },
    ]);
    const { openDiscuss } = await start({
        discuss: {
            params: {
                default_active_id: "mail.box_history",
            },
        },
    });
    await openDiscuss();
    assert.hasClass($(target).find('button[data-mailbox="history"]'), "o-active");
    assert.containsOnce(target, '.o-mail-discuss-content .o-mail-thread [data-empty-thread=""]');

    await click('button[data-mailbox="inbox"]');
    assert.hasClass($(target).find('button[data-mailbox="inbox"]'), "o-active");
    assert.containsNone(target, '.o-mail-discuss-content .o-mail-thread [data-empty-thread=""]');
    assert.containsN(target, ".o-mail-discuss-content .o-mail-thread .o-mail-message", 2);

    await click('.o-mail-discuss-actions button[data-action="mark-all-read"]');
    assert.hasClass($(target).find('button[data-mailbox="inbox"]'), "o-active");
    assert.containsOnce(target, '.o-mail-discuss-content .o-mail-thread [data-empty-thread=""]');

    await click('button[data-mailbox="history"]');
    assert.hasClass($(target).find('button[data-mailbox="history"]'), "o-active");
    assert.containsNone(target, '.o-mail-discuss-content .o-mail-thread [data-empty-thread=""]');
    assert.containsN(target, ".o-mail-discuss-content .o-mail-thread .o-mail-message", 2);
});

QUnit.test(
    'mark a single message as read should only move this message to "History" mailbox',
    async function (assert) {
        const pyEnv = await startServer();
        const [mailMessageId1, mailMessageId2] = pyEnv["mail.message"].create([
            {
                body: "not empty",
                needaction: true,
                needaction_partner_ids: [pyEnv.currentPartnerId],
            },
            {
                body: "not empty",
                needaction: true,
                needaction_partner_ids: [pyEnv.currentPartnerId],
            },
        ]);
        pyEnv["mail.notification"].create([
            {
                mail_message_id: mailMessageId1,
                notification_type: "inbox",
                res_partner_id: pyEnv.currentPartnerId,
            },
            {
                mail_message_id: mailMessageId2,
                notification_type: "inbox",
                res_partner_id: pyEnv.currentPartnerId,
            },
        ]);
        const { openDiscuss } = await start({
            discuss: {
                params: {
                    default_active_id: "mail.box_history",
                },
            },
        });
        await openDiscuss();
        assert.hasClass($(target).find('button[data-mailbox="history"]'), "o-active");
        assert.containsOnce(target, '[data-empty-thread=""]');

        await click('button[data-mailbox="inbox"]');
        assert.hasClass($(target).find('button[data-mailbox="inbox"]'), "o-active");
        assert.containsN(target, ".o-mail-message", 2);

        await click(
            `.o-mail-message[data-message-id="${mailMessageId1}"] .o-mail-message-action-mark-read`
        );
        assert.containsOnce(target, ".o-mail-message");
        assert.containsOnce(target, `.o-mail-message[data-message-id="${mailMessageId2}"]`);

        await click('button[data-mailbox="history"]');
        assert.hasClass($(target).find('button[data-mailbox="history"]'), "o-active");
        assert.containsOnce(target, ".o-mail-message");
        assert.containsOnce(target, `.o-mail-message[data-message-id="${mailMessageId1}"]`);
    }
);

QUnit.test(
    'all messages in "Inbox" in "History" after marked all as read',
    async function (assert) {
        const pyEnv = await startServer();
        for (let i = 0; i < 40; i++) {
            const currentMailMessageId = pyEnv["mail.message"].create({
                body: "not empty",
                needaction: true,
            });
            pyEnv["mail.notification"].create({
                mail_message_id: currentMailMessageId,
                notification_type: "inbox",
                res_partner_id: pyEnv.currentPartnerId,
            });
        }
        const { openDiscuss } = await start();
        await openDiscuss();
        await click('.o-mail-discuss-actions button[data-action="mark-all-read"]');
        assert.containsNone(target, ".o-mail-message");

        await click('button[data-mailbox="history"]');
        await afterNextRender(() => (target.querySelector(".o-mail-thread").scrollTop = 0));
        assert.containsN(target, ".o-mail-message", 40);
    }
);

QUnit.test("post a simple message", async function (assert) {
    const pyEnv = await startServer();
    const mailChannelId1 = pyEnv["mail.channel"].create({ name: "general" });
    const { openDiscuss } = await start({
        discuss: {
            params: {
                default_active_id: `mail.channel_${mailChannelId1}`,
            },
        },
        async mockRPC(route, args) {
            if (route === "/mail/message/post") {
                assert.step("message_post");
                assert.strictEqual(args.thread_model, "mail.channel");
                assert.strictEqual(args.thread_id, mailChannelId1);
                assert.strictEqual(args.post_data.body, "Test");
                assert.strictEqual(args.post_data.message_type, "comment");
                assert.strictEqual(args.post_data.subtype_xmlid, "mail.mt_comment");
            }
        },
    });
    await openDiscuss();
    assert.containsOnce(target, '[data-empty-thread=""]');
    assert.containsNone(target, ".o-mail-message");
    assert.strictEqual(target.querySelector(".o-mail-composer-textarea").value, "");

    // insert some HTML in editable
    await insertText(".o-mail-composer-textarea", "Test");
    assert.strictEqual(target.querySelector(".o-mail-composer-textarea").value, "Test");

    await click(".o-mail-composer-send-button");
    assert.verifySteps(["message_post"]);
    assert.strictEqual(target.querySelector(".o-mail-composer-textarea").value, "");
    assert.containsOnce(target, ".o-mail-message");
    const [postedMessageId] = pyEnv["mail.message"].search([], { order: "id DESC" });
    const $message = $(target).find(".o-mail-message");
    assert.strictEqual(parseInt($message[0].dataset.messageId), postedMessageId);
    assert.strictEqual($message.find(".o-mail-own-name").text(), "Mitchell Admin");
    assert.strictEqual($message.find(".o-mail-message-body").text(), "Test");
});

QUnit.test("starred: unstar all", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.message"].create([
        { body: "not empty", starred_partner_ids: [pyEnv.currentPartnerId] },
        { body: "not empty", starred_partner_ids: [pyEnv.currentPartnerId] },
    ]);
    const { openDiscuss } = await start({
        discuss: {
            params: {
                default_active_id: "mail.box_starred",
            },
        },
    });
    await openDiscuss();
    assert.strictEqual($(target).find('button[data-mailbox="starred"] .badge').text(), "2");
    assert.containsN(target, ".o-mail-message", 2);
    let $unstarAll = $(target).find('.o-mail-discuss-actions button[data-action="unstar-all"]');
    assert.notOk($unstarAll[0].disabled);

    await click($unstarAll);
    assert.containsNone(target, 'button[data-mailbox="starred"] .badge');
    assert.containsNone(target, ".o-mail-message");
    $unstarAll = $(target).find('.o-mail-discuss-actions button[data-action="unstar-all"]');
    assert.ok($unstarAll[0].disabled);
});

QUnit.test("auto-focus composer on opening thread", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({ name: "Demo User" });
    pyEnv["mail.channel"].create([
        { name: "General" },
        {
            channel_member_ids: [
                [0, 0, { partner_id: pyEnv.currentPartnerId }],
                [0, 0, { partner_id: resPartnerId1 }],
            ],
            channel_type: "chat",
        },
    ]);
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(target, 'button[data-mailbox="inbox"]');
    assert.hasClass($(target).find('button[data-mailbox="inbox"]'), "o-active");
    assert.containsOnce(target, ".o-mail-category-item:contains(General)");
    assert.doesNotHaveClass($(target).find(".o-mail-category-item:contains(General)"), "o-active");
    assert.containsOnce(target, ".o-mail-category-item:contains(Demo User)");
    assert.doesNotHaveClass(
        $(target).find(".o-mail-category-item:contains(Demo User)"),
        "o-active"
    );
    assert.containsNone(target, ".o-mail-composer");

    await click(".o-mail-category-item:contains(General)");
    assert.hasClass($(target).find(".o-mail-category-item:contains(General)"), "o-active");
    assert.containsOnce(target, ".o-mail-composer");
    assert.strictEqual(document.activeElement, target.querySelector(".o-mail-composer-textarea"));

    await click(".o-mail-category-item:contains(Demo User)");
    assert.hasClass($(target).find(".o-mail-category-item:contains(Demo User)"), "o-active");
    assert.containsOnce(target, ".o-mail-composer");
    assert.strictEqual(document.activeElement, target.querySelector(".o-mail-composer-textarea"));
});

QUnit.test(
    "receive new chat message: out of odoo focus (notification, channel)",
    async function (assert) {
        const pyEnv = await startServer();
        const mailChannelId1 = pyEnv["mail.channel"].create({ channel_type: "chat" });
        const { env, openDiscuss } = await start({
            services: {
                presence: makeFakePresenceService({ isOdooFocused: () => false }),
            },
        });
        await openDiscuss();
        env.services.bus_service.addEventListener("set_title_part", ({ detail: payload }) => {
            assert.step("set_title_part");
            assert.strictEqual(payload.part, "_chat");
            assert.strictEqual(payload.title, "1 Message");
        });
        const mailChannel1 = pyEnv["mail.channel"].searchRead([["id", "=", mailChannelId1]])[0];
        // simulate receiving a new message with odoo focused
        pyEnv["bus.bus"]._sendone(mailChannel1, "mail.channel/new_message", {
            id: mailChannelId1,
            message: {
                id: 126,
                model: "mail.channel",
                res_id: mailChannelId1,
            },
        });
        await nextTick();
        assert.verifySteps(["set_title_part"]);
    }
);

QUnit.test(
    "receive new chat message: out of odoo focus (notification, chat)",
    async function (assert) {
        const pyEnv = await startServer();
        const mailChannelId1 = pyEnv["mail.channel"].create({ channel_type: "chat" });
        const { env, openDiscuss } = await start({
            services: {
                presence: makeFakePresenceService({ isOdooFocused: () => false }),
            },
        });
        await openDiscuss();
        env.services.bus_service.addEventListener("set_title_part", ({ detail: payload }) => {
            assert.step("set_title_part");
            assert.strictEqual(payload.part, "_chat");
            assert.strictEqual(payload.title, "1 Message");
        });
        const mailChannel1 = pyEnv["mail.channel"].searchRead([["id", "=", mailChannelId1]])[0];
        // simulate receiving a new message with odoo focused
        pyEnv["bus.bus"]._sendone(mailChannel1, "mail.channel/new_message", {
            id: mailChannelId1,
            message: {
                id: 126,
                model: "mail.channel",
                res_id: mailChannelId1,
            },
        });
        await nextTick();
        assert.verifySteps(["set_title_part"]);
    }
);

QUnit.test("receive new chat messages: out of odoo focus (tab title)", async function (assert) {
    let step = 0;
    const pyEnv = await startServer();
    const [mailChannelId1, mailChannelId2] = pyEnv["mail.channel"].create([
        { channel_type: "chat" },
        { channel_type: "chat" },
    ]);
    const { env, openDiscuss } = await start({
        services: {
            presence: makeFakePresenceService({ isOdooFocused: () => false }),
        },
    });
    await openDiscuss();
    env.services.bus_service.addEventListener("set_title_part", ({ detail: payload }) => {
        step++;
        assert.step("set_title_part");
        assert.strictEqual(payload.part, "_chat");
        if (step === 1) {
            assert.strictEqual(payload.title, "1 Message");
        }
        if (step === 2) {
            assert.strictEqual(payload.title, "2 Messages");
        }
        if (step === 3) {
            assert.strictEqual(payload.title, "3 Messages");
        }
    });
    const mailChannel1 = pyEnv["mail.channel"].searchRead([["id", "=", mailChannelId1]])[0];
    // simulate receiving a new message in chat 1 with odoo focused
    pyEnv["bus.bus"]._sendone(mailChannel1, "mail.channel/new_message", {
        id: mailChannelId1,
        message: {
            id: 126,
            model: "mail.channel",
            res_id: mailChannelId1,
        },
    });
    await nextTick();
    assert.verifySteps(["set_title_part"]);

    const mailChannel2 = pyEnv["mail.channel"].searchRead([["id", "=", mailChannelId2]])[0];
    // simulate receiving a new message in chat 2 with odoo focused
    pyEnv["bus.bus"]._sendone(mailChannel2, "mail.channel/new_message", {
        id: mailChannelId2,
        message: {
            id: 127,
            model: "mail.channel",
            res_id: mailChannelId2,
        },
    });
    await nextTick();
    assert.verifySteps(["set_title_part"]);

    // simulate receiving another new message in chat 2 with odoo focused
    pyEnv["bus.bus"]._sendone(mailChannel2, "mail.channel/new_message", {
        id: mailChannelId2,
        message: {
            id: 128,
            model: "mail.channel",
            res_id: mailChannelId2,
        },
    });
    await nextTick();
    await nextTick();
    assert.verifySteps(["set_title_part"]);
});

QUnit.test("should auto-pin chat when receiving a new DM", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({ name: "Demo" });
    const resUsersId1 = pyEnv["res.users"].create({ partner_id: resPartnerId1 });
    pyEnv["mail.channel"].create({
        channel_member_ids: [
            [
                0,
                0,
                {
                    is_pinned: false,
                    partner_id: pyEnv.currentPartnerId,
                },
            ],
            [0, 0, { partner_id: resPartnerId1 }],
        ],
        channel_type: "chat",
        uuid: "channel11uuid",
    });
    const { env, openDiscuss } = await start();
    await openDiscuss();
    assert.containsNone(target, ".o-mail-category-item:contains(Demo)");

    // simulate receiving the first message on channel 11
    await afterNextRender(() =>
        env.services.rpc("/mail/chat_post", {
            context: {
                mockedUserId: resUsersId1,
            },
            message_content: "new message",
            uuid: "channel11uuid",
        })
    );
    assert.containsOnce(target, ".o-mail-category-item:contains(Demo)");
});

QUnit.test(
    "'Add Users' button should be displayed in the topbar of channels",
    async function (assert) {
        const pyEnv = await startServer();
        const mailChannelId1 = pyEnv["mail.channel"].create({
            name: "general",
            channel_type: "channel",
        });
        const { openDiscuss } = await start({
            discuss: {
                context: { active_id: `mail.channel_${mailChannelId1}` },
            },
        });
        await openDiscuss();
        assert.containsOnce(target, ".o-mail-discuss-actions button[data-action='add-users']");
    }
);

QUnit.test(
    "'Add Users' button should be displayed in the topbar of chats",
    async function (assert) {
        const pyEnv = await startServer();
        const resPartnerId1 = pyEnv["res.partner"].create({ name: "Marc Demo" });
        const mailChannelId1 = pyEnv["mail.channel"].create({
            channel_member_ids: [
                [0, 0, { partner_id: pyEnv.currentPartnerId }],
                [0, 0, { partner_id: resPartnerId1 }],
            ],
            channel_type: "chat",
        });
        const { openDiscuss } = await start({
            discuss: {
                context: { active_id: `mail.channel_${mailChannelId1}` },
            },
        });
        await openDiscuss();
        assert.containsOnce(target, ".o-mail-discuss-actions button[data-action='add-users']");
    }
);

QUnit.test(
    "'Add Users' button should be displayed in the topbar of groups",
    async function (assert) {
        const pyEnv = await startServer();
        const resPartnerId1 = pyEnv["res.partner"].create({ name: "Demo" });
        const mailChannelId1 = pyEnv["mail.channel"].create({
            channel_member_ids: [
                [0, 0, { partner_id: pyEnv.currentPartnerId }],
                [0, 0, { partner_id: resPartnerId1 }],
            ],
            channel_type: "group",
        });
        const { openDiscuss } = await start({
            discuss: {
                context: { active_id: `mail.channel_${mailChannelId1}` },
            },
        });
        await openDiscuss();
        assert.containsOnce(target, ".o-mail-discuss-actions button[data-action='add-users']");
    }
);

QUnit.test(
    "'Add Users' button should not be displayed in the topbar of mailboxes",
    async function (assert) {
        const { openDiscuss } = await start({
            discuss: {
                context: { active_id: "mail.box_starred" },
            },
        });
        await openDiscuss();
        assert.containsNone(target, ".o-mail-discuss-actions button[data-action='add-users']");
    }
);

QUnit.test(
    "'Hashtag' thread icon is displayed in top bar of channels of type 'channel' limited to a group",
    async function (assert) {
        const pyEnv = await startServer();
        const resGroupId1 = pyEnv["res.groups"].create({
            name: "testGroup",
        });
        const mailChannelId1 = pyEnv["mail.channel"].create({
            channel_type: "channel",
            name: "string",
            group_public_id: resGroupId1,
        });
        const { openDiscuss } = await start({
            discuss: {
                context: { active_id: `mail.channel_${mailChannelId1}` },
            },
        });
        await openDiscuss();
        assert.containsOnce(target, ".fa-hashtag");
    }
);

QUnit.test(
    "'Globe' thread icon is displayed in top bar of channels of type 'channel' not limited to any group",
    async function (assert) {
        const pyEnv = await startServer();
        const mailChannelId1 = pyEnv["mail.channel"].create({
            channel_type: "channel",
            name: "string",
            group_public_id: false,
        });
        const { openDiscuss } = await start({
            discuss: {
                context: { active_id: `mail.channel_${mailChannelId1}` },
            },
        });
        await openDiscuss();
        assert.containsOnce(target, ".fa-globe");
    }
);

QUnit.test(
    "Partner IM status is displayed as thread icon in top bar of channels of type 'chat'",
    async function (assert) {
        const pyEnv = await startServer();
        const [resPartnerId1, resPartnerId2, resPartnerId3, resPartnerId4] = pyEnv[
            "res.partner"
        ].create([
            { im_status: "online", name: "Michel Online" },
            { im_status: "offline", name: "Jacqueline Offline" },
            { im_status: "away", name: "Nabuchodonosor Away" },
            { im_status: "im_partner", name: "Robert Fired" },
        ]);
        pyEnv["mail.channel"].create([
            {
                channel_member_ids: [
                    [0, 0, { partner_id: pyEnv.currentPartnerId }],
                    [0, 0, { partner_id: resPartnerId1 }],
                ],
                channel_type: "chat",
            },
            {
                channel_member_ids: [
                    [0, 0, { partner_id: pyEnv.currentPartnerId }],
                    [0, 0, { partner_id: resPartnerId2 }],
                ],
                channel_type: "chat",
            },
            {
                channel_member_ids: [
                    [0, 0, { partner_id: pyEnv.currentPartnerId }],
                    [0, 0, { partner_id: resPartnerId3 }],
                ],
                channel_type: "chat",
            },
            {
                channel_member_ids: [
                    [0, 0, { partner_id: pyEnv.currentPartnerId }],
                    [0, 0, { partner_id: resPartnerId4 }],
                ],
                channel_type: "chat",
            },
            {
                channel_member_ids: [
                    [0, 0, { partner_id: pyEnv.currentPartnerId }],
                    [0, 0, { partner_id: TEST_USER_IDS.partnerRootId }],
                ],
                channel_type: "chat",
            },
        ]);
        const { openDiscuss } = await start();
        await openDiscuss();
        await click(".o-mail-category-item:contains('Michel Online')");
        assert.containsOnce(target, ".o-mail-discuss-content .o-mail-thread-icon-online");
        await click(".o-mail-category-item:contains('Jacqueline Offline')");
        assert.containsOnce(target, ".o-mail-discuss-content .o-mail-thread-icon-offline");
        await click(".o-mail-category-item:contains('Nabuchodonosor Away')");
        assert.containsOnce(target, ".o-mail-discuss-content .o-mail-thread-icon-away");
        await click(".o-mail-category-item:contains('Robert Fired')");
        assert.containsOnce(target, ".o-mail-discuss-content .o-mail-thread-icon-unknown");
        await click(".o-mail-category-item:contains('OdooBot')");
        assert.containsOnce(target, ".o-mail-discuss-content .o-mail-thread-icon-bot");
    }
);

QUnit.test(
    "'Users' thread icon is displayed in top bar of channels of type 'group'",
    async function (assert) {
        const pyEnv = await startServer();
        const mailChannelId1 = pyEnv["mail.channel"].create({
            channel_type: "group",
        });
        const { openDiscuss } = await start({
            discuss: {
                context: { active_id: `mail.channel_${mailChannelId1}` },
            },
        });
        await openDiscuss();
        assert.containsOnce(target, ".fa-users");
    }
);

QUnit.test("Do not trigger chat name server update when it is unchanged", async function (assert) {
    const pyEnv = await startServer();
    const mailChannelId = pyEnv["mail.channel"].create({
        channel_type: "chat",
    });
    const { openDiscuss } = await start({
        mockRPC(route, args, originalRPC) {
            if (args.method === "channel_set_custom_name") {
                assert.step(args.method);
            }
            return originalRPC(route, args);
        },
        discuss: {
            context: {
                active_id: `mail.channel_${mailChannelId}`,
            },
        },
    });
    await openDiscuss();
    await editInput(target, "input.o-mail-discuss-thread-name", "Mitchell Admin");
    await triggerEvent(target, "input.o-mail-discuss-thread-name", "keydown", {
        key: "Enter",
    });
    assert.verifySteps([]);
});

QUnit.test(
    "Do not trigger channel description server update when channel has no description and editing to empty description",
    async function (assert) {
        const pyEnv = await startServer();
        const mailChannelId = pyEnv["mail.channel"].create({
            name: "General",
        });
        const { openDiscuss } = await start({
            mockRPC(route, args, originalRPC) {
                if (args.method === "channel_change_description") {
                    assert.step(args.method);
                }
                return originalRPC(route, args);
            },
            discuss: {
                context: {
                    active_id: `mail.channel_${mailChannelId}`,
                },
            },
        });
        await openDiscuss();
        await editInput(target, "input.o-mail-discuss-thread-description", "");
        await triggerEvent(target, "input.o-mail-discuss-thread-description", "keydown", {
            key: "Enter",
        });
        assert.verifySteps([]);
    }
);

QUnit.test("Channel is added to discuss after invitation", async function (assert) {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({
        name: "General",
        channel_member_ids: [],
    });
    const userId = pyEnv["res.users"].create({ name: "Harry" });
    const { env, openDiscuss } = await start({
        services: {
            notification: makeFakeNotificationService((message) => assert.step(message)),
        },
    });
    await openDiscuss();
    assert.containsNone(target, ".o-mail-category-item:contains(General)");
    await afterNextRender(() => {
        env.services.orm.call("mail.channel", "add_members", [[channelId]], {
            partner_ids: [pyEnv.currentPartnerId],
            context: {
                mockedUserId: userId,
            },
        });
    });
    assert.containsOnce(target, ".o-mail-category-item:contains(General)");
    assert.verifySteps(["You have been invited to #General"]);
});

QUnit.test(
    "Chat is added to discuss on other tab that the one that joined",
    async function (assert) {
        const pyEnv = await startServer();
        const resPartnerId = pyEnv["res.partner"].create({ name: "Jerry Golay" });
        pyEnv["res.users"].create({ partner_id: resPartnerId });
        const tab1 = await start({ asTab: true });
        const tab2 = await start({ asTab: true });
        await tab1.openDiscuss();
        await tab2.openDiscuss();
        await tab1.click(".o-mail-category-chat .o-mail-category-add-button");
        await tab1.insertText(".o-mail-channel-selector-input", "Jer");
        await tab1.click(".o-mail-channel-selector-suggestion");
        await afterNextRender(() => triggerHotkey("Enter"));
        assert.containsOnce(tab1.target, ".o-mail-category-item:contains(Jerry Golay)");
        assert.containsOnce(tab2.target, ".o-mail-category-item:contains(Jerry Golay)");
    }
);
