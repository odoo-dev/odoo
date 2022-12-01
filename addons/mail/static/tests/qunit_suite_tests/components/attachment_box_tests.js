/** @odoo-module **/

import { start, startServer } from "@mail/../tests/helpers/test_utils";

QUnit.module("mail", {}, function () {
    QUnit.module("components", {}, function () {
        QUnit.module("attachment_box_tests.js");

        QUnit.test("base empty rendering", async function (assert) {
            assert.expect(4);

            const pyEnv = await startServer();
            const resPartnerId1 = pyEnv["res.partner"].create({});
            const views = {
                "res.partner,false,form": `<form>
                <div class="oe_chatter">
                    <field name="message_ids"  options="{'open_attachments': True}"/>
                </div>
            </form>`,
            };
            const { openView } = await start({ serverData: { views } });
            await openView({
                res_id: resPartnerId1,
                res_model: "res.partner",
                views: [[false, "form"]],
            });
            assert.containsOnce(
                document.body,
                ".o-mail-attachment-box",
                "should have an attachment box"
            );
            assert.containsOnce(
                document.body,
                "button:contains('Attach files')",
                "should have a button add"
            );
            assert.containsOnce(
                document.body,
                ".o-mail-chatter input[type='file']",
                "should have a file uploader"
            );
            assert.containsNone(
                document.body,
                ".o-mail-chatter .o-mail-attachment-image",
                "should not have any attachment"
            );
        });

        QUnit.test("base non-empty rendering", async function (assert) {
            assert.expect(4);

            const pyEnv = await startServer();
            const resPartnerId1 = pyEnv["res.partner"].create({});
            pyEnv["ir.attachment"].create([
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
            const { openView } = await start({ serverData: { views } });
            await openView({
                res_id: resPartnerId1,
                res_model: "res.partner",
                views: [[false, "form"]],
            });
            assert.containsOnce(
                document.body,
                ".o-mail-attachment-box",
                "should have an attachment box"
            );
            assert.containsOnce(
                document.body,
                "button:contains('Attach files')",
                "should have a button add"
            );
            assert.containsOnce(
                document.body,
                ".o-mail-chatter input[type='file']",
                "should have a file uploader"
            );
            assert.containsOnce(
                document.body,
                ".o-mail-attachment-list",
                "should have an attachment list"
            );
        });

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

        QUnit.test("remove attachment should ask for confirmation", async function (assert) {
            assert.expect(4);

            const pyEnv = await startServer();
            const resPartnerId1 = pyEnv["res.partner"].create({});
            pyEnv["ir.attachment"].create({
                mimetype: "text/plain",
                name: "Blah.txt",
                res_id: resPartnerId1,
                res_model: "res.partner",
            });
            const views = {
                "res.partner,false,form": `<form>
                <div class="oe_chatter">
                    <field name="message_ids"  options="{'open_attachments': True}"/>
                </div>
            </form>`,
            };
            const { click, openView } = await start({ serverData: { views } });
            await openView({
                res_id: resPartnerId1,
                res_model: "res.partner",
                views: [[false, "form"]],
            });

            assert.containsOnce(
                document.body,
                ".o-mail-attachment-image",
                "should have an attachment"
            );
            assert.containsOnce(
                document.body,
                "button[title='Remove']",
                "attachment should have a delete button"
            );

            await click("button[title='Remove']");
            assert.containsOnce(
                document.body,
                ".modal-body:contains('Do you really want to delete \"Blah.txt\"?')"
            );

            // Confirm the deletion
            await click(".modal-footer .btn-primary");
            assert.containsNone(
                document.body,
                ".o-mail-attachment-images",
                "should no longer have an attachment"
            );
        });
    });
});
