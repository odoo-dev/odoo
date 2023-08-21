/* @odoo-module */

import {
    CHAT_WINDOW_END_GAP_WIDTH,
    CHAT_WINDOW_INBETWEEN_WIDTH,
    CHAT_WINDOW_WIDTH,
} from "@mail/core/common/chat_window_model";
import { Command } from "@mail/../tests/helpers/command";
import { patchUiSize } from "@mail/../tests/helpers/patch_ui_size";
import {
    afterNextRender,
    click,
    contains,
    insertText,
    start,
    startServer,
} from "@mail/../tests/helpers/test_utils";

import { makeDeferred } from "@web/../tests/helpers/utils";

QUnit.module("chat window: new message");

QUnit.test("basic rendering", async () => {
    await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    await click("button:contains(New Message)");
    await contains(".o-mail-ChatWindow");
    await contains(".o-mail-ChatWindow-header");
    await contains(".o-mail-ChatWindow-header .o-mail-ChatWindow-name:contains(New message)");
    await contains(".o-mail-ChatWindow-header .o-mail-ChatWindow-command", 2);
    await contains(".o-mail-ChatWindow-header .o-mail-ChatWindow-command[title='Fold']");
    await contains(
        ".o-mail-ChatWindow-header .o-mail-ChatWindow-command[title='Close Chat Window']"
    );
    await contains("span:contains('To :')");
    await contains(".o-discuss-ChannelSelector");
});

QUnit.test("focused on open [REQUIRE FOCUS]", async () => {
    await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    await click("button:contains(New Message)");
    await contains(".o-mail-ChatWindow .o-discuss-ChannelSelector input:focus");
});

QUnit.test("close", async () => {
    await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    await click("button:contains(New Message)");
    await click(".o-mail-ChatWindow-header .o-mail-ChatWindow-command[title='Close Chat Window']");
    await contains(".o-mail-ChatWindow", 0);
});

QUnit.test("fold", async () => {
    await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    await click("button:contains(New Message)");
    await contains(".o-mail-ChatWindow-content");
    await contains(".o-discuss-ChannelSelector");

    await click(".o-mail-ChatWindow-command[title='Fold']");
    await contains(".o-mail-ChatWindow .o-mail-ChatWindow-content", 0);
    await contains(".o-mail-ChatWindow .o-discuss-ChannelSelector", 0);

    await click(".o-mail-ChatWindow-command[title='Open']");
    await contains(".o-mail-ChatWindow .o-mail-ChatWindow-content");
    await contains(".o-discuss-ChannelSelector");
});

QUnit.test(
    'open chat from "new message" chat window should open chat in place of this "new message" chat window',
    async (assert) => {
        const pyEnv = await startServer();
        const partnerId = pyEnv["res.partner"].create({ name: "Partner 131" });
        pyEnv["res.users"].create({ partner_id: partnerId });
        pyEnv["discuss.channel"].create([
            {
                name: "channel-1",
                channel_member_ids: [
                    Command.create({ is_minimized: true, partner_id: pyEnv.currentPartnerId }),
                ],
            },
            {
                name: "channel-2",
                channel_member_ids: [
                    Command.create({ is_minimized: false, partner_id: pyEnv.currentPartnerId }),
                ],
            },
        ]);
        const imSearchDef = makeDeferred();
        patchUiSize({ width: 1920 });
        assert.ok(
            CHAT_WINDOW_END_GAP_WIDTH * 2 +
                CHAT_WINDOW_WIDTH * 3 +
                CHAT_WINDOW_INBETWEEN_WIDTH * 2 <
                1920,
            "should have enough space to open 3 chat windows simultaneously"
        );
        await start({
            mockRPC(route, args) {
                if (args.method === "im_search") {
                    imSearchDef.resolve();
                }
            },
        });
        // open "new message" chat window
        await click(".o_menu_systray i[aria-label='Messages']");
        await click("button:contains(New Message)");
        await contains(".o-mail-ChatWindow-header:contains(New message)");
        await contains(".o-mail-ChatWindow", 2);
        await contains(".o-mail-ChatWindow .o-discuss-ChannelSelector");
        assert.ok(
            Array.from(document.querySelectorAll(".o-mail-ChatWindow"))
                .pop()
                .textContent.includes("New message")
        );

        // open channel-2
        await click(".o_menu_systray i[aria-label='Messages']");
        await click(".o-mail-NotificationItem .o-mail-NotificationItem-name:contains(channel-2)");
        await contains(".o-mail-ChatWindow", 3);
        assert.ok(
            Array.from(document.querySelectorAll(".o-mail-ChatWindow"))[1].textContent.includes(
                "New message"
            )
        );

        // search for a user in "new message" autocomplete
        await afterNextRender(async () => {
            await insertText(".o-discuss-ChannelSelector input", "131");
            await imSearchDef;
        });
        await click(".o-discuss-ChannelSelector-suggestion a:contains(Partner 131)");
        await contains(".o-mail-ChatWindow-header:contains(New message)", 0);
        assert.strictEqual($(".o-mail-ChatWindow-name:eq(1)").text(), "Partner 131");
    }
);

QUnit.test(
    "new message chat window should close on selecting the user if chat with the user is already open",
    async () => {
        const pyEnv = await startServer();
        const partnerId = pyEnv["res.partner"].create({ name: "Partner 131" });
        pyEnv["res.users"].create({ partner_id: partnerId });
        pyEnv["discuss.channel"].create({
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
                Command.create({ partner_id: partnerId }),
            ],
            channel_type: "chat",
            name: "Partner 131",
        });
        await start();
        await click(".o_menu_systray i[aria-label='Messages']");
        await click("button:contains(New Message)");
        await insertText(".o-discuss-ChannelSelector", "131");
        await click(".o-discuss-ChannelSelector-suggestion a");
        await contains(".o-mail-ChatWindow-header:contains(New message)", 0);
        await contains(".o-mail-ChatWindow");
    }
);

QUnit.test("new message autocomplete should automatically select first result", async () => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ name: "Partner 131" });
    pyEnv["res.users"].create({ partner_id: partnerId });
    await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    await click("button:contains(New Message)");
    await insertText(".o-discuss-ChannelSelector", "131");
    await contains(".o-discuss-ChannelSelector-suggestion a.o-mail-NavigableList-active");
});
