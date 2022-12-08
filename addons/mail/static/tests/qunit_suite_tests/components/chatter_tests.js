/** @odoo-module **/

import {
    afterNextRender,
    nextAnimationFrame,
    start,
    startServer,
} from "@mail/../tests/helpers/test_utils";

import { getFixture } from "@web/../tests/helpers/utils";

let target;

QUnit.module("mail", (hooks) => {
    hooks.beforeEach(async () => {
        target = getFixture();
    });

    QUnit.module("components", {}, function () {
        QUnit.module("chatter", {}, function () {
            QUnit.module("chatter_tests.js");

            QUnit.skipRefactoring(
                "base rendering when chatter has no attachment",
                async function (assert) {
                    assert.expect(6);

                    const pyEnv = await startServer();
                    const resPartnerId1 = pyEnv["res.partner"].create({});
                    for (let i = 0; i < 60; i++) {
                        pyEnv["mail.message"].create({
                            body: "not empty",
                            model: "res.partner",
                            res_id: resPartnerId1,
                        });
                    }
                    const { openView } = await start();
                    await openView({
                        res_id: resPartnerId1,
                        res_model: "res.partner",
                        views: [[false, "form"]],
                    });
                    assert.strictEqual(
                        document.querySelectorAll(`.o-mail-chatter`).length,
                        1,
                        "should have a chatter"
                    );
                    assert.strictEqual(
                        document.querySelectorAll(`.o-mail-chatter-topbar`).length,
                        1,
                        "should have a chatter topbar"
                    );
                    assert.strictEqual(
                        document.querySelectorAll(`.o_Chatter_attachmentBox`).length,
                        0,
                        "should not have an attachment box in the chatter"
                    );
                    assert.strictEqual(
                        document.querySelectorAll(`.o_Chatter_thread`).length,
                        1,
                        "should have a thread in the chatter"
                    );
                    assert.containsOnce(
                        document.body,
                        `.o_Chatter_thread[data-thread-id="${resPartnerId1}"][data-thread-model="res.partner"]`,
                        "chatter should have the right thread."
                    );
                    assert.strictEqual(
                        document.querySelectorAll(`.o-mail-message`).length,
                        30,
                        "the first 30 messages of thread should be loaded"
                    );
                }
            );

            QUnit.skipRefactoring(
                "base rendering when chatter has no record",
                async function (assert) {
                    assert.expect(9);

                    const { click, openView } = await start();
                    await openView({
                        res_model: "res.partner",
                        views: [[false, "form"]],
                    });
                    assert.strictEqual(
                        document.querySelectorAll(`.o-mail-chatter`).length,
                        1,
                        "should have a chatter"
                    );
                    assert.strictEqual(
                        document.querySelectorAll(`.o-mail-chatter-topbar`).length,
                        1,
                        "should have a chatter topbar"
                    );
                    assert.strictEqual(
                        document.querySelectorAll(`.o_Chatter_attachmentBox`).length,
                        0,
                        "should not have an attachment box in the chatter"
                    );
                    assert.strictEqual(
                        document.querySelectorAll(`.o_Chatter_thread`).length,
                        1,
                        "should have a thread in the chatter"
                    );
                    assert.strictEqual(
                        document.querySelectorAll(`.o-mail-message`).length,
                        1,
                        "should have a message"
                    );
                    assert.strictEqual(
                        document.querySelector(`.o-mail-message-body`).textContent,
                        "Creating a new record...",
                        "should have the 'Creating a new record ...' message"
                    );
                    assert.containsNone(
                        document.body,
                        ".o_MessageListView_loadMore",
                        "should not have the 'load more' button"
                    );

                    await click(".o-mail-message");
                    assert.strictEqual(
                        document.querySelectorAll(`.o_MessageActionList`).length,
                        1,
                        "should action list in message"
                    );
                    assert.containsNone(
                        document.body,
                        ".o_MessageActionView",
                        "should not have any action in action list of message"
                    );
                }
            );

            QUnit.skipRefactoring(
                "base rendering when chatter has attachments",
                async function (assert) {
                    assert.expect(3);

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
                    const { openView } = await start();
                    await openView({
                        res_id: resPartnerId1,
                        res_model: "res.partner",
                        views: [[false, "form"]],
                    });
                    assert.strictEqual(
                        document.querySelectorAll(`.o-mail-chatter`).length,
                        1,
                        "should have a chatter"
                    );
                    assert.strictEqual(
                        document.querySelectorAll(`.o-mail-chatter-topbar`).length,
                        1,
                        "should have a chatter topbar"
                    );
                    assert.strictEqual(
                        document.querySelectorAll(`.o_Chatter_attachmentBox`).length,
                        0,
                        "should not have an attachment box in the chatter"
                    );
                }
            );

            QUnit.skipRefactoring("show attachment box", async function (assert) {
                assert.expect(6);

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
                const { click, openView } = await start();
                await openView({
                    res_id: resPartnerId1,
                    res_model: "res.partner",
                    views: [[false, "form"]],
                });
                assert.strictEqual(
                    document.querySelectorAll(`.o-mail-chatter`).length,
                    1,
                    "should have a chatter"
                );
                assert.strictEqual(
                    document.querySelectorAll(`.o-mail-chatter-topbar`).length,
                    1,
                    "should have a chatter topbar"
                );
                assert.strictEqual(
                    document.querySelectorAll(`.o_ChatterTopbar_buttonToggleAttachments`).length,
                    1,
                    "should have an attachments button in chatter topbar"
                );
                assert.strictEqual(
                    document.querySelectorAll(`.o_ChatterTopbar_buttonAttachmentsCount`).length,
                    1,
                    "attachments button should have a counter"
                );
                assert.strictEqual(
                    document.querySelectorAll(`.o_Chatter_attachmentBox`).length,
                    0,
                    "should not have an attachment box in the chatter"
                );

                await click(`.o_ChatterTopbar_buttonToggleAttachments`);
                assert.strictEqual(
                    document.querySelectorAll(`.o_Chatter_attachmentBox`).length,
                    1,
                    "should have an attachment box in the chatter"
                );
            });

            QUnit.skipRefactoring(
                "composer show/hide on log note/send message [REQUIRE FOCUS]",
                async function (assert) {
                    assert.expect(10);

                    const pyEnv = await startServer();
                    const resPartnerId1 = pyEnv["res.partner"].create({});
                    const { click, openView } = await start();
                    await openView({
                        res_id: resPartnerId1,
                        res_model: "res.partner",
                        views: [[false, "form"]],
                    });
                    assert.strictEqual(
                        document.querySelectorAll(`.o-mail-chatter-topbar-send-message-button`)
                            .length,
                        1,
                        "should have a send message button"
                    );
                    assert.strictEqual(
                        document.querySelectorAll(`.o-mail-chatter-topbar-log-note-button`).length,
                        1,
                        "should have a log note button"
                    );
                    assert.strictEqual(
                        document.querySelectorAll(`.o_Chatter_composer`).length,
                        0,
                        "should not have a composer"
                    );

                    await click(`.o-mail-chatter-topbar-send-message-button`);
                    assert.strictEqual(
                        document.querySelectorAll(`.o_Chatter_composer`).length,
                        1,
                        "should have a composer"
                    );
                    assert.hasClass(
                        document.querySelector(".o_Chatter_composer"),
                        "o-focused",
                        "composer 'send message' in chatter should have focus just after being displayed"
                    );

                    await click(`.o-mail-chatter-topbar-log-note-button`);
                    assert.strictEqual(
                        document.querySelectorAll(`.o_Chatter_composer`).length,
                        1,
                        "should still have a composer"
                    );
                    assert.hasClass(
                        document.querySelector(".o_Chatter_composer"),
                        "o-focused",
                        "composer 'log note' in chatter should have focus just after being displayed"
                    );

                    await click(`.o-mail-chatter-topbar-log-note-button`);
                    assert.strictEqual(
                        document.querySelectorAll(`.o_Chatter_composer`).length,
                        0,
                        "should have no composer anymore"
                    );

                    await click(`.o-mail-chatter-topbar-send-message-button`);
                    assert.strictEqual(
                        document.querySelectorAll(`.o_Chatter_composer`).length,
                        1,
                        "should have a composer"
                    );

                    await click(`.o-mail-chatter-topbar-send-message-button`);
                    assert.strictEqual(
                        document.querySelectorAll(`.o_Chatter_composer`).length,
                        0,
                        "should have no composer anymore"
                    );
                }
            );

            QUnit.skipRefactoring(
                "should not display subject when subject is the same as the thread name",
                async function (assert) {
                    assert.expect(1);

                    const pyEnv = await startServer();
                    const resPartnerId1 = pyEnv["res.partner"].create({
                        name: "Salutations, voyageur",
                    });
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

                    assert.containsNone(target, ".o-mail-message-subject");
                }
            );

            QUnit.skipRefactoring(
                'post message with "CTRL-Enter" keyboard shortcut',
                async function (assert) {
                    assert.expect(2);

                    const pyEnv = await startServer();
                    const resPartnerId1 = pyEnv["res.partner"].create({});
                    const { click, insertText, openView } = await start();
                    await openView({
                        res_id: resPartnerId1,
                        res_model: "res.partner",
                        views: [[false, "form"]],
                    });
                    assert.containsNone(
                        document.body,
                        ".o-mail-message",
                        "should not have any message initially in chatter"
                    );

                    await click(".o-mail-chatter-topbar-send-message-button");
                    await insertText(".o-mail-composer-textarea", "Test");
                    await afterNextRender(() => {
                        const kevt = new window.KeyboardEvent("keydown", {
                            ctrlKey: true,
                            key: "Enter",
                        });
                        document.querySelector(".o-mail-composer-textarea").dispatchEvent(kevt);
                    });
                    assert.containsOnce(
                        document.body,
                        ".o-mail-message",
                        "should now have single message in chatter after posting message from pressing 'CTRL-Enter' in text input of composer"
                    );
                }
            );

            QUnit.skipRefactoring(
                'post message with "META-Enter" keyboard shortcut',
                async function (assert) {
                    assert.expect(2);

                    const pyEnv = await startServer();
                    const resPartnerId1 = pyEnv["res.partner"].create({});
                    const { click, insertText, openView } = await start();
                    await openView({
                        res_id: resPartnerId1,
                        res_model: "res.partner",
                        views: [[false, "form"]],
                    });
                    assert.containsNone(
                        document.body,
                        ".o-mail-message",
                        "should not have any message initially in chatter"
                    );

                    await click(".o-mail-chatter-topbar-send-message-button");
                    await insertText(".o-mail-composer-textarea", "Test");
                    await afterNextRender(() => {
                        const kevt = new window.KeyboardEvent("keydown", {
                            key: "Enter",
                            metaKey: true,
                        });
                        document.querySelector(".o-mail-composer-textarea").dispatchEvent(kevt);
                    });
                    assert.containsOnce(
                        document.body,
                        ".o-mail-message",
                        "should now have single message in channel after posting message from pressing 'META-Enter' in text input of composer"
                    );
                }
            );

            QUnit.skipRefactoring(
                'do not post message with "Enter" keyboard shortcut',
                async function (assert) {
                    // Note that test doesn't assert Enter makes a newline, because this
                    // default browser cannot be simulated with just dispatching
                    // programmatically crafted events...
                    assert.expect(2);

                    const pyEnv = await startServer();
                    const resPartnerId1 = pyEnv["res.partner"].create({});
                    const { click, insertText, openView } = await start();
                    await openView({
                        res_id: resPartnerId1,
                        res_model: "res.partner",
                        views: [[false, "form"]],
                    });
                    assert.containsNone(
                        document.body,
                        ".o-mail-message",
                        "should not have any message initially in chatter"
                    );

                    await click(".o-mail-chatter-topbar-send-message-button");
                    await insertText(".o-mail-composer-textarea", "Test");
                    const kevt = new window.KeyboardEvent("keydown", { key: "Enter" });
                    document.querySelector(".o-mail-composer-textarea").dispatchEvent(kevt);
                    await nextAnimationFrame();
                    assert.containsNone(
                        document.body,
                        ".o-mail-message",
                        "should still not have any message in mailing channel after pressing 'Enter' in text input of composer"
                    );
                }
            );
        });
    });
});
