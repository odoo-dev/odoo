/** @odoo-module **/

import { patchUiSize } from "@mail/../tests/helpers/patch_ui_size";
import { afterNextRender, start, startServer } from "@mail/../tests/helpers/test_utils";
import { getFixture } from "@web/../tests/helpers/utils";
import { makeDeferred } from "@mail/utils/deferred";

let target;
QUnit.module("chat window: new message", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test("basic rendering", async function (assert) {
    const { click } = await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    await click(".o-mail-messaging-menu-new-message");
    assert.containsOnce(target, ".o-mail-chat-window");
    assert.containsOnce(target, ".o-mail-chat-window-header");
    assert.containsOnce(target, ".o-mail-chat-window-header .o-mail-chat-window-header-name");
    assert.strictEqual(
        $(target).find(".o-mail-chat-window-header .o-mail-chat-window-header-name").text(),
        "New message"
    );
    assert.containsOnce(target, ".o-mail-chat-window-header .o-mail-command");
    assert.containsOnce(
        target,
        ".o-mail-chat-window-header .o-mail-command[title='Close chat window']"
    );
    assert.containsOnce(target, "span:contains('To :')");
    assert.containsOnce(target, ".o-mail-channel-selector");
});

QUnit.test("focused on open [REQUIRE FOCUS]", async function (assert) {
    const { click } = await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    await click(".o-mail-messaging-menu-new-message");
    assert.strictEqual(
        document.activeElement,
        target.querySelector(".o-mail-chat-window .o-mail-channel-selector-input")
    );
});

QUnit.test("close", async function (assert) {
    const { click } = await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    await click(".o-mail-messaging-menu-new-message");
    await click(".o-mail-chat-window-header .o-mail-command[title='Close chat window']");
    assert.containsNone(target, ".o-mail-chat-window");
});

QUnit.test("fold", async function (assert) {
    const { click } = await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    await click(".o-mail-messaging-menu-new-message");
    assert.containsOnce(target, ".o-mail-chat-window-content");
    assert.containsOnce(target, ".o-mail-channel-selector");

    await click(".o-mail-chat-window-header");
    assert.containsNone(target, ".o-mail-chat-window .o-mail-chat-window-content");
    assert.containsNone(target, ".o-mail-chat-window .o-mail-channel-selector");

    await click(".o-mail-chat-window-header");
    assert.containsOnce(target, ".o-mail-chat-window .o-mail-chat-window-content");
    assert.containsOnce(target, ".o-mail-channel-selector");
});

QUnit.test(
    'open chat from "new message" chat window should open chat in place of this "new message" chat window',
    async function (assert) {
        /**
         * InnerWith computation uses following info:
         * ([mocked] global window width: @see `mail/static/tests/helpers/test_utils.js:start()` method)
         * (others: @see mail/static/src/models/chat_window_manager.js:visual)
         *
         * - chat window width: 340px
         * - start/end/between gap width: 10px/10px/5px
         * - hidden menu width: 170px
         * - global width: 1920px
         *
         * Enough space for 3 visible chat windows:
         *  10 + 340 + 5 + 340 + 5 + 340 + 10 = 1050 < 1920
         */
        const pyEnv = await startServer();
        const resPartnerId1 = pyEnv["res.partner"].create({ name: "Partner 131" });
        pyEnv["res.users"].create({ partner_id: resPartnerId1 });
        pyEnv["mail.channel"].create([
            {
                name: "channel-1",
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
            },
            {
                name: "channel-2",
                channel_member_ids: [
                    [
                        0,
                        0,
                        {
                            is_minimized: false,
                            partner_id: pyEnv.currentPartnerId,
                        },
                    ],
                ],
            },
        ]);
        const imSearchDef = makeDeferred();
        patchUiSize({ width: 1920 });
        const { click, insertText } = await start({
            mockRPC(route, args) {
                if (args.method === "im_search") {
                    imSearchDef.resolve();
                }
            },
        });
        assert.containsNone(
            target,
            ".o-mail-chat-window .o-mail-chat-window-header:contains(New message)"
        );

        // open "new message" chat window
        await click(".o_menu_systray i[aria-label='Messages']");
        await click(".o-mail-messaging-menu-new-message");
        assert.containsOnce(
            target,
            ".o-mail-chat-window .o-mail-chat-window-header:contains(New message)"
        );
        assert.containsN(target, ".o-mail-chat-window", 2);
        assert.containsOnce(target, ".o-mail-chat-window .o-mail-channel-selector");
        assert.ok(
            Array.from(target.querySelectorAll(".o-mail-chat-window"))
                .pop()
                .textContent.includes("New message")
        );

        // open channel-2
        await click(".o-mail-notification-item:nth-child(2)");
        assert.containsN(target, ".o-mail-chat-window", 3);

        assert.ok(
            Array.from(target.querySelectorAll(".o-mail-chat-window"))[1].textContent.includes(
                "New message"
            )
        );

        // search for a user in "new message" autocomplete
        await afterNextRender(async () => {
            await insertText(".o-mail-channel-selector-input", "131");
            await imSearchDef;
        });
        assert.containsOnce(
            target,
            ".o-mail-channel-selector-suggestion a",
            "should have autocomplete suggestion after typing on 'new message' input"
        );
        const $link = $(target).find(".o-mail-channel-selector-suggestion a");
        assert.strictEqual($link.text(), "Partner 131");

        await click($link);
        assert.containsNone(
            target,
            ".o-mail-chat-window .o-mail-chat-window-header:contains(New message)"
        );
        assert.strictEqual(
            $(target).find(".o-mail-chat-window .o-mail-chat-window-header-name:eq(1)").text(),
            "Partner 131"
        );
    }
);

QUnit.test(
    "new message chat window should close on selecting the user if chat with the user is already open",
    async function (assert) {
        const pyEnv = await startServer();
        const resPartnerId1 = pyEnv["res.partner"].create({ name: "Partner 131" });
        pyEnv["res.users"].create({ partner_id: resPartnerId1 });
        pyEnv["mail.channel"].create({
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
                [0, 0, { partner_id: resPartnerId1 }],
            ],
            channel_type: "chat",
            name: "Partner 131",
        });
        const { click, insertText } = await start();
        await click(".o_menu_systray i[aria-label='Messages']");
        await click(".o-mail-messaging-menu-new-message");
        await insertText(".o-mail-channel-selector", "131");
        await click(".o-mail-channel-selector-suggestion a");
        assert.containsNone(
            target,
            ".o-mail-chat-window .o-mail-chat-window-header:contains(New message)"
        );
        assert.containsOnce(target, ".o-mail-chat-window");
    }
);

QUnit.test(
    "new message autocomplete should automatically select first result",
    async function (assert) {
        const pyEnv = await startServer();
        const resPartnerId1 = pyEnv["res.partner"].create({ name: "Partner 131" });
        pyEnv["res.users"].create({ partner_id: resPartnerId1 });
        const imSearchDef = makeDeferred();
        const { click, insertText } = await start({
            mockRPC(route, args) {
                if (args.method === "im_search") {
                    imSearchDef.resolve();
                }
            },
        });
        // open "new message" chat window
        await click(".o_menu_systray i[aria-label='Messages']");
        await click(".o-mail-messaging-menu-new-message");
        // search for a user in "new message" autocomplete
        await afterNextRender(async () => {
            await insertText(".o-mail-channel-selector", "131");
            await imSearchDef;
        });
        assert.hasClass(
            $(target).find(".o-mail-channel-selector-suggestion a"),
            "o-navigable-list-active-item"
        );
    }
);
