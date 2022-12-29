/** @odoo-module **/

import { afterNextRender, click, start, startServer } from "@mail/../tests/helpers/test_utils";

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

        QUnit.skipRefactoring("different mail.channel are not grouped", async function (assert) {
            // `mail.channel` is a special case where notifications are not grouped when
            // they are linked to different channels, even though the model is the same.
            assert.expect(6);

            const pyEnv = await startServer();
            const [mailChannelId1, mailChannelId2] = pyEnv["mail.channel"].create([
                { name: "mailChannel1" },
                { name: "mailChannel2" },
            ]);
            const [mailMessageId1, mailMessageId2] = pyEnv["mail.message"].create([
                // first message that is expected to have a failure
                {
                    message_type: "email", // message must be email (goal of the test)
                    model: "mail.channel", // testing a channel is the goal of the test
                    res_id: mailChannelId1, // different res_id from second message
                    res_model_name: "Channel", // random related model name
                },
                // second message that is expected to have a failure
                {
                    message_type: "email", // message must be email (goal of the test)
                    model: "mail.channel", // testing a channel is the goal of the test
                    res_id: mailChannelId2, // different res_id from first message
                    res_model_name: "Channel", // same related model name for consistency
                },
            ]);
            pyEnv["mail.notification"].create([
                {
                    mail_message_id: mailMessageId1, // id of the related first message
                    notification_status: "exception", // one possible value to have a failure
                    notification_type: "email", // expected failure type for email message
                },
                {
                    mail_message_id: mailMessageId1,
                    notification_status: "exception",
                    notification_type: "email",
                },
                {
                    mail_message_id: mailMessageId2, // id of the related second message
                    notification_status: "bounce", // other possible value to have a failure
                    notification_type: "email", // expected failure type for email message
                },
                {
                    mail_message_id: mailMessageId2,
                    notification_status: "bounce",
                    notification_type: "email",
                },
            ]);
            await start();
            await click(".o_menu_systray i[aria-label='Messages']");
            assert.containsN(
                document.body,
                ".o-mail-notification-item",
                2,
                "should have 2 notifications items"
            );
            const items = document.querySelectorAll(".o-mail-notification-item");
            assert.containsOnce(
                items[0],
                "*:contains(Partner (1))",
                "should have 1 group counter in first group"
            );
            assert.strictEqual(
                items[0].querySelector(".o_NotificationGroupView_counter").textContent.trim(),
                "(2)",
                "should have 2 notifications in first group"
            );
            assert.containsOnce(
                items[1],
                ".o_NotificationGroupView_counter",
                "should have 1 group counter in second group"
            );
            assert.strictEqual(
                items[1].querySelector(".o_NotificationGroupView_counter").textContent.trim(),
                "(2)",
                "should have 2 notifications in second group"
            );

            await afterNextRender(() => items[0].click());
            assert.containsOnce(
                document.body,
                ".o-mail-chat-window",
                "should have opened the channel related to the first group in a chat window"
            );
        });
    });
});
