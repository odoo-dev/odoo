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
        assert.expect(1);

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
