/** @odoo-module **/

import { afterNextRender, start, startServer } from "@mail/../tests/helpers/test_utils";

QUnit.module("mail", {}, function () {
    QUnit.module("components", {}, function () {
        QUnit.module("thread_needaction_preview_tests.js");

        QUnit.skipRefactoring(
            "chat window header should not have unread counter for non-channel thread",
            async function (assert) {
                assert.expect(2);

                const pyEnv = await startServer();
                const resPartnerId1 = pyEnv["res.partner"].create({});
                const mailMessageId1 = pyEnv["mail.message"].create({
                    author_id: resPartnerId1,
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
                const { afterEvent, click, messaging } = await start();
                await afterNextRender(() =>
                    afterEvent({
                        eventName: "o-thread-cache-loaded-messages",
                        func: () =>
                            document
                                .querySelector(
                                    ".o_menu_systray .dropdown-toggle:has(i[aria-label='Messages'])"
                                )
                                .click(),
                        message: "should wait until inbox loaded initial needaction messages",
                        predicate: ({ threadCache }) => {
                            return threadCache.thread === messaging.inbox.thread;
                        },
                    })
                );
                await click(".o_ThreadNeedactionPreviewView");
                assert.containsOnce(
                    document.body,
                    ".o-mail-chat-window",
                    "should have opened the chat window on clicking on the preview"
                );
                assert.containsNone(
                    document.body,
                    ".o_ChatWindowHeaderView_counter",
                    "chat window header should not have unread counter for non-channel thread"
                );
            }
        );
    });
});
