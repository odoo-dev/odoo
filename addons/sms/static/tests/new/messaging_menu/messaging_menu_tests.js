/** @odoo-module **/

import { start, startServer, click } from "@mail/../tests/helpers/test_utils";
import { getFixture, patchWithCleanup } from "@web/../tests/helpers/utils";

let target;

QUnit.module("sms message menu", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test("mark as read", async function (assert) {
    const pyEnv = await startServer();
    const mailMessageId1 = pyEnv["mail.message"].create({
        message_type: "sms",
        model: "res.partner",
        res_id: pyEnv.currentPartnerId,
        res_model_name: "Partner",
    });
    pyEnv["mail.notification"].create({
        mail_message_id: mailMessageId1,
        notification_status: "exception",
        notification_type: "sms",
    });
    await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    assert.containsOnce(target, ".o-mail-notification-item");
    assert.containsOnce(target, ".o-mail-notification-item i[title='Mark As Read']");
    assert.containsOnce(
        target,
        ".o-mail-notification-item:contains(An error occurred when sending an SMS)"
    );
    await click(".o-mail-notification-item i[title='Mark As Read']");
    assert.containsNone(target, ".o-mail-notification-item");
});

QUnit.test("notifications grouped by notification_type", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    const [mailMessageId1, mailMessageId2] = pyEnv["mail.message"].create([
        {
            message_type: "sms",
            model: "res.partner",
            res_id: resPartnerId1,
            res_model_name: "Partner",
        },
        {
            message_type: "email",
            model: "res.partner",
            res_id: resPartnerId1,
            res_model_name: "Partner",
        },
    ]);
    pyEnv["mail.notification"].create([
        {
            mail_message_id: mailMessageId1,
            notification_status: "exception",
            notification_type: "sms",
        },
        {
            mail_message_id: mailMessageId1,
            notification_status: "exception",
            notification_type: "sms",
        },
        {
            mail_message_id: mailMessageId2,
            notification_status: "exception",
            notification_type: "email",
        },
        {
            mail_message_id: mailMessageId2,
            notification_status: "exception",
            notification_type: "email",
        },
    ]);
    await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    assert.containsN(target, ".o-mail-notification-item", 2);
    const items = target.querySelectorAll(".o-mail-notification-item");
    assert.ok(items[0].textContent.includes("Partner (2)"));
    assert.ok(items[0].textContent.includes("An error occurred when sending an email"));
    assert.ok(items[1].textContent.includes("Partner (2)"));
    assert.ok(items[1].textContent.includes("An error occurred when sending an SMS"));
});

QUnit.test("grouped notifications by document model", async function (assert) {
    const pyEnv = await startServer();
    const [mailMessageId1, mailMessageId2] = pyEnv["mail.message"].create([
        {
            message_type: "sms",
            model: "res.partner",
            res_id: 31,
            res_model_name: "Partner",
        },
        {
            message_type: "sms",
            model: "res.partner",
            res_id: 32,
            res_model_name: "Partner",
        },
    ]);
    pyEnv["mail.notification"].create([
        {
            mail_message_id: mailMessageId1,
            notification_status: "exception",
            notification_type: "sms",
        },
        {
            mail_message_id: mailMessageId2,
            notification_status: "exception",
            notification_type: "sms",
        },
    ]);
    const { click, env } = await start();
    patchWithCleanup(env.services.action, {
        doAction(action) {
            assert.step("do_action");
            assert.strictEqual(action.name, "SMS Failures");
            assert.strictEqual(action.type, "ir.actions.act_window");
            assert.strictEqual(action.view_mode, "kanban,list,form");
            assert.strictEqual(
                JSON.stringify(action.views),
                JSON.stringify([
                    [false, "kanban"],
                    [false, "list"],
                    [false, "form"],
                ])
            );
            assert.strictEqual(action.target, "current");
            assert.strictEqual(action.res_model, "res.partner");
            assert.strictEqual(
                JSON.stringify(action.domain),
                JSON.stringify([["message_has_sms_error", "=", true]])
            );
        },
    });

    await click(".o_menu_systray i[aria-label='Messages']");
    assert.containsOnce(target, ".o-mail-notification-item");
    assert.containsOnce(target, ".o-mail-notification-item:contains(Partner (2))");
    await click(".o-mail-notification-item");
    assert.verifySteps(["do_action"]);
});
