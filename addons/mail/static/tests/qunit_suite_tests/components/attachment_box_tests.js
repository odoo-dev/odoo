/** @odoo-module **/

import { start, startServer } from "@mail/../tests/helpers/test_utils";

QUnit.module("mail", {}, function () {
    QUnit.module("components", {}, function () {
        QUnit.module("attachment_box_tests.js");

        QUnit.skipRefactoring("view attachments", async function (assert) {
            assert.expect(7);

            const pyEnv = await startServer();
            const resPartnerId1 = pyEnv["res.partner"].create({});
            const [irAttachmentId1] = pyEnv["ir.attachment"].create([
                {
                    mimetype: "text/plain",
                    name: "Blah.txt",
                    res_id: resPartnerId1,
                    res_model: "res.partner",
                },
                {
                    mimetype: "text/plain",
                    name: "Blu.txt",
                    res_id: resPartnerId1,
                    res_model: "res.partner",
                },
            ]);
            const views = {
                "res.partner,false,form": `<form>
                <div class="oe_chatter">
                    <field name="message_ids"  options="{'open_attachments': True}"/>
                </div>
            </form>`,
            };
            const { click, messaging, openView } = await start({ serverData: { views } });
            await openView({
                res_id: resPartnerId1,
                res_model: "res.partner",
                views: [[false, "form"]],
            });
            const firstAttachment = messaging.models["Attachment"].findFromIdentifyingData({
                id: irAttachmentId1,
            });

            await click(`
        .o_AttachmentCard[data-id="${firstAttachment.localId}"]
        .o_AttachmentCard_image
    `);
            assert.containsOnce(
                document.body,
                ".o_Dialog",
                "a dialog should have been opened once attachment image is clicked"
            );
            assert.containsOnce(
                document.body,
                ".o_AttachmentViewer",
                "an attachment viewer should have been opened once attachment image is clicked"
            );
            assert.strictEqual(
                document.querySelector(".o_AttachmentViewer_name").textContent,
                "Blah.txt",
                "attachment viewer iframe should point to clicked attachment"
            );
            assert.containsOnce(
                document.body,
                ".o_AttachmentViewer_buttonNavigationNext",
                "attachment viewer should allow to see next attachment"
            );

            await click(".o_AttachmentViewer_buttonNavigationNext");
            assert.strictEqual(
                document.querySelector(".o_AttachmentViewer_name").textContent,
                "Blu.txt",
                "attachment viewer iframe should point to next attachment of attachment box"
            );
            assert.containsOnce(
                document.body,
                ".o_AttachmentViewer_buttonNavigationNext",
                "attachment viewer should allow to see next attachment"
            );

            await click(".o_AttachmentViewer_buttonNavigationNext");
            assert.strictEqual(
                document.querySelector(".o_AttachmentViewer_name").textContent,
                "Blah.txt",
                "attachment viewer iframe should point anew to first attachment"
            );
        });
    });
});
