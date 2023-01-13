/** @odoo-module **/

import { afterNextRender, click, start, startServer } from "@mail/../tests/helpers/test_utils";
import { editInput, getFixture } from "@web/../tests/helpers/utils";

let target;

QUnit.module("discuss sidebar", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test("toggling category button hide category items", async (assert) => {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({
        name: "general",
        channel_type: "channel",
    });
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(target, "button.o-active:contains('Inbox')");
    assert.containsOnce(target, ".o-mail-category-item");

    await click(".o-mail-category-icon");
    assert.containsNone(target, ".o-mail-category-item");
});

QUnit.test("toggling category button does not hide active category items", async (assert) => {
    const pyEnv = await startServer();
    const [mailChannelId] = pyEnv["mail.channel"].create([
        {
            name: "abc",
            channel_type: "channel",
        },
        {
            name: "def",
            channel_type: "channel",
        },
    ]);
    const { openDiscuss } = await start();
    await openDiscuss(mailChannelId);
    assert.containsN(target, ".o-mail-category-item", 2);
    assert.containsOnce(target, ".o-mail-category-item.o-active");

    await click(".o-mail-category-icon");
    assert.containsOnce(target, ".o-mail-category-item");
    assert.containsOnce(target, ".o-mail-category-item.o-active");
});

QUnit.test(
    "Closing a category sends the updated user setting to the server.",
    async function (assert) {
        const { openDiscuss } = await start({
            mockRPC(route, args) {
                if (route === "/web/dataset/call_kw/res.users.settings/set_res_users_settings") {
                    assert.step(route);
                    assert.strictEqual(
                        args.kwargs.new_settings.is_discuss_sidebar_category_channel_open,
                        false
                    );
                }
            },
        });
        await openDiscuss();
        await click(".o-mail-category-icon");
        assert.verifySteps(["/web/dataset/call_kw/res.users.settings/set_res_users_settings"]);
    }
);

QUnit.test(
    "Opening a category sends the updated user setting to the server.",
    async function (assert) {
        const pyEnv = await startServer();
        pyEnv["res.users.settings"].create({
            user_id: pyEnv.currentUserId,
            is_discuss_sidebar_category_channel_open: false,
        });
        const { openDiscuss } = await start({
            mockRPC(route, args) {
                if (route === "/web/dataset/call_kw/res.users.settings/set_res_users_settings") {
                    assert.step(route);
                    assert.strictEqual(
                        args.kwargs.new_settings.is_discuss_sidebar_category_channel_open,
                        true
                    );
                }
            },
        });
        await openDiscuss();
        await click(".o-mail-category-icon");
        assert.verifySteps(["/web/dataset/call_kw/res.users.settings/set_res_users_settings"]);
    }
);

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
        const { openDiscuss } = await start();
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
    const { openDiscuss } = await start();
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
    const { openDiscuss } = await start();
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
    const { openDiscuss } = await start();
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

QUnit.test("sidebar: show pinned channel", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({ name: "General" });
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-category-item:contains(General)");
});

QUnit.test("sidebar: open pinned channel", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({ name: "General" });
    const { openDiscuss } = await start();
    await openDiscuss();
    await click(".o-mail-category-item:contains(General)");
    assert.strictEqual($(target).find(".o-mail-discuss-thread-name").val(), "General");
    assert.containsOnce(
        target,
        ".o-mail-discuss-content .o-mail-composer-textarea[placeholder='Message #General…']"
    );
});

QUnit.test("sidebar: open channel and leave it", async function (assert) {
    const pyEnv = await startServer();
    const mailChannelId1 = pyEnv["mail.channel"].create({
        name: "General",
        channel_member_ids: [
            [
                0,
                0,
                {
                    fold_state: "open",
                    is_minimized: true,
                    partner_id: pyEnv.currentPartnerId,
                },
            ],
        ],
    });
    const { openDiscuss } = await start({
        async mockRPC(route, args) {
            if (args.method === "action_unfollow") {
                assert.step("action_unfollow");
                assert.deepEqual(args.args[0], mailChannelId1);
            }
        },
    });
    await openDiscuss();
    await click(".o-mail-category-item:contains(General)");
    assert.verifySteps([]);

    await click(
        ".o-mail-category-item:contains(General) .o-mail-commands .btn[title='Leave this channel']"
    );
    assert.verifySteps(["action_unfollow"]);
    assert.containsNone(target, ".o-mail-category-item:contains(General)");
    assert.notOk($(target).find(".o-mail-discuss-thread-name")?.val() === "General");
});

QUnit.test("sidebar: unpin channel from bus", async function (assert) {
    const pyEnv = await startServer();
    const mailChannelId = pyEnv["mail.channel"].create({ name: "General" });
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-category-item:contains(General)");

    await click(".o-mail-category-item:contains(General)");
    assert.strictEqual($(target).find(".o-mail-discuss-thread-name").val(), "General");

    // Simulate receiving a leave channel notification
    // (e.g. from user interaction from another device or browser tab)
    await afterNextRender(() => {
        pyEnv["bus.bus"]._sendone(pyEnv.currentPartner, "mail.channel/unpin", {
            id: mailChannelId,
        });
    });
    assert.containsNone(target, ".o-mail-category-item:contains(General)");
    assert.notOk($(target).find(".o-mail-discuss-thread-name")?.val() === "General");
});

QUnit.test("chat - channel should count unread message", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({
        name: "Demo",
        im_status: "offline",
    });
    const mailChannelId1 = pyEnv["mail.channel"].create({
        channel_member_ids: [
            [0, 0, { message_unread_counter: 1, partner_id: pyEnv.currentPartnerId }],
            [0, 0, { partner_id: resPartnerId1 }],
        ],
        channel_type: "chat",
    });
    pyEnv["mail.message"].create({
        author_id: resPartnerId1,
        body: "<p>Test</p>",
        model: "mail.channel",
        res_id: mailChannelId1,
    });
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-discuss-sidebar-counter");
    assert.strictEqual(target.querySelector(".o-mail-discuss-sidebar-counter").textContent, "1");

    await click(`.o-mail-category-item[data-channel-id="${mailChannelId1}"]`);
    assert.containsNone(target, ".o-mail-discuss-sidebar-counter");
});
