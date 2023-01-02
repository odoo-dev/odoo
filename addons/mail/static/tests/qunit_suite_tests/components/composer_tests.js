/** @odoo-module **/

import { afterNextRender, pasteFiles, start, startServer } from "@mail/../tests/helpers/test_utils";

import { file, makeTestPromise } from "web.test_utils";
import { patchWithCleanup } from "@web/../tests/helpers/utils";
import { Composer } from "@mail/new/composer/composer";

const { createFile, inputFiles } = file;

QUnit.module("mail", (hooks) => {
    hooks.beforeEach(async () => {
        // Simulate real user interactions
        patchWithCleanup(Composer.prototype, {
            isEventTrusted() {
                return true;
            },
        });
    });
    QUnit.module("components", {}, function () {
        QUnit.module("composer_tests.js");

        QUnit.skipRefactoring("composer: paste attachments", async function (assert) {
            assert.expect(2);

            const pyEnv = await startServer();
            const mailChannelId1 = pyEnv["mail.channel"].create({});
            const { openDiscuss } = await start({
                discuss: {
                    context: { active_id: mailChannelId1 },
                },
            });
            await openDiscuss();
            const files = [
                await createFile({
                    content: "hello, world",
                    contentType: "text/plain",
                    name: "text.txt",
                }),
            ];
            assert.strictEqual(
                document.querySelectorAll(`.o_ComposerView .o_AttachmentCard`).length,
                0,
                "should not have any attachment in the composer before paste"
            );

            await afterNextRender(() =>
                pasteFiles(document.querySelector(".o_ComposerTextInputView"), files)
            );
            assert.strictEqual(
                document.querySelectorAll(`.o_ComposerView .o_AttachmentCard`).length,
                1,
                "should have 1 attachment in the composer after paste"
            );
        });

        QUnit.skipRefactoring(
            "composer: send button is disabled if attachment upload is not finished",
            async function (assert) {
                assert.expect(8);

                const pyEnv = await startServer();
                const attachmentUploadedPromise = makeTestPromise();
                const mailChannelId1 = pyEnv["mail.channel"].create({});
                const { messaging, openDiscuss } = await start({
                    discuss: {
                        context: { active_id: mailChannelId1 },
                    },
                    async mockRPC(route) {
                        if (route === "/mail/attachment/upload") {
                            await attachmentUploadedPromise;
                        }
                    },
                });
                await openDiscuss();
                const file = await createFile({
                    content: "hello, world",
                    contentType: "text/plain",
                    name: "text.txt",
                });
                await afterNextRender(() =>
                    inputFiles(messaging.discuss.threadView.composerView.fileUploader.fileInput, [
                        file,
                    ])
                );
                assert.containsOnce(
                    document.body,
                    ".o_AttachmentCard",
                    "should have an attachment after a file has been input"
                );
                assert.containsOnce(
                    document.body,
                    ".o_AttachmentCard.o-isUploading",
                    "attachment displayed is being uploaded"
                );
                assert.containsOnce(
                    document.body,
                    ".o-mail-composer-send-button",
                    "composer send button should be displayed"
                );
                assert.ok(
                    !!document.querySelector(".o-mail-composer-send-button").attributes.disabled,
                    "composer send button should be disabled as attachment is not yet uploaded"
                );

                // simulates attachment finishes uploading
                await afterNextRender(() => attachmentUploadedPromise.resolve());
                assert.containsOnce(
                    document.body,
                    ".o_AttachmentCard",
                    "should have only one attachment"
                );
                assert.containsNone(
                    document.body,
                    ".o_AttachmentCard.o-isUploading",
                    "attachment displayed should be uploaded"
                );
                assert.containsOnce(
                    document.body,
                    ".o-mail-composer-send-button",
                    "composer send button should still be present"
                );
                assert.ok(
                    !document.querySelector(".o-mail-composer-send-button").attributes.disabled,
                    "composer send button should be enabled as attachment is now uploaded"
                );
            }
        );

        QUnit.skipRefactoring(
            "remove an attachment from composer does not need any confirmation",
            async function (assert) {
                assert.expect(3);

                const pyEnv = await startServer();
                const mailChannelId1 = pyEnv["mail.channel"].create({});
                const { afterEvent, messaging, openDiscuss } = await start({
                    discuss: {
                        context: { active_id: mailChannelId1 },
                    },
                });
                await openDiscuss();
                const file = await createFile({
                    content: "hello, world",
                    contentType: "text/plain",
                    name: "text.txt",
                });
                await afterNextRender(() =>
                    afterEvent({
                        eventName: "o-file-uploader-upload",
                        func() {
                            inputFiles(
                                messaging.discuss.threadView.composerView.fileUploader.fileInput,
                                [file]
                            );
                        },
                        message: "should wait until files are uploaded",
                        predicate: ({ files: uploadedFiles }) => uploadedFiles[0] === file,
                    })
                );
                assert.containsOnce(
                    document.body,
                    ".o_ComposerView_attachmentList",
                    "should have an attachment list"
                );
                assert.containsOnce(
                    document.body,
                    ".o_ComposerView .o_AttachmentCard",
                    "should have only one attachment"
                );

                const attachmentLocalId = document.querySelector(".o_AttachmentCard").dataset.id;
                await afterNextRender(() =>
                    afterEvent({
                        eventName: "o-attachment-deleted",
                        func() {
                            document.querySelector(".o_AttachmentCard_asideItemUnlink").click();
                        },
                        message: "should wait until attachment is deleted",
                        predicate: ({ attachment }) => {
                            return attachment.localId === attachmentLocalId;
                        },
                    })
                );

                assert.containsNone(
                    document.body,
                    ".o_ComposerView .o_AttachmentCard",
                    "should not have any attachment left after unlinking the only one"
                );
            }
        );

        QUnit.skipRefactoring("remove an uploading attachment", async function (assert) {
            assert.expect(4);

            const pyEnv = await startServer();
            const mailChannelId1 = pyEnv["mail.channel"].create({});
            const { click, openDiscuss, messaging } = await start({
                discuss: {
                    context: { active_id: mailChannelId1 },
                },
                async mockRPC(route) {
                    if (route === "/mail/attachment/upload") {
                        // simulates uploading indefinitely
                        await new Promise(() => {});
                    }
                },
            });
            await openDiscuss();
            const file = await createFile({
                content: "hello, world",
                contentType: "text/plain",
                name: "text.txt",
            });
            await afterNextRender(() =>
                inputFiles(messaging.discuss.threadView.composerView.fileUploader.fileInput, [file])
            );
            assert.containsOnce(
                document.body,
                ".o_ComposerView_attachmentList",
                "should have an attachment list"
            );
            assert.containsOnce(
                document.body,
                ".o_ComposerView .o_AttachmentCard",
                "should have only one attachment"
            );
            assert.containsOnce(
                document.body,
                ".o_AttachmentCard.o-isUploading",
                "should have an uploading attachment"
            );

            await click(".o_AttachmentCard_asideItemUnlink");
            assert.containsNone(
                document.body,
                ".o_ComposerView .o_AttachmentCard",
                "should not have any attachment left after unlinking uploading one"
            );
        });

        QUnit.skipRefactoring(
            "remove an uploading attachment aborts upload",
            async function (assert) {
                assert.expect(1);

                const pyEnv = await startServer();
                const mailChannelId1 = pyEnv["mail.channel"].create({});
                const { afterEvent, openDiscuss, messaging } = await start({
                    discuss: {
                        context: { active_id: mailChannelId1 },
                    },
                    async mockRPC(route) {
                        if (route === "/mail/attachment/upload") {
                            // simulates uploading indefinitely
                            await new Promise(() => {});
                        }
                    },
                });
                await openDiscuss();
                const file = await createFile({
                    content: "hello, world",
                    contentType: "text/plain",
                    name: "text.txt",
                });
                await afterNextRender(() =>
                    inputFiles(messaging.discuss.threadView.composerView.fileUploader.fileInput, [
                        file,
                    ])
                );
                assert.containsOnce(
                    document.body,
                    ".o_AttachmentCard",
                    "should contain an attachment"
                );
                const attachmentLocalId = document.querySelector(".o_AttachmentCard").dataset.id;

                await afterEvent({
                    eventName: "o-attachment-upload-abort",
                    func: () => {
                        document.querySelector(".o_AttachmentCard_asideItemUnlink").click();
                    },
                    message: "attachment upload request should have been aborted",
                    predicate: ({ attachment }) => {
                        return attachment.localId === attachmentLocalId;
                    },
                });
            }
        );

        QUnit.skipRefactoring(
            "Show a default status in the recipient status text when the thread doesn't have a name.",
            async function (assert) {
                assert.expect(1);

                const pyEnv = await startServer();
                const resPartnerId1 = pyEnv["res.partner"].create({});
                const { click, openView } = await start();
                await openView({
                    res_model: "res.partner",
                    res_id: resPartnerId1,
                    views: [[false, "form"]],
                });
                await click(".o-mail-chatter-topbar-send-message-button");
                assert.strictEqual(
                    document
                        .querySelector(".o_ComposerView_followers")
                        .textContent.replace(/\s+/g, ""),
                    "To:Followersofthisdocument",
                    'Composer should display "To: Followers of this document" if the thread as no name.'
                );
            }
        );

        QUnit.skipRefactoring(
            "Show a thread name in the recipient status text.",
            async function (assert) {
                assert.expect(1);

                const pyEnv = await startServer();
                const resPartnerId1 = pyEnv["res.partner"].create({ name: "test name" });
                const { click, messaging, openView } = await start();
                await openView({
                    res_model: "res.partner",
                    res_id: resPartnerId1,
                    views: [[false, "form"]],
                });
                // hack: provide awareness of name (not received in usual chatter flow)
                messaging.models["Thread"].insert({
                    id: resPartnerId1,
                    model: "res.partner",
                    name: "test name",
                });
                await click(".o-mail-chatter-topbar-send-message-button");
                assert.strictEqual(
                    document
                        .querySelector(".o_ComposerView_followers")
                        .textContent.replace(/\s+/g, ""),
                    'To:Followersof"testname"',
                    "basic rendering when sending a message to the followers and thread does have a name"
                );
            }
        );

        QUnit.skipRefactoring(
            "[technical] does not crash when an attachment is removed before its upload starts",
            async function (assert) {
                // Uploading multiple files uploads attachments one at a time, this test
                // ensures that there is no crash when an attachment is destroyed before its
                // upload started.
                assert.expect(1);

                const pyEnv = await startServer();
                // Promise to block attachment uploading
                const uploadPromise = makeTestPromise();
                const mailChannelId1 = pyEnv["mail.channel"].create({});
                const { messaging, openDiscuss } = await start({
                    discuss: {
                        context: { active_id: mailChannelId1 },
                    },
                    async mockRPC(route) {
                        if (route === "/mail/attachment/upload") {
                            await uploadPromise;
                        }
                    },
                });
                await openDiscuss();
                const file1 = await createFile({
                    name: "text1.txt",
                    content: "hello, world",
                    contentType: "text/plain",
                });
                const file2 = await createFile({
                    name: "text2.txt",
                    content: "hello, world",
                    contentType: "text/plain",
                });
                await afterNextRender(() =>
                    inputFiles(messaging.discuss.threadView.composerView.fileUploader.fileInput, [
                        file1,
                        file2,
                    ])
                );
                await afterNextRender(() => {
                    Array.from(document.querySelectorAll("div"))
                        .find((el) => el.textContent === "text2.txt")
                        .closest(".o_AttachmentCard")
                        .querySelector(".o_AttachmentCard_asideItemUnlink")
                        .click();
                });
                // Simulates the completion of the upload of the first attachment
                await afterNextRender(() => uploadPromise.resolve());
                assert.containsOnce(
                    document.body,
                    '.o_AttachmentCard:contains("text1.txt")',
                    "should only have the first attachment after cancelling the second attachment"
                );
            }
        );
    });
});
