/** @odoo-module **/

import { start, startServer } from "@mail/../tests/helpers/test_utils";
import { Thread } from "@mail/new/core/thread_model";
import { Sidebar } from "@mail/new/discuss/sidebar";
import { click, editInput, getFixture, mount } from "@web/../tests/helpers/utils";
import { makeTestEnv, TestServer } from "../helpers/helpers";

let target;

QUnit.module("discuss sidebar", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test("toggling category button hide category items", async (assert) => {
    const server = new TestServer();
    server.addChannel(43, "abc");
    const env = makeTestEnv((route, params) => server.rpc(route, params));
    await mount(Sidebar, target, { env });

    assert.containsOnce(target, "button.o-active:contains('Inbox')");
    assert.containsN(target, ".o-mail-category-item", 1);
    await click(target.querySelector(".o-mail-category-icon"));
    assert.containsNone(target, ".o-mail-category-item");
});

QUnit.test("toggling category button does not hide active category items", async (assert) => {
    const server = new TestServer();
    server.addChannel(43, "abc");
    server.addChannel(46, "def");
    const env = makeTestEnv((route, params) => server.rpc(route, params));
    env.services["mail.messaging"].state.discuss.threadLocalId = Thread.createLocalId({
        model: "mail.channel",
        id: 43,
    }); // #abc is active

    await mount(Sidebar, target, { env });
    assert.containsN(target, ".o-mail-category-item", 2);
    assert.containsOnce(target, ".o-mail-category-item.o-active");
    await click(target.querySelector(".o-mail-category-icon"));
    assert.containsOnce(target, ".o-mail-category-item");
    assert.containsOnce(target, ".o-mail-category-item.o-active");
});

QUnit.test(
    "channel - command: should have view command when category is unfolded",
    async function (assert) {
        const { openDiscuss } = await start();
        await openDiscuss();
        assert.containsOnce(
            document.body,
            ".o-mail-category-channel i[title='View or join channels']"
        );
    }
);

QUnit.test(
    "channel - command: should have view command when category is folded",
    async function (assert) {
        const pyEnv = await startServer();
        pyEnv["res.users.settings"].create({
            user_id: pyEnv.currentUserId,
            is_discuss_sidebar_category_channel_open: false,
        });
        const { click, openDiscuss } = await start();
        await openDiscuss();
        await click(".o-mail-category-channel span:contains(Channels)");
        assert.containsOnce(
            document.body,
            ".o-mail-category-channel i[title='View or join channels']"
        );
    }
);

QUnit.test(
    "channel - command: should have add command when category is unfolded",
    async function (assert) {
        const { openDiscuss } = await start();
        await openDiscuss();
        assert.containsOnce(
            document.body,
            ".o-mail-category-channel i[title='Add or join a channel']"
        );
    }
);

QUnit.test(
    "channel - command: should not have add command when category is folded",
    async function (assert) {
        assert.expect(1);

        const pyEnv = await startServer();
        pyEnv["res.users.settings"].create({
            user_id: pyEnv.currentUserId,
            is_discuss_sidebar_category_channel_open: false,
        });
        const { openDiscuss } = await start();
        await openDiscuss();
        assert.containsNone(
            document.body,
            ".o-mail-category-channel i[title='Add or join a channel']"
        );
    }
);

QUnit.test("channel - states: close manually by clicking the title", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({ name: "general" });
    pyEnv["res.users.settings"].create({
        user_id: pyEnv.currentUserId,
        is_discuss_sidebar_category_channel_open: true,
    });
    const { click, openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(document.body, ".o-mail-category-item:contains(general)");
    await click(".o-mail-category-channel span:contains(Channels)");
    assert.containsNone(document.body, ".o-mail-category-item:contains(general)");
});

QUnit.test("channel - states: open manually by clicking the title", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({ name: "general" });
    pyEnv["res.users.settings"].create({
        user_id: pyEnv.currentUserId,
        is_discuss_sidebar_category_channel_open: false,
    });
    const { click, openDiscuss } = await start();
    await openDiscuss();
    assert.containsNone(document.body, ".o-mail-category-item:contains(general)");
    await click(".o-mail-category-channel span:contains(Channels)");
    assert.containsOnce(document.body, ".o-mail-category-item:contains(general)");
});

QUnit.test("sidebar: inbox with counter", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.notification"].create({
        notification_type: "inbox",
        res_partner_id: pyEnv.currentPartnerId,
    });
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(target, 'button[data-mailbox="inbox"] .badge:contains(1)');
});

QUnit.test("default thread rendering", async function (assert) {
    const pyEnv = await startServer();
    const mailChannelId1 = pyEnv["mail.channel"].create({ name: "" });
    const { click, openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(target, 'button[data-mailbox="inbox"]');
    assert.containsOnce(target, 'button[data-mailbox="starred"]');
    assert.containsOnce(target, 'button[data-mailbox="history"]');
    assert.containsOnce(target, `.o-mail-category-item[data-channel-id="${mailChannelId1}"]`);
    assert.hasClass($(target).find('button[data-mailbox="inbox"]'), "o-active");
    assert.containsOnce(
        target,
        '.o-mail-discuss-content [data-empty-thread=""]',
        "should have empty thread in inbox"
    );
    assert.strictEqual(
        $(target).find('.o-mail-discuss-content [data-empty-thread=""]').text().trim(),
        "Congratulations, your inbox is empty  New messages appear here."
    );

    await click('button[data-mailbox="starred"]');
    assert.hasClass($(target).find('button[data-mailbox="starred"]'), "o-active");
    assert.containsOnce(target, '.o-mail-discuss-content [data-empty-thread=""]');
    assert.strictEqual(
        $(target).find('.o-mail-discuss-content [data-empty-thread=""]').text().trim(),
        "No starred messages  You can mark any message as 'starred', and it shows up in this mailbox."
    );

    await click('button[data-mailbox="history"]');
    assert.hasClass($(target).find('button[data-mailbox="history"]'), "o-active");
    assert.containsOnce(target, '.o-mail-discuss-content [data-empty-thread=""]');
    assert.strictEqual(
        $(target)
            .find('.o-mail-discuss-content .o-mail-thread [data-empty-thread=""]')
            .text()
            .trim(),
        "No history messages  Messages marked as read will appear in the history."
    );

    await click(`.o-mail-category-item[data-channel-id="${mailChannelId1}"]`);
    assert.hasClass(
        $(target).find(`.o-mail-category-item[data-channel-id="${mailChannelId1}"]`),
        "o-active"
    );
    assert.containsOnce(target, '.o-mail-discuss-content [data-empty-thread=""]');
    assert.strictEqual(
        $(target).find('.o-mail-discuss-content [data-empty-thread=""]').text().trim(),
        "There are no messages in this conversation."
    );
});

QUnit.test("sidebar quick search at 20 or more pinned channels", async function (assert) {
    const pyEnv = await startServer();
    for (let id = 1; id <= 20; id++) {
        pyEnv["mail.channel"].create({ name: `channel${id}` });
    }
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsN(document.body, ".o-mail-category-item", 20);
    assert.containsOnce(
        document.body,
        ".o-mail-discuss-sidebar input[placeholder='Quick search...']"
    );

    await editInput(
        document.body,
        ".o-mail-discuss-sidebar input[placeholder='Quick search...']",
        "1"
    );
    assert.containsN(document.body, ".o-mail-category-item", 11);

    await editInput(
        document.body,
        ".o-mail-discuss-sidebar input[placeholder='Quick search...']",
        "12"
    );
    assert.containsOnce(document.body, ".o-mail-category-item");
    assert.containsOnce(document.body, ".o-mail-category-item:contains(channel12)");

    await editInput(
        document.body,
        ".o-mail-discuss-sidebar input[placeholder='Quick search...']",
        "123"
    );
    assert.containsNone(document.body, ".o-mail-category-item");
});

QUnit.test("sidebar: basic chat rendering", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({ name: "Demo" });
    const mailChannelId1 = pyEnv["mail.channel"].create({
        channel_member_ids: [
            [0, 0, { partner_id: pyEnv.currentPartnerId }],
            [0, 0, { partner_id: resPartnerId1 }],
        ],
        channel_type: "chat",
    });
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(target, `.o-mail-category-item[data-channel-id="${mailChannelId1}"]`);
    const $chat = $(target).find(`.o-mail-category-item[data-channel-id="${mailChannelId1}"]`);
    assert.containsOnce($chat, "img[data-alt='Thread Image']");
    assert.containsOnce($chat, "span:contains(Demo)");
    assert.containsOnce($chat, ".o-mail-commands");
    assert.containsOnce($chat, ".o-mail-commands div[title='Unpin Conversation']");
    assert.containsNone($chat, ".badge");
});
