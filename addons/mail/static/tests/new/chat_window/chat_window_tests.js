/** @odoo-module **/

import { patchUiSize, SIZES } from "@mail/../tests/helpers/patch_ui_size";
import {
    afterNextRender,
    click,
    createFile,
    insertText,
    isScrolledToBottom,
    nextAnimationFrame,
    start,
    startServer,
    waitUntil,
} from "@mail/../tests/helpers/test_utils";
import {
    CHAT_WINDOW_END_GAP_WIDTH,
    CHAT_WINDOW_INBETWEEN_WIDTH,
    CHAT_WINDOW_WIDTH,
} from "@mail/new/web/chat_window/chat_window_service";
import { nextTick, triggerEvent, triggerHotkey } from "@web/../tests/helpers/utils";
import { file } from "web.test_utils";
const { inputFiles } = file;

QUnit.module("chat window");

QUnit.test(
    "Mobile: chat window shouldn't open automatically after receiving a new message",
    async (assert) => {
        const pyEnv = await startServer();
        const partnerId = pyEnv["res.partner"].create({ name: "Demo" });
        const userId = pyEnv["res.users"].create({ partner_id: partnerId });
        pyEnv["mail.channel"].records = [
            {
                channel_member_ids: [
                    [0, 0, { partner_id: pyEnv.currentPartnerId }],
                    [0, 0, { partner_id: partnerId }],
                ],
                channel_type: "chat",
                id: partnerId,
                uuid: "channel-10-uuid",
            },
        ];
        patchUiSize({ size: SIZES.SM });
        const { env } = await start();

        // simulate receiving a message
        env.services.rpc("/mail/chat_post", {
            context: { mockedUserId: userId },
            message_content: "hu",
            uuid: "channel-10-uuid",
        });
        await nextAnimationFrame();
        assert.containsNone($, ".o-ChatWindow");
    }
);

QUnit.test(
    'chat window: post message on channel with "CTRL-Enter" keyboard shortcut for small screen size',
    async (assert) => {
        const pyEnv = await startServer();
        pyEnv["mail.channel"].create({
            channel_member_ids: [
                [0, 0, { is_minimized: true, partner_id: pyEnv.currentPartnerId }],
            ],
        });
        patchUiSize({ size: SIZES.SM });
        await start();
        await click(".o_menu_systray i[aria-label='Messages']");
        await click(".o-NotificationItem");
        await insertText(".o-ChatWindow .o-Composer-input", "Test");
        await afterNextRender(() => triggerHotkey("control+Enter"));
        assert.containsOnce($, ".o-Message");
    }
);

QUnit.test("load messages from opening chat window from messaging menu", async (assert) => {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({
        channel_type: "channel",
        group_public_id: false,
        name: "General",
    });
    for (let i = 0; i <= 20; i++) {
        pyEnv["mail.message"].create({
            body: "not empty",
            model: "mail.channel",
            res_id: channelId,
        });
    }
    await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    await click(".o-NotificationItem");
    assert.containsN($, ".o-Message", 21);
});

QUnit.test("chat window: basic rendering", async (assert) => {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({ name: "General" });
    await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    await click(".o-NotificationItem");
    assert.containsOnce($, ".o-ChatWindow");
    assert.containsOnce($, ".o-ChatWindow-header");
    assert.containsOnce($(".o-ChatWindow-header"), ".o-ThreadIcon");
    assert.containsOnce($, ".o-ChatWindow-name:contains(General)");
    assert.containsN($, ".o-ChatWindow-command", 5);
    assert.containsOnce($, ".o-ChatWindow-command[title='Start a Call']");
    assert.containsOnce($, ".o-ChatWindow-command[title='Show Member List']");
    assert.containsOnce($, ".o-ChatWindow-command[title='Show Call Settings']");
    assert.containsOnce($, ".o-ChatWindow-command[title='Open in Discuss']");
    assert.containsOnce($, ".o-ChatWindow-command[title='Close chat window']");
    assert.containsOnce($, ".o-ChatWindow-content .o-Thread");
    assert.strictEqual(
        $(".o-ChatWindow-content .o-Thread").text().trim(),
        "There are no messages in this conversation."
    );
});

QUnit.test(
    "Mobile: opening a chat window should not update channel state on the server",
    async (assert) => {
        const pyEnv = await startServer();
        const channelId = pyEnv["mail.channel"].create({
            channel_member_ids: [
                [0, 0, { fold_state: "closed", partner_id: pyEnv.currentPartnerId }],
            ],
        });
        patchUiSize({ size: SIZES.SM });
        await start();
        await click(".o_menu_systray i[aria-label='Messages']");
        await click(".o-NotificationItem");
        const [member] = pyEnv["mail.channel.member"].searchRead([
            ["channel_id", "=", channelId],
            ["partner_id", "=", pyEnv.currentPartnerId],
        ]);
        assert.strictEqual(member.fold_state, "closed");
    }
);

QUnit.test("chat window: fold", async (assert) => {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({});
    await start({
        mockRPC(route, args) {
            if (args.method === "channel_fold") {
                assert.step(`rpc:${args.method}/${args.kwargs.state}`);
            }
        },
    });
    // Open Thread
    await click("button i[aria-label='Messages']");
    await click(".o-NotificationItem");
    assert.containsOnce($, ".o-ChatWindow .o-Thread");
    assert.verifySteps(["rpc:channel_fold/open"]);

    // Fold chat window
    await click(".o-ChatWindow-header");
    assert.verifySteps(["rpc:channel_fold/folded"]);
    assert.containsNone($, ".o-ChatWindow .o-Thread");

    // Unfold chat window
    await click(".o-ChatWindow-header");
    assert.verifySteps(["rpc:channel_fold/open"]);
    assert.containsOnce($, ".o-ChatWindow .o-Thread");
});

QUnit.test("chat window: open / close", async (assert) => {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({});
    await start({
        mockRPC(route, args) {
            if (args.method === "channel_fold") {
                assert.step(`rpc:channel_fold/${args.kwargs.state}`);
            }
        },
    });
    assert.containsNone($, ".o-ChatWindow");
    await click("button i[aria-label='Messages']");
    await click(".o-NotificationItem");
    assert.containsOnce($, ".o-ChatWindow");
    assert.verifySteps(["rpc:channel_fold/open"]);

    // Close chat window
    await click(".o-ChatWindow-command[title='Close chat window']");
    assert.containsNone($, ".o-ChatWindow");
    assert.verifySteps(["rpc:channel_fold/closed"]);

    // Reopen chat window
    await click("button i[aria-label='Messages']");
    await click(".o-NotificationItem");
    assert.containsOnce($, ".o-ChatWindow");
    assert.verifySteps(["rpc:channel_fold/open"]);
});

QUnit.test(
    "Mobile: closing a chat window should not update channel state on the server",
    async (assert) => {
        const pyEnv = await startServer();
        const channelId = pyEnv["mail.channel"].create({
            channel_member_ids: [
                [0, 0, { fold_state: "open", partner_id: pyEnv.currentPartnerId }],
            ],
        });
        patchUiSize({ size: SIZES.SM });
        await start();
        await click("button i[aria-label='Messages']");
        await click(".o-NotificationItem");
        assert.containsOnce($, ".o-ChatWindow");
        // Close chat window
        await click(".o-ChatWindow-command[title='Close chat window']");
        assert.containsNone($, ".o-ChatWindow");
        const [member] = pyEnv["mail.channel.member"].searchRead([
            ["channel_id", "=", channelId],
            ["partner_id", "=", pyEnv.currentPartnerId],
        ]);
        assert.strictEqual(member.fold_state, "open");
    }
);

QUnit.test("chat window: close on ESCAPE", async (assert) => {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({
        channel_member_ids: [[0, 0, { is_minimized: true, partner_id: pyEnv.currentPartnerId }]],
    });
    await start({
        mockRPC(route, args) {
            if (args.method === "channel_fold") {
                assert.step(`rpc:channel_fold/${args.kwargs.state}`);
            }
        },
    });
    assert.containsOnce($, ".o-ChatWindow");

    $(".o-Composer-input")[0].focus();
    await afterNextRender(() => triggerHotkey("Escape"));
    assert.containsNone($, ".o-ChatWindow");
    assert.verifySteps(["rpc:channel_fold/closed"]);
});

QUnit.test(
    "Close composer suggestions in chat window with ESCAPE does not also close the chat window",
    async (assert) => {
        const pyEnv = await startServer();
        const partnerId = pyEnv["res.partner"].create({
            email: "testpartner@odoo.com",
            name: "TestPartner",
        });
        pyEnv["res.users"].create({ partner_id: partnerId });
        pyEnv["mail.channel"].create({
            name: "general",
            channel_member_ids: [
                [0, 0, { partner_id: pyEnv.currentPartnerId, is_minimized: true }],
                [0, 0, { partner_id: partnerId }],
            ],
        });
        await start();
        await insertText(".o-Composer-input", "@");
        await afterNextRender(() => triggerHotkey("Escape"));
        assert.containsOnce($, ".o-ChatWindow");
    }
);

QUnit.test(
    "Close emoji picker in chat window with ESCAPE does not also close the chat window",
    async (assert) => {
        const pyEnv = await startServer();
        pyEnv["mail.channel"].create({
            name: "general",
            channel_member_ids: [
                [0, 0, { partner_id: pyEnv.currentPartnerId, is_minimized: true }],
            ],
        });
        await start();
        await click("button[aria-label='Emojis']");
        await afterNextRender(() => triggerHotkey("Escape"));
        assert.containsNone($, ".o-EmojiPicker");
        assert.containsOnce($, ".o-ChatWindow");
    }
);

QUnit.test("open 2 different chat windows: enough screen width [REQUIRE FOCUS]", async (assert) => {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create([{ name: "Channel_1" }, { name: "Channel_2" }]);
    patchUiSize({ width: 1920 });
    assert.ok(
        CHAT_WINDOW_END_GAP_WIDTH * 2 + CHAT_WINDOW_WIDTH * 2 + CHAT_WINDOW_INBETWEEN_WIDTH < 1920,
        "should have enough space to open 2 chat windows simultaneously"
    );
    await start();
    await click("button i[aria-label='Messages']");
    await click(".o-NotificationItem:contains(Channel_1)");
    assert.containsOnce($, ".o-ChatWindow");
    assert.containsOnce($, ".o-ChatWindow-header:contains(Channel_1)");
    assert.strictEqual(
        document.activeElement,
        $(".o-ChatWindow-header:contains(Channel_1)")
            .closest(".o-ChatWindow")
            .find(".o-Composer-input")[0]
    );

    await click("button i[aria-label='Messages']");
    await click(".o-NotificationItem:contains(Channel_2)");
    assert.containsN($, ".o-ChatWindow", 2);
    assert.containsOnce($, ".o-ChatWindow-header:contains(Channel_2)");
    assert.containsOnce($, ".o-ChatWindow-header:contains(Channel_1)");
    assert.strictEqual(
        document.activeElement,
        $(".o-ChatWindow-header:contains(Channel_2)")
            .closest(".o-ChatWindow")
            .find(".o-Composer-input")[0]
    );
});

QUnit.test("open 3 different chat windows: not enough screen width", async (assert) => {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create([
        { name: "Channel_1" },
        { name: "Channel_2" },
        { name: "Channel_3" },
    ]);
    patchUiSize({ width: 900 });
    assert.ok(
        CHAT_WINDOW_END_GAP_WIDTH * 2 + CHAT_WINDOW_WIDTH * 2 + CHAT_WINDOW_INBETWEEN_WIDTH < 900,
        "should have enough space to open 2 chat windows simultaneously"
    );
    assert.ok(
        CHAT_WINDOW_END_GAP_WIDTH * 2 + CHAT_WINDOW_WIDTH * 3 + CHAT_WINDOW_INBETWEEN_WIDTH * 2 >
            900,
        "should not have enough space to open 3 chat windows simultaneously"
    );
    await start();

    // open, from systray menu, chat windows of channels with Id 1, 2, then 3
    await click("button i[aria-label='Messages']");
    await click(".o-NotificationItem:contains(Channel_1)");
    assert.containsOnce($, ".o-ChatWindow");
    assert.containsNone($, ".o-ChatWindowHiddenToggler");

    await click("button i[aria-label='Messages']");
    await click(".o-NotificationItem:contains(Channel_2)");
    assert.containsN($, ".o-ChatWindow", 2);
    assert.containsNone($, ".o-ChatWindowHiddenToggler");

    await click("button i[aria-label='Messages']");
    await click(".o-NotificationItem:contains(Channel_3)");
    assert.containsN($, ".o-ChatWindow", 2);
    assert.containsOnce($, ".o-ChatWindowHiddenToggler");
    assert.containsOnce($, ".o-ChatWindow-header:contains(Channel_1)");
    assert.containsOnce($, ".o-ChatWindow-header:contains(Channel_3)");
    assert.strictEqual(
        document.activeElement,
        $(".o-ChatWindow-header:contains(Channel_3)")
            .closest(".o-ChatWindow")
            .find(".o-Composer-input")[0]
    );
});

QUnit.test(
    "focus next visible chat window when closing current chat window with ESCAPE [REQUIRE FOCUS]",
    async (assert) => {
        const pyEnv = await startServer();
        pyEnv["mail.channel"].create([
            {
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
            },
            {
                name: "MyTeam",
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
            },
        ]);
        patchUiSize({ width: 1920 });
        assert.ok(
            CHAT_WINDOW_END_GAP_WIDTH * 2 + CHAT_WINDOW_WIDTH * 2 + CHAT_WINDOW_INBETWEEN_WIDTH <
                1920,
            "should have enough space to open 2 chat windows simultaneously"
        );
        await start();
        assert.containsN($, ".o-ChatWindow .o-Composer-input", 2);

        $(".o-ChatWindow-name:contains(MyTeam)")
            .closest(".o-ChatWindow")
            .find(".o-Composer-input")[0]
            .focus();
        await afterNextRender(() => triggerHotkey("Escape"));
        assert.containsOnce($, ".o-ChatWindow");
        assert.strictEqual(
            document.activeElement,
            $(".o-ChatWindow-name:contains(General)")
                .closest(".o-ChatWindow")
                .find(".o-Composer-input")[0]
        );
    }
);

QUnit.test("chat window: switch on TAB", async (assert) => {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create([{ name: "channel1" }, { name: "channel2" }]);
    patchUiSize({ width: 1920 });
    assert.ok(
        CHAT_WINDOW_END_GAP_WIDTH * 2 + CHAT_WINDOW_WIDTH * 2 + CHAT_WINDOW_INBETWEEN_WIDTH < 1920,
        "should have enough space to open 2 chat windows simultaneously"
    );
    await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    await click(".o-NotificationItem:contains(channel1)");
    assert.containsOnce($, ".o-ChatWindow");
    assert.containsOnce($, ".o-ChatWindow-name:contains(channel1)");
    assert.strictEqual(
        document.activeElement,
        $(".o-ChatWindow-name:contains(channel1)")
            .closest(".o-ChatWindow")
            .find(".o-Composer-input")[0]
    );

    await afterNextRender(() => triggerHotkey("Tab"));
    assert.strictEqual(
        document.activeElement,
        $(".o-ChatWindow-name:contains(channel1)")
            .closest(".o-ChatWindow")
            .find(".o-Composer-input")[0]
    );

    await click(".o_menu_systray i[aria-label='Messages']");
    await click(".o-NotificationItem:contains(channel2)");
    assert.containsN($, ".o-ChatWindow", 2);
    assert.containsOnce($, ".o-ChatWindow-name:contains(channel1)");
    assert.containsOnce($, ".o-ChatWindow-name:contains(channel2)");
    assert.strictEqual(
        document.activeElement,
        $(".o-ChatWindow-name:contains(channel2)")
            .closest(".o-ChatWindow")
            .find(".o-Composer-input")[0]
    );

    await afterNextRender(() => triggerHotkey("Tab"));
    assert.containsN($, ".o-ChatWindow", 2);
    assert.strictEqual(
        document.activeElement,
        $(".o-ChatWindow-name:contains(channel1)")
            .closest(".o-ChatWindow")
            .find(".o-Composer-input")[0]
    );
});

QUnit.test("chat window: TAB cycle with 3 open chat windows [REQUIRE FOCUS]", async (assert) => {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create([
        {
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
        },
        {
            name: "MyTeam",
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
        },
        {
            name: "MyProject",
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
        },
    ]);
    patchUiSize({ width: 1920 });
    assert.ok(
        CHAT_WINDOW_END_GAP_WIDTH * 3 + CHAT_WINDOW_WIDTH * 3 + CHAT_WINDOW_INBETWEEN_WIDTH * 2 <
            1920,
        "should have enough space to open 3 chat windows simultaneously"
    );
    await start();
    // FIXME: assumes ordering: MyProject, MyTeam, General
    assert.containsN($, ".o-ChatWindow .o-Composer-input", 3);

    $(".o-ChatWindow-name:contains(MyProject)")
        .closest(".o-ChatWindow")
        .find(".o-Composer-input")[0]
        .focus();
    await afterNextRender(() => triggerHotkey("Tab"));
    assert.strictEqual(
        document.activeElement,
        $(".o-ChatWindow-name:contains(MyTeam)")
            .closest(".o-ChatWindow")
            .find(".o-Composer-input")[0]
    );

    await afterNextRender(() => triggerHotkey("Tab"));
    assert.strictEqual(
        document.activeElement,
        $(".o-ChatWindow-name:contains(General)")
            .closest(".o-ChatWindow")
            .find(".o-Composer-input")[0]
    );

    await afterNextRender(() => triggerHotkey("Tab"));
    assert.strictEqual(
        document.activeElement,
        $(".o-ChatWindow-name:contains(MyProject)")
            .closest(".o-ChatWindow")
            .find(".o-Composer-input")[0]
    );
});

QUnit.test(
    "new message separator is shown in a chat window of a chat on receiving new message if there is a history of conversation",
    async (assert) => {
        const pyEnv = await startServer();
        const partnerId = pyEnv["res.partner"].create({ name: "Demo" });
        const userId = pyEnv["res.users"].create({ name: "Foreigner user", partner_id: partnerId });
        const channelId = pyEnv["mail.channel"].create({
            channel_member_ids: [
                [
                    0,
                    0,
                    {
                        is_minimized: true,
                        is_pinned: false,
                        partner_id: pyEnv.currentPartnerId,
                    },
                ],
                [0, 0, { partner_id: partnerId }],
            ],
            channel_type: "chat",
            uuid: "channel-10-uuid",
        });
        const messageId = pyEnv["mail.message"].create({
            body: "not empty",
            model: "mail.channel",
            res_id: channelId,
        });
        const [memberId] = pyEnv["mail.channel.member"].search([
            ["channel_id", "=", channelId],
            ["partner_id", "=", pyEnv.currentPartnerId],
        ]);
        pyEnv["mail.channel.member"].write([memberId], { seen_message_id: messageId });
        const { env } = await start();
        // simulate receiving a message
        await afterNextRender(async () =>
            env.services.rpc("/mail/chat_post", {
                context: { mockedUserId: userId },
                message_content: "hu",
                uuid: "channel-10-uuid",
            })
        );
        assert.containsOnce($, ".o-ChatWindow");
        assert.containsN($, ".o-Message", 2);
        assert.containsOnce($, "hr + span:contains(New messages)");
    }
);

QUnit.test(
    "new message separator is not shown in a chat window of a chat on receiving new message if there is no history of conversation",
    async (assert) => {
        const pyEnv = await startServer();
        const partnerId = pyEnv["res.partner"].create({ name: "Demo" });
        const userId = pyEnv["res.users"].create({
            name: "Foreigner user",
            partner_id: partnerId,
        });
        pyEnv["mail.channel"].create({
            channel_member_ids: [
                [0, 0, { partner_id: pyEnv.currentPartnerId }],
                [0, 0, { partner_id: partnerId }],
            ],
            channel_type: "chat",
            uuid: "channel-10-uuid",
        });
        const { env } = await start();
        // simulate receiving a message
        await afterNextRender(async () =>
            env.services.rpc("/mail/chat_post", {
                context: { mockedUserId: userId },
                message_content: "hu",
                uuid: "channel-10-uuid",
            })
        );
        assert.containsNone($, "hr + span:contains(New messages)");
    }
);

QUnit.test("chat window should open when receiving a new DM", async (assert) => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    const userId = pyEnv["res.users"].create({ partner_id: partnerId });
    pyEnv["mail.channel"].create({
        channel_member_ids: [
            [0, 0, { is_pinned: false, partner_id: pyEnv.currentPartnerId }],
            [0, 0, { partner_id: partnerId }],
        ],
        channel_type: "chat",
        uuid: "channel-uuid",
    });
    const { env } = await start();
    // simulate receiving the first message on chat
    await afterNextRender(() =>
        env.services.rpc("/mail/chat_post", {
            context: {
                mockedUserId: userId,
            },
            message_content: "new message",
            uuid: "channel-uuid",
        })
    );
    assert.containsOnce($, ".o-ChatWindow");
});

QUnit.test(
    "chat window should scroll to the newly posted message just after posting it",
    async (assert) => {
        const pyEnv = await startServer();
        const channelId = pyEnv["mail.channel"].create({
            channel_member_ids: [
                [
                    0,
                    0,
                    { fold_state: "open", is_minimized: true, partner_id: pyEnv.currentPartnerId },
                ],
            ],
        });
        for (let i = 0; i < 10; i++) {
            pyEnv["mail.message"].create({
                body: "not empty",
                model: "mail.channel",
                res_id: channelId,
            });
        }
        await start();
        await insertText(".o-Composer-input", "WOLOLO");
        await afterNextRender(() =>
            triggerEvent(document.body, ".o-Composer-input", "keydown", {
                key: "Enter",
            })
        );
        assert.ok(isScrolledToBottom($(".o-Thread")[0]));
    }
);

QUnit.test("chat window should remain folded when new message is received", async (assert) => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ name: "Demo" });
    const userId = pyEnv["res.users"].create({
        name: "Foreigner user",
        partner_id: partnerId,
    });
    pyEnv["mail.channel"].create({
        channel_member_ids: [
            [
                0,
                0,
                {
                    fold_state: "folded",
                    is_minimized: true,
                    partner_id: pyEnv.currentPartnerId,
                },
            ],
            [0, 0, { partner_id: partnerId }],
        ],
        channel_type: "chat",
        uuid: "channel-uuid",
    });
    const { env } = await start();
    assert.hasClass($(".o-ChatWindow"), "o-folded");

    env.services.rpc("/mail/chat_post", {
        context: { mockedUserId: userId },
        message_content: "New Message",
        uuid: "channel-uuid",
    });
    await nextTick();
    assert.hasClass($(".o-ChatWindow"), "o-folded");
});

QUnit.test(
    "should not have chat window hidden menu in mobile (transition from 3 chat windows in desktop to mobile)",
    async (assert) => {
        const pyEnv = await startServer();
        pyEnv["mail.channel"].create([
            { name: "Channel-1" },
            { name: "Channel-2" },
            { name: "Channel-3" },
        ]);
        patchUiSize({ width: 900 });
        assert.ok(
            CHAT_WINDOW_END_GAP_WIDTH * 2 + CHAT_WINDOW_WIDTH * 2 + CHAT_WINDOW_INBETWEEN_WIDTH <
                900,
            "should have enough space to open 2 chat windows simultaneously"
        );
        assert.ok(
            CHAT_WINDOW_END_GAP_WIDTH * 2 +
                CHAT_WINDOW_WIDTH * 3 +
                CHAT_WINDOW_INBETWEEN_WIDTH * 2 >
                900,
            "should not have enough space to open 3 chat windows simultaneously"
        );
        const { env, openDiscuss } = await start();
        await openDiscuss();
        // open, from systray menu, chat windows of channels with id 1, 2, 3
        await click(".o_menu_systray i[aria-label='Messages']");
        await click(".o-NotificationItem-name:contains(Channel-1)");
        await click(".o_menu_systray i[aria-label='Messages']");
        await click(".o-NotificationItem-name:contains(Channel-2)");
        await click(".o_menu_systray i[aria-label='Messages']");
        await click(".o-NotificationItem-name:contains(Channel-3)");
        // simulate resize to go into mobile
        await afterNextRender(() => (env.services["mail.store"].isSmall = true));
        assert.containsNone($, ".o-ChatWindowHiddenToggler");
    }
);

QUnit.test("chat window: composer state conservation on toggle discuss", async (assert) => {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({});
    const { openDiscuss, openView } = await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    await click(".o-NotificationItem");
    // Set content of the composer of the chat window
    await insertText(".o-Composer-input", "XDU for the win !");
    assert.containsNone($, ".o-Composer-footer .o-AttachmentList .o-AttachmentCard");
    // Set attachments of the composer
    const files = [
        await createFile({
            name: "text state conservation on toggle home menu.txt",
            content: "hello, world",
            contentType: "text/plain",
        }),
        await createFile({
            name: "text2 state conservation on toggle home menu.txt",
            content: "hello, xdu is da best man",
            contentType: "text/plain",
        }),
    ];
    inputFiles($(".o-Composer-coreMain .o_input_file")[0], files);
    await waitUntil(".o-AttachmentCard .fa-check", 2);
    assert.strictEqual($(".o-Composer-input").val(), "XDU for the win !");

    await openDiscuss();
    assert.containsNone($, ".o-ChatWindow");

    await openView({
        res_id: channelId,
        res_model: "mail.channel",
        views: [[false, "form"]],
    });
    assert.strictEqual($(".o-Composer-input").val(), "XDU for the win !");
    assert.containsN($, ".o-Composer-footer .o-AttachmentList .o-AttachmentCard", 2);
});

QUnit.test(
    "focusing a chat window of a chat should make new message separator disappear [REQUIRE FOCUS]",
    async (assert) => {
        const pyEnv = await startServer();
        const partnerId = pyEnv["res.partner"].create({ name: "Demo" });
        const userId = pyEnv["res.users"].create({
            name: "Foreigner user",
            partner_id: partnerId,
        });
        const channelId = pyEnv["mail.channel"].create({
            name: "test",
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
                [0, 0, { partner_id: partnerId }],
            ],
            channel_type: "chat",
            uuid: "channel-10-uuid",
        });
        const messageId = pyEnv["mail.message"].create([
            {
                body: "not empty",
                model: "mail.channel",
                res_id: channelId,
            },
        ]);
        const [memberId] = pyEnv["mail.channel.member"].search([
            ["channel_id", "=", channelId],
            ["partner_id", "=", pyEnv.currentPartnerId],
        ]);
        pyEnv["mail.channel.member"].write([memberId], { seen_message_id: messageId });
        const { env } = await start();
        $(".o-Composer-input")[0].blur();
        // simulate receiving a message
        await afterNextRender(() =>
            env.services.rpc("/mail/chat_post", {
                context: { mockedUserId: userId },
                message_content: "hu",
                uuid: "channel-10-uuid",
            })
        );
        assert.containsOnce($, "hr + span:contains(New messages)");
        await afterNextRender(() => $(".o-Composer-input")[0].focus());
        assert.containsNone($, "hr + span:contains(New messages)");
    }
);

QUnit.test("chat window: scroll conservation on toggle discuss", async (assert) => {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({});
    for (let i = 0; i < 100; i++) {
        pyEnv["mail.message"].create({
            body: "not empty",
            model: "mail.channel",
            res_id: channelId,
        });
    }
    const { openDiscuss, openView } = await start();
    await click(".o_menu_systray .dropdown-toggle:has(i[aria-label='Messages'])");
    await click(".o-NotificationItem");
    $(".o-Thread")[0].scrollTop = 142;
    await openDiscuss(null, { waitUntilMessagesLoaded: false });
    assert.containsNone($, ".o-ChatWindow");

    await openView({
        res_id: channelId,
        res_model: "mail.channel",
        views: [[false, "list"]],
    });
    assert.strictEqual($(".o-Thread")[0].scrollTop, 142);
});

QUnit.test(
    "chat window with a thread: keep scroll position in message list on folded",
    async (assert) => {
        const pyEnv = await startServer();
        const channelId = pyEnv["mail.channel"].create({});
        for (let i = 0; i < 100; i++) {
            pyEnv["mail.message"].create({
                body: "not empty",
                model: "mail.channel",
                res_id: channelId,
            });
        }
        await start();
        await click(".o_menu_systray .dropdown-toggle:has(i[aria-label='Messages'])");
        await click(".o-NotificationItem");
        // Set a scroll position to chat window
        $(".o-Thread")[0].scrollTop = 142;
        assert.strictEqual($(".o-Thread")[0].scrollTop, 142);

        // fold chat window
        await click(".o-ChatWindow-header");
        assert.containsNone($, ".o-Thread");
        // unfold chat window
        await click(".o-ChatWindow-header");
        assert.strictEqual($(".o-Thread")[0].scrollTop, 142);
    }
);

QUnit.test(
    "chat window with a thread: keep scroll position in message list on toggle discuss when folded",
    async (assert) => {
        const pyEnv = await startServer();
        const channelId = pyEnv["mail.channel"].create({});
        for (let i = 0; i < 100; i++) {
            pyEnv["mail.message"].create({
                body: "not empty",
                model: "mail.channel",
                res_id: channelId,
            });
        }
        const { openDiscuss, openView } = await start();
        await click(".o_menu_systray .dropdown-toggle:has(i[aria-label='Messages'])");
        await click(".o-NotificationItem");

        // Set a scroll position to chat window
        $(".o-Thread")[0].scrollTop = 142;
        // fold chat window
        await click(".o-ChatWindow-header");
        await openDiscuss(null, { waitUntilMessagesLoaded: false });
        assert.containsNone($, ".o-ChatWindow");

        await openView({
            res_id: channelId,
            res_model: "mail.channel",
            views: [[false, "list"]],
        });
        // unfold chat window
        await click(".o-ChatWindow-header");
        assert.strictEqual($(".o-Thread")[0].scrollTop, 142);
    }
);
