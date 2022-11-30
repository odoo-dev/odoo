/** @odoo-module **/

import { start, startServer } from "@mail/../tests/helpers/test_utils";
import { getFixture } from "@web/../tests/helpers/utils";

let target;

QUnit.module("mail", (hooks) => {
    hooks.beforeEach(async () => {
        target = getFixture();
    });

    QUnit.module("channel member list");

    QUnit.test(
        "there should be a button to show member list in the thread view topbar initially",
        async function (assert) {
            const pyEnv = await startServer();
            const resPartnerId1 = pyEnv["res.partner"].create({ name: "Demo" });
            const mailChannelId = pyEnv["mail.channel"].create({
                name: "TestChanel",
                channel_member_ids: [
                    [0, 0, { partner_id: pyEnv.currentPartnerId }],
                    [0, 0, { partner_id: resPartnerId1 }],
                ],
                channel_type: "channel",
            });
            const { openDiscuss } = await start({
                discuss: {
                    params: {
                        default_active_id: `mail.channel_${mailChannelId}`,
                    },
                },
            });
            await openDiscuss();
            assert.containsOnce(target, "[title='Show Member List']");
        }
    );

    QUnit.test(
        "should show member list when clicking on show member list button in thread view topbar",
        async function (assert) {
            const pyEnv = await startServer();
            const resPartnerId1 = pyEnv["res.partner"].create({ name: "Demo" });
            const mailChannelId = pyEnv["mail.channel"].create({
                name: "TestChanel",
                channel_member_ids: [
                    [0, 0, { partner_id: pyEnv.currentPartnerId }],
                    [0, 0, { partner_id: resPartnerId1 }],
                ],
                channel_type: "channel",
            });
            const { click, openDiscuss } = await start({
                discuss: {
                    params: {
                        default_active_id: `mail.channel_${mailChannelId}`,
                    },
                },
            });
            await openDiscuss();
            await click(".o-mail-discuss-actions button[title='Show Member List']");
            assert.containsOnce(target, ".o-mail-channel-member-list");
        }
    );

    QUnit.test("should have correct members in member list", async function (assert) {
        const pyEnv = await startServer();
        const resPartnerId1 = pyEnv["res.partner"].create({ name: "Demo" });
        const mailChannelId = pyEnv["mail.channel"].create({
            name: "TestChanel",
            channel_member_ids: [
                [0, 0, { partner_id: pyEnv.currentPartnerId }],
                [0, 0, { partner_id: resPartnerId1 }],
            ],
            channel_type: "channel",
        });
        const { click, openDiscuss } = await start({
            discuss: {
                params: {
                    default_active_id: `mail.channel_${mailChannelId}`,
                },
            },
        });
        await openDiscuss();
        await click(".o-mail-discuss-actions button[title='Show Member List']");
        assert.containsN(
            target,
            ".o-mail-channel-member",
            2,
            "should have 2 members in member list"
        );
        assert.containsOnce(
            target,
            `.o-mail-channel-member .o-mail-channel-member-name:contains("${pyEnv.currentPartner.name}")`
        );
        assert.containsOnce(
            target,
            ".o-mail-channel-member .o-mail-channel-member-name:contains('Demo')"
        );
    });

    QUnit.test(
        "there should be a button to hide member list in the thread view topbar when the member list is visible",
        async function (assert) {
            const pyEnv = await startServer();
            const resPartnerId1 = pyEnv["res.partner"].create({ name: "Demo" });
            const mailChannelId = pyEnv["mail.channel"].create({
                name: "TestChanel",
                channel_member_ids: [
                    [0, 0, { partner_id: pyEnv.currentPartnerId }],
                    [0, 0, { partner_id: resPartnerId1 }],
                ],
                channel_type: "channel",
            });
            const { click, openDiscuss } = await start({
                discuss: {
                    params: {
                        default_active_id: `mail.channel_${mailChannelId}`,
                    },
                },
            });
            await openDiscuss();
            await click(".o-mail-discuss-actions button[title='Show Member List']");
            assert.containsOnce(target, "[title='Hide Member List']");
        }
    );

    QUnit.test(
        "chat with member should be opened after clicking on channel member",
        async function (assert) {
            const pyEnv = await startServer();
            const resPartnerId1 = pyEnv["res.partner"].create({ name: "Demo" });
            pyEnv["res.users"].create({ partner_id: resPartnerId1 });
            const mailChannelId = pyEnv["mail.channel"].create({
                name: "TestChanel",
                channel_member_ids: [
                    [0, 0, { partner_id: pyEnv.currentPartnerId }],
                    [0, 0, { partner_id: resPartnerId1 }],
                ],
                channel_type: "channel",
            });
            const { click, openDiscuss } = await start({
                discuss: {
                    params: {
                        default_active_id: `mail.channel_${mailChannelId}`,
                    },
                },
            });
            await openDiscuss();
            await click(".o-mail-discuss-actions button[title='Show Member List']");
            await click(".o-mail-channel-member.cursor-pointer");
            assert.containsOnce(target, ".o-mail-autoresize-input[title='Demo']");
        }
    );
});
