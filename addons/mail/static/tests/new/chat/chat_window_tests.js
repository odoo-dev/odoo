/** @odoo-module **/

import { patchUiSize, SIZES } from "@mail/../tests/helpers/patch_ui_size";
import { nextAnimationFrame, start, startServer } from "@mail/../tests/helpers/test_utils";
import { getFixture } from "@web/../tests/helpers/utils";

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
