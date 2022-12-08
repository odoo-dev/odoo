/** @odoo-module **/

import { afterNextRender, start, startServer } from "@mail/../tests/helpers/test_utils";

import { patchWithCleanup } from "@web/../tests/helpers/utils";

QUnit.module("mail", (hooks) => {
    QUnit.module("components", {}, function () {
        QUnit.module("discuss_inbox_tests.js");

        QUnit.skipRefactoring("reply: discard on pressing escape", async function (assert) {
            assert.expect(9);

            const pyEnv = await startServer();
            // partner expected to be found by mention
            pyEnv["res.partner"].create({
                email: "testpartnert@odoo.com",
                name: "TestPartner",
            });
            const mailMessageId1 = pyEnv["mail.message"].create({
                body: "not empty",
                model: "res.partner",
                needaction: true,
                needaction_partner_ids: [pyEnv.currentPartnerId],
                res_id: 20,
            });
            pyEnv["mail.notification"].create({
                mail_message_id: mailMessageId1,
                notification_status: "sent",
                notification_type: "inbox",
                res_partner_id: pyEnv.currentPartnerId,
            });
            const { afterEvent, click, insertText, messaging, openDiscuss } = await start();
            await afterEvent({
                eventName: "o-thread-view-hint-processed",
                func: openDiscuss,
                message: "should wait until inbox displayed its messages",
                predicate: ({ hint, threadViewer }) => {
                    return (
                        hint.type === "messages-loaded" &&
                        threadViewer.thread === messaging.inbox.thread
                    );
                },
            });
            assert.containsOnce(
                document.body,
                ".o-mail-message",
                "should display a single message"
            );
            await click(".o-mail-message");
            await click(".o_MessageActionView_actionReplyTo");
            assert.containsOnce(
                document.body,
                ".o_ComposerView",
                "should have composer after clicking on reply to message"
            );

            await click(`.o_ComposerView_buttonEmojis`);
            assert.containsOnce(
                document.body,
                ".o_EmojiPickerView",
                "emoji list should be opened after click on emojis button"
            );

            await afterNextRender(() => {
                const ev = new window.KeyboardEvent("keydown", { bubbles: true, key: "Escape" });
                document.querySelector(`.o_ComposerView_buttonEmojis`).dispatchEvent(ev);
            });
            assert.containsNone(
                document.body,
                ".o_EmojiPickerView",
                "emoji list should be closed after pressing escape on emojis button"
            );
            assert.containsOnce(
                document.body,
                ".o_ComposerView",
                "reply composer should still be opened after pressing escape on emojis button"
            );

            await insertText(".o-mail-composer-textarea", "@Te");
            assert.containsOnce(
                document.body,
                ".o_ComposerSuggestionView",
                "mention suggestion should be opened after typing @"
            );

            await afterNextRender(() => {
                const ev = new window.KeyboardEvent("keydown", { bubbles: true, key: "Escape" });
                document.querySelector(`.o-mail-composer-textarea`).dispatchEvent(ev);
            });
            assert.containsNone(
                document.body,
                ".o_ComposerSuggestionView",
                "mention suggestion should be closed after pressing escape on mention suggestion"
            );
            assert.containsOnce(
                document.body,
                ".o_ComposerView",
                "reply composer should still be opened after pressing escape on mention suggestion"
            );

            await afterNextRender(() => {
                const ev = new window.KeyboardEvent("keydown", { bubbles: true, key: "Escape" });
                document.querySelector(`.o-mail-composer-textarea`).dispatchEvent(ev);
            });
            assert.containsNone(
                document.body,
                ".o_ComposerView",
                "reply composer should be closed after pressing escape if there was no other priority escape handler"
            );
        });

        QUnit.skipRefactoring("reply: discard on discard button click", async function (assert) {
            assert.expect(4);

            const pyEnv = await startServer();
            const resPartnerId1 = pyEnv["res.partner"].create({});
            const mailMessageId1 = pyEnv["mail.message"].create({
                body: "not empty",
                model: "res.partner",
                needaction: true,
                needaction_partner_ids: [pyEnv.currentPartnerId],
                res_id: resPartnerId1,
            });
            pyEnv["mail.notification"].create({
                mail_message_id: mailMessageId1,
                notification_status: "sent",
                notification_type: "inbox",
                res_partner_id: pyEnv.currentPartnerId,
            });
            const { click, openDiscuss } = await start();
            await openDiscuss();
            assert.containsOnce(
                document.body,
                ".o-mail-message",
                "should display a single message"
            );

            await click("i[aria-label='Reply']");
            assert.containsOnce(
                document.body,
                ".o-mail-composer",
                "should have composer after clicking on reply to message"
            );
            assert.containsOnce(
                document.body,
                "i[title='Stop replying']",
                "composer should have a discard button"
            );

            await click("i[title='Stop replying']");
            assert.containsNone(
                document.body,
                ".o-mail-composer",
                "reply composer should be closed after clicking on discard"
            );
        });

        QUnit.skipRefactoring(
            "error notifications should not be shown in Inbox",
            async function (assert) {
                assert.expect(3);

                const pyEnv = await startServer();
                const resPartnerId1 = pyEnv["res.partner"].create({});
                const mailMessageId1 = pyEnv["mail.message"].create({
                    body: "not empty",
                    model: "mail.channel",
                    needaction: true,
                    needaction_partner_ids: [pyEnv.currentPartnerId],
                    res_id: resPartnerId1,
                });
                pyEnv["mail.notification"].create({
                    mail_message_id: mailMessageId1, // id of related message
                    notification_status: "exception",
                    notification_type: "email",
                    res_partner_id: pyEnv.currentPartnerId, // must be for current partner
                });
                const { openDiscuss } = await start();
                await openDiscuss();
                assert.containsOnce(
                    document.body,
                    ".o-mail-message",
                    "should display a single message"
                );
                assert.containsOnce(
                    document.body,
                    ".o_MessageView_originThreadLink",
                    "should display origin thread link"
                );
                assert.containsNone(
                    document.body,
                    ".o_MessageView_notificationIcon",
                    "should not display any notification icon in Inbox"
                );
            }
        );

        QUnit.skipRefactoring(
            "click on (non-channel/non-partner) origin thread link should redirect to form view",
            async function (assert) {
                assert.expect(9);

                const pyEnv = await startServer();
                const resFakeId1 = pyEnv["res.fake"].create({ name: "Some record" });
                const mailMessageId1 = pyEnv["mail.message"].create({
                    body: "not empty",
                    model: "res.fake",
                    needaction: true,
                    needaction_partner_ids: [pyEnv.currentPartnerId],
                    res_id: resFakeId1,
                });
                pyEnv["mail.notification"].create({
                    mail_message_id: mailMessageId1,
                    notification_status: "sent",
                    notification_type: "inbox",
                    res_partner_id: pyEnv.currentPartnerId,
                });
                const { afterEvent, env, messaging, openDiscuss } = await start();
                await afterEvent({
                    eventName: "o-thread-view-hint-processed",
                    func: openDiscuss,
                    message: "should wait until inbox displayed its messages",
                    predicate: ({ hint, threadViewer }) => {
                        return (
                            hint.type === "messages-loaded" &&
                            threadViewer.thread === messaging.inbox.thread
                        );
                    },
                });
                patchWithCleanup(env.services.action, {
                    doAction(action) {
                        // Callback of doing an action (action manager).
                        // Expected to be called on click on origin thread link,
                        // which redirects to form view of record related to origin thread
                        assert.step("do-action");
                        assert.strictEqual(
                            action.type,
                            "ir.actions.act_window",
                            "action should open a view"
                        );
                        assert.deepEqual(
                            action.views,
                            [[false, "form"]],
                            "action should open form view"
                        );
                        assert.strictEqual(
                            action.res_model,
                            "res.fake",
                            "action should open view with model 'res.fake' (model of message origin thread)"
                        );
                        assert.strictEqual(
                            action.res_id,
                            resFakeId1,
                            "action should open view with id of resFake1 (id of message origin thread)"
                        );
                        return Promise.resolve();
                    },
                });
                assert.containsOnce(
                    document.body,
                    ".o-mail-message",
                    "should display a single message"
                );
                assert.containsOnce(
                    document.body,
                    ".o_MessageView_originThreadLink",
                    "should display origin thread link"
                );
                assert.strictEqual(
                    document.querySelector(".o_MessageView_originThreadLink").textContent,
                    "Some record",
                    "origin thread link should display record name"
                );

                document.querySelector(".o_MessageView_originThreadLink").click();
                assert.verifySteps(
                    ["do-action"],
                    "should have made an action on click on origin thread (to open form view)"
                );
            }
        );
    });
});
