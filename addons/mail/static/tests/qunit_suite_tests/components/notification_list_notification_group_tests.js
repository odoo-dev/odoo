/** @odoo-module **/

import { afterNextRender, start, startServer } from "@mail/../tests/helpers/test_utils";

QUnit.module("mail", {}, function () {
    QUnit.module("components", {}, function () {
        QUnit.module("notification_list_notification_group_tests.js");

        QUnit.skipRefactoring("notification group basic layout", async function (assert) {
            assert.expect(10);

            const pyEnv = await startServer();
            const mailChannelId1 = pyEnv["mail.channel"].create({});
            const mailMessageId1 = pyEnv["mail.message"].create({
                message_type: "email", // message must be email (goal of the test)
                model: "mail.channel", // expected value to link message to channel
                res_id: mailChannelId1,
                res_model_name: "Channel", // random res model name, will be asserted in the test
            });
            pyEnv["mail.notification"].create([
                {
                    mail_message_id: mailMessageId1,
                    notification_status: "exception",
                    notification_type: "email",
                },
                {
                    mail_message_id: mailMessageId1,
                    notification_status: "exception",
                    notification_type: "email",
                },
            ]);
            const { click } = await start();
            await click(".o_menu_systray .dropdown-toggle:has(i[aria-label='Messages'])");
            assert.containsOnce(
                document.body,
                ".o_NotificationGroupView",
                "should have 1 notification group"
            );
            assert.containsOnce(
                document.body,
                ".o_NotificationGroupView_name",
                "should have 1 group name"
            );
            assert.strictEqual(
                document.querySelector(".o_NotificationGroupView_name").textContent,
                "Channel",
                "should have model name as group name"
            );
            assert.containsOnce(
                document.body,
                ".o_NotificationGroupView_counter",
                "should have 1 group counter"
            );
            assert.strictEqual(
                document.querySelector(".o_NotificationGroupView_counter").textContent.trim(),
                "(2)",
                "should have 2 notifications in the group"
            );
            assert.containsOnce(
                document.body,
                ".o_NotificationGroupView_date",
                "should have 1 group date"
            );
            assert.strictEqual(
                document.querySelector(".o_NotificationGroupView_date").textContent,
                "a few seconds ago",
                "should have the group date corresponding to now"
            );
            assert.containsOnce(
                document.body,
                ".o_NotificationGroupView_inlineText",
                "should have 1 group text"
            );
            assert.strictEqual(
                document.querySelector(".o_NotificationGroupView_inlineText").textContent.trim(),
                "An error occurred when sending an email.",
                "should have the group text corresponding to email"
            );
            assert.containsOnce(
                document.body,
                ".o_NotificationGroupView_markAsRead",
                "should have 1 mark as read button"
            );
        });

        QUnit.skipRefactoring("mark as read", async function (assert) {
            assert.expect(2);

            const pyEnv = await startServer();
            const mailChannelId1 = pyEnv["mail.channel"].create({});
            const mailMessageId1 = pyEnv["mail.message"].create({
                message_type: "email", // message must be email (goal of the test)
                model: "mail.channel", // expected value to link message to channel
                res_id: mailChannelId1,
                res_model_name: "Channel", // random res model name, will be asserted in the test
            });
            // failure that is expected to be used in the test
            pyEnv["mail.notification"].create({
                mail_message_id: mailMessageId1, // id of the related message
                notification_status: "exception", // necessary value to have a failure
                notification_type: "email",
            });
            const { click } = await start();
            await click(".o_menu_systray .dropdown-toggle:has(i[aria-label='Messages'])");
            assert.containsOnce(
                document.body,
                ".o_NotificationGroupView_markAsRead",
                "should have 1 mark as read button"
            );

            await afterNextRender(() => {
                document.querySelector(".o_NotificationGroupView_markAsRead").click();
            });
            assert.containsNone(
                document.body,
                ".o_NotificationGroupView",
                "should have no notification group"
            );
        });
    });
});
