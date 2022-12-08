/** @odoo-module **/

import { start, startServer } from "@mail/../tests/helpers/test_utils";

QUnit.module("mail", (hooks) => {
    QUnit.module("components", {}, function () {
        QUnit.module("attachment_list_tests.js");

        QUnit.skipRefactoring("view attachment", async function (assert) {
            assert.expect(3);

            const pyEnv = await startServer();
            const channelId = pyEnv["mail.channel"].create({
                channel_type: "channel",
                name: "channel1",
            });
            const messageAttachmentId = pyEnv["ir.attachment"].create({
                name: "test.png",
                mimetype: "image/png",
            });
            pyEnv["mail.message"].create({
                attachment_ids: [messageAttachmentId],
                body: "<p>Test</p>",
                model: "mail.channel",
                res_id: channelId,
            });
            const { click, openDiscuss } = await start({
                discuss: {
                    context: { active_id: channelId },
                },
            });
            await openDiscuss();

            assert.containsOnce(
                document.body,
                ".o_AttachmentImage img",
                "attachment should have an image part"
            );
            await click(".o_AttachmentImage");
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
        });

        QUnit.skipRefactoring("close attachment viewer", async function (assert) {
            assert.expect(3);

            const pyEnv = await startServer();
            const channelId = pyEnv["mail.channel"].create({
                channel_type: "channel",
                name: "channel1",
            });
            const messageAttachmentId = pyEnv["ir.attachment"].create({
                name: "test.png",
                mimetype: "image/png",
            });
            pyEnv["mail.message"].create({
                attachment_ids: [messageAttachmentId],
                body: "<p>Test</p>",
                model: "mail.channel",
                res_id: channelId,
            });
            const { click, openDiscuss } = await start({
                discuss: {
                    context: { active_id: channelId },
                },
            });
            await openDiscuss();

            assert.containsOnce(
                document.body,
                ".o_AttachmentImage img",
                "attachment should have an image part"
            );

            await click(".o_AttachmentImage");
            assert.containsOnce(
                document.body,
                ".o_AttachmentViewer",
                "an attachment viewer should have been opened once attachment image is clicked"
            );

            await click(".o_AttachmentViewer_headerItemButtonClose");
            assert.containsNone(
                document.body,
                ".o_Dialog",
                "attachment viewer should be closed after clicking on close button"
            );
        });

        QUnit.skipRefactoring(
            "[technical] does not crash when the viewer is closed before image load",
            async function (assert) {
                /**
                 * When images are displayed using `src` attribute for the 1st time, it fetches the resource.
                 * In this case, images are actually displayed (fully fetched and rendered on screen) when
                 * `<image>` intercepts `load` event.
                 *
                 * Current code needs to be aware of load state of image, to display spinner when loading
                 * and actual image when loaded. This test asserts no crash from mishandling image becoming
                 * loaded from being viewed for 1st time, but viewer being closed while image is loading.
                 */
                assert.expect(1);

                const pyEnv = await startServer();
                const channelId = pyEnv["mail.channel"].create({
                    channel_type: "channel",
                    name: "channel1",
                });
                const messageAttachmentId = pyEnv["ir.attachment"].create({
                    name: "test.png",
                    mimetype: "image/png",
                });
                pyEnv["mail.message"].create({
                    attachment_ids: [messageAttachmentId],
                    body: "<p>Test</p>",
                    model: "mail.channel",
                    res_id: channelId,
                });
                const { click, openDiscuss } = await start({
                    discuss: {
                        context: { active_id: channelId },
                    },
                });
                await openDiscuss();
                await click(".o_AttachmentImage");
                const imageEl = document.querySelector(".o_AttachmentViewer_viewImage");
                await click(".o_AttachmentViewer_headerItemButtonClose");
                // Simulate image becoming loaded.
                let successfulLoad;
                try {
                    imageEl.dispatchEvent(new Event("load", { bubbles: true }));
                    successfulLoad = true;
                } catch {
                    successfulLoad = false;
                } finally {
                    assert.ok(successfulLoad, "should not crash when the image is loaded");
                }
            }
        );

        QUnit.skipRefactoring("plain text file is viewable", async function (assert) {
            assert.expect(1);

            const pyEnv = await startServer();
            const channelId = pyEnv["mail.channel"].create({
                channel_type: "channel",
                name: "channel1",
            });
            const messageAttachmentId = pyEnv["ir.attachment"].create({
                name: "test.txt",
                mimetype: "text/plain",
            });
            pyEnv["mail.message"].create({
                attachment_ids: [messageAttachmentId],
                body: "<p>Test</p>",
                model: "mail.channel",
                res_id: channelId,
            });
            const { openDiscuss } = await start({
                discuss: {
                    context: { active_id: channelId },
                },
            });
            await openDiscuss();

            assert.hasClass(
                document.querySelector(".o_AttachmentCard"),
                "o-viewable",
                "should be viewable"
            );
        });

        QUnit.skipRefactoring("HTML file is viewable", async function (assert) {
            assert.expect(1);

            const pyEnv = await startServer();
            const channelId = pyEnv["mail.channel"].create({
                channel_type: "channel",
                name: "channel1",
            });
            const messageAttachmentId = pyEnv["ir.attachment"].create({
                name: "test.html",
                mimetype: "text/html",
            });
            pyEnv["mail.message"].create({
                attachment_ids: [messageAttachmentId],
                body: "<p>Test</p>",
                model: "mail.channel",
                res_id: channelId,
            });
            const { openDiscuss } = await start({
                discuss: {
                    context: { active_id: channelId },
                },
            });
            await openDiscuss();
            assert.hasClass(
                document.querySelector(".o_AttachmentCard"),
                "o-viewable",
                "should be viewable"
            );
        });

        QUnit.skipRefactoring("ODT file is not viewable", async function (assert) {
            assert.expect(1);

            const pyEnv = await startServer();
            const channelId = pyEnv["mail.channel"].create({
                channel_type: "channel",
                name: "channel1",
            });
            const messageAttachmentId = pyEnv["ir.attachment"].create({
                name: "test.odt",
                mimetype: "application/vnd.oasis.opendocument.text",
            });
            pyEnv["mail.message"].create({
                attachment_ids: [messageAttachmentId],
                body: "<p>Test</p>",
                model: "mail.channel",
                res_id: channelId,
            });
            const { openDiscuss } = await start({
                discuss: {
                    context: { active_id: channelId },
                },
            });
            await openDiscuss();
            assert.doesNotHaveClass(
                document.querySelector(".o_AttachmentCard"),
                "o-viewable",
                "should not be viewable"
            );
        });

        QUnit.skipRefactoring("DOCX file is not viewable", async function (assert) {
            assert.expect(1);

            const pyEnv = await startServer();
            const channelId = pyEnv["mail.channel"].create({
                channel_type: "channel",
                name: "channel1",
            });
            const messageAttachmentId = pyEnv["ir.attachment"].create({
                name: "test.docx",
                mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            });
            pyEnv["mail.message"].create({
                attachment_ids: [messageAttachmentId],
                body: "<p>Test</p>",
                model: "mail.channel",
                res_id: channelId,
            });
            const { openDiscuss } = await start({
                discuss: {
                    context: { active_id: channelId },
                },
            });
            await openDiscuss();
            assert.doesNotHaveClass(
                document.querySelector(".o_AttachmentCard"),
                "o-viewable",
                "should not be viewable"
            );
        });
    });
});
