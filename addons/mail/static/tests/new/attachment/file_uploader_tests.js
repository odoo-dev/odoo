/** @odoo-module **/

import { start, startServer } from "@mail/../tests/helpers/test_utils";
import { editInput } from "@web/../tests/helpers/utils";
import { file } from "web.test_utils";

const { createFile } = file;
QUnit.module("mail", {}, function () {
    QUnit.module("components", {}, function () {
        QUnit.module("file_uploader", {}, function () {
            QUnit.module("file_uploader_tests.js");

            QUnit.test("no conflicts between file uploaders", async function (assert) {
                assert.expect(2);

                const pyEnv = await startServer();
                const resPartnerId1 = pyEnv["res.partner"].create({});
                const channelId = pyEnv["mail.channel"].create({});
                pyEnv["mail.message"].create({
                    body: "not empty",
                    model: "mail.channel",
                    res_id: channelId,
                });
                const { afterNextRender, click, openView } = await start();

                // Uploading file in the first thread: res.partner chatter.
                await openView({
                    res_id: resPartnerId1,
                    res_model: "res.partner",
                    views: [[false, "form"]],
                });
                await click(".o-mail-chatter-topbar-send-message-button");
                const file1 = await createFile({
                    name: "text1.txt",
                    content: "hello, world",
                    contentType: "text/plain",
                });
                await afterNextRender(() =>
                    editInput(document.body, ".o-mail-chatter input[type=file]", file1)
                );

                // Uploading file in the second thread: mail.channel in chatWindow.
                await click("i[aria-label='Messages']");
                await click(".o-mail-notification-item");
                const file2 = await createFile({
                    name: "text2.txt",
                    content: "hello, world",
                    contentType: "text/plain",
                });

                await afterNextRender(() =>
                    editInput(document.body, ".o-mail-chat-window input[type=file]", file2)
                );
                assert.containsOnce(
                    document.body,
                    ".o-mail-chatter .o-mail-attachment-image",
                    "chatter should have one attachment"
                );
                assert.containsOnce(
                    document.body,
                    ".o-mail-chat-window .o-mail-attachment-image",
                    "chat window should have one attachment"
                );
            });
        });
    });
});
