/** @odoo-module **/

import { start, startServer } from "@mail/../tests/helpers/test_utils";

QUnit.module("mail", {}, function () {
    QUnit.module("components", {}, function () {
        QUnit.module("channel_invitation_form_tests.js");

        QUnit.skipRefactoring(
            "should be able to create a new group chat from an existing chat",
            async function (assert) {
                assert.expect(1);

                const pyEnv = await startServer();
                const resPartnerId1 = pyEnv["res.partner"].create({
                    email: "testpartner@odoo.com",
                    name: "TestPartner",
                });
                const resPartnerId2 = pyEnv["res.partner"].create({
                    email: "testpartner2@odoo.com",
                    name: "TestPartner2",
                });
                pyEnv["res.users"].create({ partner_id: resPartnerId1 });
                pyEnv["res.users"].create({ partner_id: resPartnerId2 });
                const mailChannelId1 = pyEnv["mail.channel"].create({
                    channel_member_ids: [
                        [0, 0, { partner_id: pyEnv.currentPartnerId }],
                        [0, 0, { partner_id: resPartnerId1 }],
                    ],
                    channel_type: "chat",
                });
                const { click, insertText, openDiscuss } = await start({
                    discuss: {
                        context: {
                            active_id: mailChannelId1,
                        },
                    },
                });
                await openDiscuss();

                await click(`.o-mail-discuss-actions button[data-action="add-users"]`);
                await insertText(".o_ChannelInvitationForm_searchInput", "TestPartner2");
                await click(`.o_ChannelInvitationFormSelectablePartnerView_checkbox`);
                await click(`.o_ChannelInvitationForm_inviteButton`);
                assert.strictEqual(
                    document.querySelector(".o-mail-discuss-thread-name").value,
                    "Mitchell Admin, TestPartner, TestPartner2",
                    "should have created a new group chat with the existing chat members and the selected user"
                );
            }
        );
    });
});
