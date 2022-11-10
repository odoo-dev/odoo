/** @odoo-module **/

import { patchUiSize, SIZES } from "@mail/../tests/helpers/patch_ui_size";
import {
    afterNextRender,
    nextAnimationFrame,
    start,
    startServer,
} from "@mail/../tests/helpers/test_utils";
import { getFixture, triggerHotkey } from "@web/../tests/helpers/utils";

let target;
QUnit.module("chat window", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test(
    "Mobile: chat window shouldn't open automatically after receiving a new message",
    async function (assert) {
        const pyEnv = await startServer();
        const resPartnerId1 = pyEnv["res.partner"].create({ name: "Demo" });
        const resUsersId1 = pyEnv["res.users"].create({ partner_id: resPartnerId1 });
        pyEnv["mail.channel"].records = [
            {
                channel_member_ids: [
                    [0, 0, { partner_id: pyEnv.currentPartnerId }],
                    [0, 0, { partner_id: resPartnerId1 }],
                ],
                channel_type: "chat",
                id: resPartnerId1,
                uuid: "channel-10-uuid",
            },
        ];
        patchUiSize({ size: SIZES.SM });
        const { messaging } = await start();

        // simulate receiving a message
        messaging.rpc({
            route: "/mail/chat_post",
            params: {
                context: {
                    mockedUserId: resUsersId1,
                },
                message_content: "hu",
                uuid: "channel-10-uuid",
            },
        });
        await nextAnimationFrame();
        assert.containsNone(target, ".o-mail-chat-window");
    }
);

QUnit.test(
    'chat window: post message on channel with "CTRL-Enter" keyboard shortcut for small screen size',
    async function (assert) {
        const pyEnv = await startServer();
        pyEnv["mail.channel"].create({
            channel_member_ids: [
                [
                    0,
                    0,
                    {
                        is_minimized: true,
                        partner_id: pyEnv.currentPartnerId,
                    },
                ],
            ],
        });
        patchUiSize({ size: SIZES.SM });
        const { click, insertText } = await start();
        await click(".o_menu_systray i[aria-label='Messages']");
        await click(".o-mail-messaging-menu .o-mail-notification-item");
        await insertText(".o-mail-chat-window .o-mail-composer-textarea", "Test");
        await afterNextRender(() => triggerHotkey("control+Enter"));
        assert.containsOnce(document.body, ".o-mail-message");
    }
);

QUnit.test("load messages from opening chat window from messaging menu", async function (assert) {
    const pyEnv = await startServer();
    const mailChannelId1 = pyEnv["mail.channel"].create({
        channel_type: "channel",
        group_public_id: false,
        name: "General",
    });
    for (let i = 0; i <= 20; i++) {
        pyEnv["mail.message"].create({
            body: "not empty",
            model: "mail.channel",
            res_id: mailChannelId1,
        });
    }
    const { click } = await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    await click(".o-mail-messaging-menu .o-mail-notification-item");
    assert.containsN(target, ".o-mail-message", 21);
});

QUnit.test("chat window: basic rendering", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({ name: "General" });
    const { click } = await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    await click(".o-mail-messaging-menu .o-mail-notification-item");
    assert.containsOnce(target, ".o-mail-chat-window");
    assert.containsOnce(target, ".o-mail-chat-window-header");
    assert.containsOnce($(target).find(".o-mail-chat-window-header"), ".o-mail-chatwindow-icon");
    assert.containsOnce(target, ".o-mail-chat-window-header-name:contains(General)");
    assert.containsN(target, ".o-mail-command", 5);
    assert.containsOnce(target, ".o-mail-command[title='Start a Call']");
    assert.containsOnce(target, ".o-mail-command[title='Show Member List']");
    assert.containsOnce(target, ".o-mail-command[title='Show Call Settings']");
    assert.containsOnce(target, ".o-mail-command[title='Open in Discuss']");
    assert.containsOnce(target, ".o-mail-command[title='Close chat window']");
    assert.containsOnce(target, ".o-mail-chat-window-content .o-mail-thread");
    assert.strictEqual(
        $(target).find(".o-mail-chat-window-content .o-mail-thread").text().trim(),
        "There are no messages in this conversation."
    );
});

QUnit.test(
    "Mobile: opening a chat window should not update channel state on the server",
    async function (assert) {
        const pyEnv = await startServer();
        const mailChannelId1 = pyEnv["mail.channel"].create({
            channel_member_ids: [
                [
                    0,
                    0,
                    {
                        fold_state: "closed",
                        partner_id: pyEnv.currentPartnerId,
                    },
                ],
            ],
        });
        patchUiSize({ size: SIZES.SM });
        const { click } = await start();
        await click(".o_menu_systray i[aria-label='Messages']");
        await click(".o-mail-messaging-menu .o-mail-notification-item");
        const [member] = pyEnv["mail.channel.member"].searchRead([
            ["channel_id", "=", mailChannelId1],
            ["partner_id", "=", pyEnv.currentPartnerId],
        ]);
        assert.strictEqual(member.fold_state, "closed");
    }
);

QUnit.test("chat window: fold", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({});
    const { click } = await start({
        mockRPC(route, args) {
            if (args.method === "channel_fold") {
                assert.step(`rpc:${args.method}/${args.kwargs.state}`);
            }
        },
    });
    // Open Thread
    await click("button i[aria-label='Messages']");
    await click(".o-mail-notification-item");
    assert.containsOnce(target, ".o-mail-chat-window .o-mail-thread");
    assert.verifySteps(["rpc:channel_fold/open"]);

    // Fold chat window
    await click(".o-mail-chat-window-header");
    assert.verifySteps(["rpc:channel_fold/folded"]);
    assert.containsNone(target, ".o-mail-chat-window .o-mail-thread");

    // Unfold chat window
    await click(".o-mail-chat-window-header");
    assert.verifySteps(["rpc:channel_fold/open"]);
    assert.containsOnce(target, ".o-mail-chat-window .o-mail-thread");
});

QUnit.test("chat window: open / close", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({});
    const { click } = await start({
        mockRPC(route, args) {
            if (args.method === "channel_fold") {
                assert.step(`rpc:channel_fold/${args.kwargs.state}`);
            }
        },
    });
    assert.containsNone(target, ".o-mail-chat-window");
    await click("button i[aria-label='Messages']");
    await click(".o-mail-notification-item");
    assert.containsOnce(target, ".o-mail-chat-window");
    assert.verifySteps(["rpc:channel_fold/open"]);

    // Close chat window
    await click(".o-mail-command[title='Close chat window']");
    assert.containsNone(target, ".o-mail-chat-window");
    assert.verifySteps(["rpc:channel_fold/closed"]);

    // Reopen chat window
    await click("button i[aria-label='Messages']");
    await click(".o-mail-notification-item");
    assert.containsOnce(target, ".o-mail-chat-window");
    assert.verifySteps(["rpc:channel_fold/open"]);
});

QUnit.test(
    "Mobile: closing a chat window should not update channel state on the server",
    async function (assert) {
        const pyEnv = await startServer();
        const mailChannelId1 = pyEnv["mail.channel"].create({
            channel_member_ids: [
                [
                    0,
                    0,
                    {
                        fold_state: "open",
                        partner_id: pyEnv.currentPartnerId,
                    },
                ],
            ],
        });
        patchUiSize({ size: SIZES.SM });
        const { click } = await start();
        await click("button i[aria-label='Messages']");
        await click(".o-mail-notification-item");
        assert.containsOnce(target, ".o-mail-chat-window");
        // Close chat window
        await click(".o-mail-command[title='Close chat window']");
        assert.containsNone(target, ".o-mail-chat-window");
        const [member] = pyEnv["mail.channel.member"].searchRead([
            ["channel_id", "=", mailChannelId1],
            ["partner_id", "=", pyEnv.currentPartnerId],
        ]);
        assert.strictEqual(member.fold_state, "open");
    }
);

QUnit.test("chat window: close on ESCAPE", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({
        channel_member_ids: [
            [
                0,
                0,
                {
                    is_minimized: true,
                    partner_id: pyEnv.currentPartnerId,
                },
            ],
        ],
    });
    const { click } = await start({
        mockRPC(route, args) {
            if (args.method === "channel_fold") {
                assert.step(`rpc:channel_fold/${args.kwargs.state}`);
            }
        },
    });
    assert.containsOnce(target, ".o-mail-chat-window");
    click(".o-mail-composer-textarea").catch(() => {});
    await afterNextRender(() => triggerHotkey("Escape"));
    assert.containsNone(target, ".o-mail-chat-window");
    assert.verifySteps(["rpc:channel_fold/closed"]);
});
