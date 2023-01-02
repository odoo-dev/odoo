/** @odoo-module **/

import { afterNextRender, click, start, startServer } from "@mail/../tests/helpers/test_utils";
import { getFixture, patchWithCleanup, triggerHotkey } from "@web/../tests/helpers/utils";
import { date_to_str } from "web.time";

let target;

QUnit.module("activity", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test("activity upload document is available", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    const uploadActivityTypeId = pyEnv["mail.activity.type"].search([
        ["name", "=", "Upload Document"],
    ])[0];
    pyEnv["mail.activity"].create({
        activity_category: "upload_file",
        activity_type_id: uploadActivityTypeId,
        can_write: true,
        res_id: resPartnerId1,
        res_model: "res.partner",
    });
    const { openView } = await start();
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-activity-name:contains('Upload Document')");
    assert.containsOnce(target, ".fa-upload", "Should have activity upload button");
    assert.containsOnce(target, ".o_input_file", "Should have a file uploader");
});

QUnit.test("activity simplest layout", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    pyEnv["mail.activity"].create({
        res_id: resPartnerId1,
        res_model: "res.partner",
    });
    const { openView } = await start();
    await openView({
        res_model: "res.partner",
        res_id: resPartnerId1,
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-activity");
    assert.containsOnce(target, ".o-mail-activity-sidebar");
    assert.containsOnce(target, ".o-mail-activity-user");
    assert.containsOnce(target, ".o-mail-activity-info");
    assert.containsNone(target, ".o-activity-note");
    assert.containsNone(target, ".o-mail-activity-details");
    assert.containsNone(target, ".o-mail-activity-mail-templates");
    assert.containsNone(target, ".btn:contains('Edit')");
    assert.containsNone(target, ".o-mail-activity-unlink-button");
    assert.containsNone(target, ".btn:contains('Mark Done')");
    assert.containsNone(target, ".o-mail-activity-name:contains('Upload Document')");
});

QUnit.test("activity with note layout", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    pyEnv["mail.activity"].create({
        note: "<p>There is no good or bad note</p>",
        res_id: resPartnerId1,
        res_model: "res.partner",
    });
    const { openView } = await start();
    await openView({
        res_model: "res.partner",
        res_id: resPartnerId1,
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-activity");
    assert.containsOnce(target, ".o-activity-note");
    assert.strictEqual($(target).find(".o-activity-note").text(), "There is no good or bad note");
});

QUnit.test("activity info layout when planned after tomorrow", async function (assert) {
    const today = new Date();
    const fiveDaysFromNow = new Date();
    fiveDaysFromNow.setDate(today.getDate() + 5);
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    pyEnv["mail.activity"].create({
        date_deadline: date_to_str(fiveDaysFromNow),
        res_id: resPartnerId1,
        res_model: "res.partner",
        state: "planned",
    });
    const { openView } = await start();
    await openView({
        res_model: "res.partner",
        res_id: resPartnerId1,
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-activity");
    assert.containsOnce(target, ".o-mail-activity-due-date");
    assert.hasClass($(target).find(".o-mail-activity-due-date"), "text-success");
    assert.strictEqual($(target).find(".o-mail-activity-due-date").text(), "Due in 5 days:");
});

QUnit.test("activity info layout when planned tomorrow", async function (assert) {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    pyEnv["mail.activity"].create({
        date_deadline: date_to_str(tomorrow),
        res_id: resPartnerId1,
        res_model: "res.partner",
        state: "planned",
    });
    const { openView } = await start();
    await openView({
        res_model: "res.partner",
        res_id: resPartnerId1,
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-activity");
    assert.containsOnce(target, ".o-mail-activity-due-date");
    assert.hasClass($(target).find(".o-mail-activity-due-date"), "text-success");
    assert.strictEqual($(target).find(".o-mail-activity-due-date").text(), "Tomorrow:");
});

QUnit.test("activity info layout when planned today", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    pyEnv["mail.activity"].create({
        date_deadline: date_to_str(new Date()),
        res_id: resPartnerId1,
        res_model: "res.partner",
        state: "today",
    });
    const { openView } = await start();
    await openView({
        res_model: "res.partner",
        res_id: resPartnerId1,
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-activity");
    assert.containsOnce(target, ".o-mail-activity-due-date");
    assert.hasClass($(target).find(".o-mail-activity-due-date"), "text-warning");
    assert.strictEqual($(target).find(".o-mail-activity-due-date").text(), "Today:");
});

QUnit.test("activity info layout when planned yesterday", async function (assert) {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    pyEnv["mail.activity"].create({
        date_deadline: date_to_str(yesterday),
        res_id: resPartnerId1,
        res_model: "res.partner",
        state: "overdue",
    });
    const { openView } = await start();
    await openView({
        res_model: "res.partner",
        res_id: resPartnerId1,
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-activity");
    assert.containsOnce(target, ".o-mail-activity-due-date");
    assert.hasClass($(target).find(".o-mail-activity-due-date"), "text-danger");
    assert.strictEqual($(target).find(".o-mail-activity-due-date").text(), "Yesterday:");
});

QUnit.test("activity info layout when planned before yesterday", async function (assert) {
    const today = new Date();
    const fiveDaysBeforeNow = new Date();
    fiveDaysBeforeNow.setDate(today.getDate() - 5);
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    pyEnv["mail.activity"].create({
        date_deadline: date_to_str(fiveDaysBeforeNow),
        res_id: resPartnerId1,
        res_model: "res.partner",
        state: "overdue",
    });
    const { openView } = await start();
    await openView({
        res_model: "res.partner",
        res_id: resPartnerId1,
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-activity");
    assert.containsOnce(target, ".o-mail-activity-due-date");
    assert.hasClass($(target).find(".o-mail-activity-due-date"), "text-danger");
    assert.strictEqual($(target).find(".o-mail-activity-due-date").text(), "5 days overdue:");
});

QUnit.test("activity with a summary layout", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    pyEnv["mail.activity"].create({
        res_id: resPartnerId1,
        res_model: "res.partner",
        summary: "test summary",
    });
    const { openView } = await start();
    await openView({
        res_model: "res.partner",
        res_id: resPartnerId1,
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-activity-name");
    assert.strictEqual($(target).find(".o-mail-activity-name").text().trim(), "“test summary”");
});

QUnit.test("activity without summary layout", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    pyEnv["mail.activity"].create({
        activity_type_id: 1,
        res_id: resPartnerId1,
        res_model: "res.partner",
    });
    const { openView } = await start();
    await openView({
        res_model: "res.partner",
        res_id: resPartnerId1,
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-activity-name");
    assert.strictEqual($(target).find(".o-mail-activity-name").text().trim(), "Email");
});

QUnit.test("activity details toggle", async function (assert) {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    const resUsersId1 = pyEnv["res.users"].create({ partner_id: resPartnerId1 });
    pyEnv["mail.activity"].create({
        create_date: date_to_str(today),
        create_uid: resUsersId1,
        date_deadline: date_to_str(tomorrow),
        res_id: resPartnerId1,
        res_model: "res.partner",
    });
    const { openView } = await start();
    await openView({
        res_model: "res.partner",
        res_id: resPartnerId1,
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-activity");
    assert.containsNone(target, ".o-mail-activity-details");
    assert.containsOnce(target, ".o-mail-activity-toggle");

    await click(".o-mail-activity-toggle");
    assert.containsOnce(target, ".o-mail-activity-details");

    await click(".o-mail-activity-toggle");
    assert.containsNone(target, ".o-mail-activity-details");
});

QUnit.test("activity with mail template layout", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    const mailTemplateId1 = pyEnv["mail.template"].create({ name: "Dummy mail template" });
    const emailActivityTypeId = pyEnv["mail.activity.type"].search([["name", "=", "Email"]])[0];
    pyEnv["mail.activity"].create({
        activity_type_id: emailActivityTypeId,
        mail_template_ids: [mailTemplateId1],
        res_id: resPartnerId1,
        res_model: "res.partner",
    });
    const { openView } = await start();
    await openView({
        res_model: "res.partner",
        res_id: resPartnerId1,
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-activity");
    assert.containsOnce(target, ".o-mail-activity-sidebar");
    assert.containsOnce(target, ".o-mail-activity-mail-templates");
    assert.containsOnce(target, ".o-mail-activity-mail-template-name");
    assert.strictEqual(
        $(target).find(".o-mail-activity-mail-template-name").text(),
        "Dummy mail template"
    );
    assert.containsOnce(target, ".o-mail-activity-mail-template-preview");
    assert.containsOnce(target, ".o-mail-activity-mail-template-send");
});

QUnit.test("activity with mail template: preview mail", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    const mailTemplateId1 = pyEnv["mail.template"].create({ name: "Dummy mail template" });
    const emailActivityTypeId = pyEnv["mail.activity.type"].search([["name", "=", "Email"]])[0];
    pyEnv["mail.activity"].create({
        activity_type_id: emailActivityTypeId,
        mail_template_ids: [mailTemplateId1],
        res_id: resPartnerId1,
        res_model: "res.partner",
    });
    const { env, openView } = await start();
    await openView({
        res_model: "res.partner",
        res_id: resPartnerId1,
        views: [[false, "form"]],
    });
    patchWithCleanup(env.services.action, {
        doAction(action) {
            assert.step("do_action");
            assert.strictEqual(
                action.context.default_res_id,
                resPartnerId1,
                "Action should have the activity res id as default res id in context"
            );
            assert.strictEqual(
                action.context.default_model,
                "res.partner",
                "Action should have the activity res model as default model in context"
            );
            assert.ok(
                action.context.default_use_template,
                "Action should have true as default use_template in context"
            );
            assert.strictEqual(
                action.context.default_template_id,
                mailTemplateId1,
                "Action should have the selected mail template id as default template id in context"
            );
            assert.strictEqual(
                action.type,
                "ir.actions.act_window",
                'Action should be of type "ir.actions.act_window"'
            );
            assert.strictEqual(
                action.res_model,
                "mail.compose.message",
                'Action should have "mail.compose.message" as res_model'
            );
        },
    });
    assert.strictEqual(
        document.querySelectorAll(".o-mail-activity").length,
        1,
        "should have activity component"
    );
    assert.strictEqual(
        document.querySelectorAll(".o-mail-activity-mail-template-preview").length,
        1,
        "should have activity mail template name preview button"
    );

    document.querySelector(".o-mail-activity-mail-template-preview").click();
    assert.verifySteps(["do_action"], "should have called 'compose email' action correctly");
});

QUnit.test("activity with mail template: send mail", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    const mailTemplateId1 = pyEnv["mail.template"].create({ name: "Dummy mail template" });
    const emailActivityTypeId = pyEnv["mail.activity.type"].search([["name", "=", "Email"]])[0];
    pyEnv["mail.activity"].create({
        activity_type_id: emailActivityTypeId,
        mail_template_ids: [mailTemplateId1],
        res_id: resPartnerId1,
        res_model: "res.partner",
    });
    const { openView } = await start({
        async mockRPC(route, args) {
            if (args.method === "activity_send_mail") {
                assert.step("activity_send_mail");
                assert.strictEqual(args.args[0].length, 1);
                assert.strictEqual(args.args[0][0], resPartnerId1);
                assert.strictEqual(args.args[1], mailTemplateId1);
                // random value returned in order for the mock server to know that this route is implemented.
                return true;
            }
        },
    });
    await openView({
        res_model: "res.partner",
        res_id: resPartnerId1,
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-activity");
    assert.containsOnce(target, ".o-mail-activity-mail-template-send");

    click(".o-mail-activity-mail-template-send").catch(() => {});
    assert.verifySteps(["activity_send_mail"]);
});

QUnit.test("activity click on mark as done", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    const emailActivityTypeId = pyEnv["mail.activity.type"].search([["name", "=", "Email"]])[0];
    pyEnv["mail.activity"].create({
        activity_category: "default",
        activity_type_id: emailActivityTypeId,
        can_write: true,
        res_id: resPartnerId1,
        res_model: "res.partner",
    });
    const { openView } = await start();
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-activity");
    assert.containsOnce(target, ".btn:contains('Mark Done')");

    await click(".btn:contains('Mark Done')");
    assert.containsOnce(target, ".o-mail-activity-mark-as-done");

    await click(".btn:contains('Mark Done')");
    assert.containsNone(target, ".o-mail-activity-mark-as-done");
});

QUnit.test(
    "activity mark as done popover should focus feedback input on open [REQUIRE FOCUS]",
    async function (assert) {
        const pyEnv = await startServer();
        const resPartnerId1 = pyEnv["res.partner"].create({});
        const emailActivityTypeId = pyEnv["mail.activity.type"].search([["name", "=", "Email"]])[0];
        pyEnv["mail.activity"].create({
            activity_category: "default",
            activity_type_id: emailActivityTypeId,
            can_write: true,
            res_id: resPartnerId1,
            res_model: "res.partner",
        });
        const { openView } = await start();
        await openView({
            res_id: resPartnerId1,
            res_model: "res.partner",
            views: [[false, "form"]],
        });
        assert.containsOnce(target, ".o-mail-activity");
        assert.containsOnce(target, ".btn:contains('Mark Done')");

        await click(".btn:contains('Mark Done')");
        assert.strictEqual(
            document.querySelector(".o-mail-activity-mark-as-done__feedback"),
            document.activeElement
        );
    }
);

QUnit.test("activity click on edit", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    const mailTemplateId1 = pyEnv["mail.template"].create({ name: "Dummy mail template" });
    const emailActivityTypeId = pyEnv["mail.activity.type"].search([["name", "=", "Email"]])[0];
    const mailActivityId1 = pyEnv["mail.activity"].create({
        activity_type_id: emailActivityTypeId,
        can_write: true,
        mail_template_ids: [mailTemplateId1],
        res_id: resPartnerId1,
        res_model: "res.partner",
    });
    const { env, openView } = await start();
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    patchWithCleanup(env.services.action, {
        doAction(action) {
            assert.step("do_action");
            assert.strictEqual(action.context.default_res_id, resPartnerId1);
            assert.strictEqual(action.context.default_res_model, "res.partner");
            assert.strictEqual(action.type, "ir.actions.act_window");
            assert.strictEqual(action.res_model, "mail.activity");
            assert.strictEqual(action.res_id, mailActivityId1);
            return this._super(...arguments);
        },
    });
    assert.containsOnce(target, ".o-mail-activity");
    assert.containsOnce(document.body, ".btn:contains('Edit')");

    await click(".btn:contains('Edit')");
    assert.verifySteps(["do_action"]);
});

QUnit.test("activity click on cancel", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    const emailActivityTypeId = pyEnv["mail.activity.type"].search([["name", "=", "Email"]])[0];
    const mailActivityId1 = pyEnv["mail.activity"].create({
        activity_type_id: emailActivityTypeId,
        can_write: true,
        res_id: resPartnerId1,
        res_model: "res.partner",
    });
    const { openView } = await start({
        async mockRPC(route, args) {
            if (route === "/web/dataset/call_kw/mail.activity/unlink") {
                assert.step("unlink");
                assert.strictEqual(args.args[0].length, 1);
                assert.strictEqual(args.args[0][0], mailActivityId1);
            }
        },
    });
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-activity");
    assert.containsOnce(target, ".o-mail-activity-unlink-button");

    await click(".o-mail-activity-unlink-button");
    assert.verifySteps(["unlink"]);
    assert.containsNone(target, ".o-mail-activity");
});

QUnit.test("activity mark done popover close on ESCAPE", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    const emailActivityTypeId = pyEnv["mail.activity.type"].search([["name", "=", "Email"]])[0];
    pyEnv["mail.activity"].create({
        activity_category: "default",
        activity_type_id: emailActivityTypeId,
        can_write: true,
        res_id: resPartnerId1,
        res_model: "res.partner",
    });
    const { openView } = await start();
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });

    await click(".btn:contains('Mark Done')");
    assert.containsOnce(target, ".o-mail-activity-mark-as-done");

    await afterNextRender(() => triggerHotkey("Escape"));
    assert.containsNone(target, ".o-mail-activity-mark-as-done");
});

QUnit.test("activity mark done popover click on discard", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    const emailActivityTypeId = pyEnv["mail.activity.type"].search([["name", "=", "Email"]])[0];
    pyEnv["mail.activity"].create({
        activity_category: "default",
        activity_type_id: emailActivityTypeId,
        can_write: true,
        res_id: resPartnerId1,
        res_model: "res.partner",
    });
    const { openView } = await start();
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });

    await click(".btn:contains('Mark Done')");
    assert.containsOnce(target, ".o-mail-activity-mark-as-done");
    assert.containsOnce(target, ".o-mail-activity-mark-as-done__discard");
    await click(".o-mail-activity-mark-as-done__discard");
    assert.containsNone(target, ".o-mail-activity-mark-as-done");
});
