/** @odoo-module **/

import {
    afterNextRender,
    dragenterFiles,
    dropFiles,
    start,
    startServer,
} from "@mail/../tests/helpers/test_utils";

import { getFixture } from "@web/../tests/helpers/utils";
import { file } from "web.test_utils";

const { createFile } = file;
let target;

QUnit.module("mail", (hooks) => {
    hooks.beforeEach(async () => {
        target = getFixture();
    });

    QUnit.module("components", {}, function () {
        QUnit.module("chatter", {}, function () {
            QUnit.module("chatter_tests.js");

            QUnit.test("chatter: drop attachments", async function (assert) {
                assert.expect(4);

                const pyEnv = await startServer();
                const resPartnerId1 = pyEnv["res.partner"].create({});
                const { openView } = await start();
                await openView({
                    res_id: resPartnerId1,
                    res_model: "res.partner",
                    views: [[false, "form"]],
                });
                let files = [
                    await createFile({
                        content: "hello, world",
                        contentType: "text/plain",
                        name: "text.txt",
                    }),
                    await createFile({
                        content: "hello, worlduh",
                        contentType: "text/plain",
                        name: "text2.txt",
                    }),
                ];
                await afterNextRender(() =>
                    dragenterFiles(document.querySelector(".o-mail-chatter"))
                );
                assert.ok(document.querySelector(".o-dropzone"), "should have a drop zone");
                assert.containsNone(
                    document.body,
                    ".o-mail-attachment-image",
                    "should have no attachment before files are dropped"
                );

                await afterNextRender(() =>
                    dropFiles(document.querySelector(".o-dropzone"), files)
                );
                assert.containsN(
                    document.body,
                    ".o-mail-attachment-image",
                    2,
                    "should have 2 attachments in the attachment box after files dropped"
                );

                await afterNextRender(() =>
                    dragenterFiles(document.querySelector(".o-mail-chatter"))
                );
                files = [
                    await createFile({
                        content: "hello, world",
                        contentType: "text/plain",
                        name: "text3.txt",
                    }),
                ];
                await afterNextRender(() =>
                    dropFiles(document.querySelector(".o-dropzone"), files)
                );
                assert.containsN(
                    document.body,
                    ".o-mail-attachment-image",
                    3,
                    "should have 3 attachments in the attachment box after files dropped"
                );
            });

            QUnit.test(
                "should display subject when subject is not the same as the thread name",
                async function (assert) {
                    assert.expect(2);

                    const pyEnv = await startServer();
                    const resPartnerId1 = pyEnv["res.partner"].create({});
                    pyEnv["mail.message"].create({
                        body: "not empty",
                        model: "res.partner",
                        res_id: resPartnerId1,
                        subject: "Salutations, voyageur",
                    });
                    const { openView } = await start();
                    await openView({
                        res_id: resPartnerId1,
                        res_model: "res.partner",
                        views: [[false, "form"]],
                    });

                    assert.containsOnce(target, ".o-mail-message-subject");
                    assert.strictEqual(
                        target.querySelector(".o-mail-message-subject").textContent,
                        "Subject: Salutations, voyageur"
                    );
                }
            );

            QUnit.test(
                "should not display user notification messages in chatter",
                async function (assert) {
                    assert.expect(1);

                    const pyEnv = await startServer();
                    const resPartnerId1 = pyEnv["res.partner"].create({});
                    pyEnv["mail.message"].create({
                        message_type: "user_notification",
                        model: "res.partner",
                        res_id: resPartnerId1,
                    });
                    const { openView } = await start();
                    await openView({
                        res_id: resPartnerId1,
                        res_model: "res.partner",
                        views: [[false, "form"]],
                    });

                    assert.containsNone(
                        document.body,
                        ".o-mail-message",
                        "should display no messages"
                    );
                }
            );
        });
    });
});
