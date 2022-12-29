/** @odoo-module **/

import { file } from "web.test_utils";
import {
    afterNextRender,
    click,
    start,
    startServer,
    createFile,
    waitUntil,
} from "@mail/../tests/helpers/test_utils";
import { patchDate, patchWithCleanup, triggerHotkey } from "@web/../tests/helpers/utils";
import { date_to_str } from "web.time";

const { inputFiles } = file;

const views = {
    "res.fake,false,form": `
        <form string="Fake">
            <sheet></sheet>
            <div class="oe_chatter">
                <field name="activity_ids"/>
                <field name="message_ids"/>
            </div>
        </form>`,
};

QUnit.module("activity");

QUnit.test("activity upload document is available", async (assert) => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    const [activityTypeId] = pyEnv["mail.activity.type"].search([["name", "=", "Upload Document"]]);
    pyEnv["mail.activity"].create({
        activity_category: "upload_file",
        activity_type_id: activityTypeId,
        can_write: true,
        res_id: partnerId,
        res_model: "res.partner",
    });
    const { openView } = await start();
    await openView({
        res_id: partnerId,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce($, ".o-Activity-info:contains('Upload Document')");
    assert.containsOnce($, ".btn .fa-upload");
    assert.containsOnce($, ".o-Activity .o_input_file");
});

QUnit.test("activity can upload a document", async (assert) => {
    const pyEnv = await startServer();
    const fakeId = pyEnv["res.partner"].create({});
    const [activityTypeId] = pyEnv["mail.activity.type"].search([["name", "=", "Upload Document"]]);
    pyEnv["mail.activity"].create({
        activity_category: "upload_file",
        activity_type_id: activityTypeId,
        can_write: true,
        res_id: fakeId,
        res_model: "res.partner",
    });
    const { openFormView } = await start({ serverData: { views } });
    await openFormView("res.partner", fakeId);
    const file = await createFile({
        content: "hello, world",
        contentType: "text/plain",
        name: "text.txt",
    });
    assert.containsOnce($, ".o-Activity-info:contains('Upload Document')");
    inputFiles($(".o-Activity .o_input_file")[0], [file]);
    await waitUntil(".o-Activity-info:contains('Upload Document')", 0);
    await waitUntil("button[aria-label='Attach files']:contains(1)");
});

QUnit.test("activity simplest layout", async (assert) => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    pyEnv["mail.activity"].create({
        res_id: partnerId,
        res_model: "res.partner",
    });
    const { openView } = await start();
    await openView({
        res_model: "res.partner",
        res_id: partnerId,
        views: [[false, "form"]],
    });
    assert.containsOnce($, ".o-Activity");
    assert.containsOnce($, ".o-Activity-sidebar");
    assert.containsOnce($, ".o-Activity-user");
    assert.containsOnce($, ".o-Activity-info");
    assert.containsNone($, ".o-Activity-note");
    assert.containsNone($, ".o-Activity-details");
    assert.containsNone($, ".o-Activity-mailTemplates");
    assert.containsNone($, ".btn:contains('Edit')");
    assert.containsNone($, ".o-Activity span:contains(Cancel)");
    assert.containsNone($, ".btn:contains('Mark Done')");
    assert.containsNone($, ".o-Activity-info:contains('Upload Document')");
});

QUnit.test("activity with note layout", async (assert) => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    pyEnv["mail.activity"].create({
        note: "<p>There is no good or bad note</p>",
        res_id: partnerId,
        res_model: "res.partner",
    });
    const { openView } = await start();
    await openView({
        res_model: "res.partner",
        res_id: partnerId,
        views: [[false, "form"]],
    });
    assert.containsOnce($, ".o-Activity");
    assert.containsOnce($, ".o-Activity-note");
    assert.strictEqual($(".o-Activity-note").text(), "There is no good or bad note");
});

QUnit.test("activity info layout when planned after tomorrow", async (assert) => {
    patchDate(2023, 0, 11, 12, 0, 0);
    const today = new Date();
    const fiveDaysFromNow = new Date();
    fiveDaysFromNow.setDate(today.getDate() + 5);
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    pyEnv["mail.activity"].create({
        date_deadline: date_to_str(fiveDaysFromNow),
        res_id: partnerId,
        res_model: "res.partner",
        state: "planned",
    });
    const { openView } = await start();
    await openView({
        res_model: "res.partner",
        res_id: partnerId,
        views: [[false, "form"]],
    });
    assert.containsOnce($, ".o-Activity");
    assert.containsOnce($, ".o-Activity .text-success");
    assert.containsOnce($, ".o-Activity:contains('Due in 5 days:')");
});

QUnit.test("activity info layout when planned tomorrow", async (assert) => {
    patchDate(2023, 0, 11, 12, 0, 0);
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    pyEnv["mail.activity"].create({
        date_deadline: date_to_str(tomorrow),
        res_id: partnerId,
        res_model: "res.partner",
        state: "planned",
    });
    const { openView } = await start();
    await openView({
        res_model: "res.partner",
        res_id: partnerId,
        views: [[false, "form"]],
    });
    assert.containsOnce($, ".o-Activity");
    assert.containsOnce($, ".o-Activity .text-success");
    assert.containsOnce($, ".o-Activity:contains('Tomorrow:')");
});

QUnit.test("activity info layout when planned today", async (assert) => {
    patchDate(2023, 0, 11, 12, 0, 0);
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    pyEnv["mail.activity"].create({
        date_deadline: date_to_str(new Date()),
        res_id: partnerId,
        res_model: "res.partner",
        state: "today",
    });
    const { openView } = await start();
    await openView({
        res_model: "res.partner",
        res_id: partnerId,
        views: [[false, "form"]],
    });
    assert.containsOnce($, ".o-Activity");
    assert.containsOnce($, ".o-Activity .text-warning");
    assert.containsOnce($, ".o-Activity:contains('Today:')");
});

QUnit.test("activity info layout when planned yesterday", async (assert) => {
    patchDate(2023, 0, 11, 12, 0, 0);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    pyEnv["mail.activity"].create({
        date_deadline: date_to_str(yesterday),
        res_id: partnerId,
        res_model: "res.partner",
        state: "overdue",
    });
    const { openView } = await start();
    await openView({
        res_model: "res.partner",
        res_id: partnerId,
        views: [[false, "form"]],
    });
    assert.containsOnce($, ".o-Activity");
    assert.containsOnce($, ".o-Activity .text-danger");
    assert.containsOnce($, ".o-Activity:contains('Yesterday:')");
});

QUnit.test("activity info layout when planned before yesterday", async (assert) => {
    patchDate(2023, 0, 11, 12, 0, 0);
    const today = new Date();
    const fiveDaysBeforeNow = new Date();
    fiveDaysBeforeNow.setDate(today.getDate() - 5);
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    pyEnv["mail.activity"].create({
        date_deadline: date_to_str(fiveDaysBeforeNow),
        res_id: partnerId,
        res_model: "res.partner",
        state: "overdue",
    });
    const { openView } = await start();
    await openView({
        res_model: "res.partner",
        res_id: partnerId,
        views: [[false, "form"]],
    });
    assert.containsOnce($, ".o-Activity");
    assert.containsOnce($, ".o-Activity .text-danger");
    assert.containsOnce($, ".o-Activity:contains('5 days overdue:')");
});

QUnit.test("activity with a summary layout", async (assert) => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    pyEnv["mail.activity"].create({
        res_id: partnerId,
        res_model: "res.partner",
        summary: "test summary",
    });
    const { openView } = await start();
    await openView({
        res_model: "res.partner",
        res_id: partnerId,
        views: [[false, "form"]],
    });
    assert.containsOnce($, ".o-Activity-info:contains('test summary')");
});

QUnit.test("activity without summary layout", async (assert) => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    pyEnv["mail.activity"].create({
        activity_type_id: 1,
        res_id: partnerId,
        res_model: "res.partner",
    });
    const { openView } = await start();
    await openView({
        res_model: "res.partner",
        res_id: partnerId,
        views: [[false, "form"]],
    });
    assert.containsOnce($, ".o-Activity-info:contains('Email')");
});

QUnit.test("activity details toggle", async (assert) => {
    patchDate(2023, 0, 11, 12, 0, 0);
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    const userId = pyEnv["res.users"].create({ partner_id: partnerId });
    pyEnv["mail.activity"].create({
        create_date: date_to_str(today),
        create_uid: userId,
        date_deadline: date_to_str(tomorrow),
        res_id: partnerId,
        res_model: "res.partner",
    });
    const { openView } = await start();
    await openView({
        res_model: "res.partner",
        res_id: partnerId,
        views: [[false, "form"]],
    });
    assert.containsOnce($, ".o-Activity");
    assert.containsNone($, ".o-Activity-details");
    assert.containsOnce($, ".o-Activity-info i[aria-label='Info']");

    await click(".o-Activity-info i[aria-label='Info']");
    assert.containsOnce($, ".o-Activity-details");

    await click(".o-Activity-info i[aria-label='Info']");
    assert.containsNone($, ".o-Activity-details");
});

QUnit.test("activity with mail template layout", async (assert) => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    const mailTemplateId = pyEnv["mail.template"].create({ name: "Dummy mail template" });
    const activityTypeId = pyEnv["mail.activity.type"].search([["name", "=", "Email"]])[0];
    pyEnv["mail.activity"].create({
        activity_type_id: activityTypeId,
        mail_template_ids: [mailTemplateId],
        res_id: partnerId,
        res_model: "res.partner",
    });
    const { openView } = await start();
    await openView({
        res_model: "res.partner",
        res_id: partnerId,
        views: [[false, "form"]],
    });
    assert.containsOnce($, ".o-Activity");
    assert.containsOnce($, ".o-Activity-sidebar");
    assert.containsOnce($, ".o-Activity-mailTemplates");
    assert.containsOnce($, ".o-ActivityMailTemplate-name");
    assert.strictEqual($(".o-ActivityMailTemplate-name").text(), "Dummy mail template");
    assert.containsOnce($, ".o-ActivityMailTemplate-preview");
    assert.containsOnce($, ".o-ActivityMailTemplate-send");
});

QUnit.test("activity with mail template: preview mail", async (assert) => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    const mailTemplateId = pyEnv["mail.template"].create({ name: "Dummy mail template" });
    const activityTypeId = pyEnv["mail.activity.type"].search([["name", "=", "Email"]])[0];
    pyEnv["mail.activity"].create({
        activity_type_id: activityTypeId,
        mail_template_ids: [mailTemplateId],
        res_id: partnerId,
        res_model: "res.partner",
    });
    const { env, openView } = await start();
    await openView({
        res_model: "res.partner",
        res_id: partnerId,
        views: [[false, "form"]],
    });
    patchWithCleanup(env.services.action, {
        doAction(action) {
            assert.step("do_action");
            assert.deepEqual(action.context.default_res_ids, [partnerId]);
            assert.strictEqual(action.context.default_model, "res.partner");
            assert.strictEqual(action.context.default_template_id, mailTemplateId);
            assert.strictEqual(action.type, "ir.actions.act_window");
            assert.strictEqual(action.res_model, "mail.compose.message");
        },
    });
    assert.containsOnce($, ".o-Activity");
    assert.containsOnce($, ".o-ActivityMailTemplate-preview");

    $(".o-ActivityMailTemplate-preview")[0].click();
    assert.verifySteps(["do_action"]);
});

QUnit.test("activity with mail template: send mail", async (assert) => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    const mailTemplateId = pyEnv["mail.template"].create({ name: "Dummy mail template" });
    const activityTypeId = pyEnv["mail.activity.type"].search([["name", "=", "Email"]])[0];
    pyEnv["mail.activity"].create({
        activity_type_id: activityTypeId,
        mail_template_ids: [mailTemplateId],
        res_id: partnerId,
        res_model: "res.partner",
    });
    const { openView } = await start({
        async mockRPC(route, args) {
            if (args.method === "activity_send_mail") {
                assert.step("activity_send_mail");
                assert.strictEqual(args.args[0].length, 1);
                assert.strictEqual(args.args[0][0], partnerId);
                assert.strictEqual(args.args[1], mailTemplateId);
                // random value returned in order for the mock server to know that this route is implemented.
                return true;
            }
        },
    });
    await openView({
        res_model: "res.partner",
        res_id: partnerId,
        views: [[false, "form"]],
    });
    assert.containsOnce($, ".o-Activity");
    assert.containsOnce($, ".o-ActivityMailTemplate-send");

    click(".o-ActivityMailTemplate-send").catch(() => {});
    assert.verifySteps(["activity_send_mail"]);
});

QUnit.test("activity click on mark as done", async (assert) => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    const activityTypeId = pyEnv["mail.activity.type"].search([["name", "=", "Email"]])[0];
    pyEnv["mail.activity"].create({
        activity_category: "default",
        activity_type_id: activityTypeId,
        can_write: true,
        res_id: partnerId,
        res_model: "res.partner",
    });
    const { openView } = await start();
    await openView({
        res_id: partnerId,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce($, ".o-Activity");
    assert.containsOnce($, ".btn:contains('Mark Done')");

    await click(".btn:contains('Mark Done')");
    assert.containsOnce($, ".o-ActivityMarkAsDone");

    await click(".btn:contains('Mark Done')");
    assert.containsNone($, ".o-ActivityMarkAsDone");
});

QUnit.test(
    "activity mark as done popover should focus feedback input on open [REQUIRE FOCUS]",
    async (assert) => {
        const pyEnv = await startServer();
        const partnerId = pyEnv["res.partner"].create({});
        const activityTypeId = pyEnv["mail.activity.type"].search([["name", "=", "Email"]])[0];
        pyEnv["mail.activity"].create({
            activity_category: "default",
            activity_type_id: activityTypeId,
            can_write: true,
            res_id: partnerId,
            res_model: "res.partner",
        });
        const { openView } = await start();
        await openView({
            res_id: partnerId,
            res_model: "res.partner",
            views: [[false, "form"]],
        });
        assert.containsOnce($, ".o-Activity");
        assert.containsOnce($, ".btn:contains('Mark Done')");

        await click(".btn:contains('Mark Done')");
        assert.strictEqual(
            $(".o-ActivityMarkAsDone textarea[placeholder='Write Feedback']")[0],
            document.activeElement
        );
    }
);

QUnit.test("activity click on edit", async (assert) => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    const mailTemplateId = pyEnv["mail.template"].create({ name: "Dummy mail template" });
    const activityTypeId = pyEnv["mail.activity.type"].search([["name", "=", "Email"]])[0];
    const activityId = pyEnv["mail.activity"].create({
        activity_type_id: activityTypeId,
        can_write: true,
        mail_template_ids: [mailTemplateId],
        res_id: partnerId,
        res_model: "res.partner",
    });
    const { env, openView } = await start();
    await openView({
        res_id: partnerId,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    patchWithCleanup(env.services.action, {
        doAction(action) {
            assert.step("do_action");
            assert.strictEqual(action.context.default_res_id, partnerId);
            assert.strictEqual(action.context.default_res_model, "res.partner");
            assert.strictEqual(action.type, "ir.actions.act_window");
            assert.strictEqual(action.res_model, "mail.activity");
            assert.strictEqual(action.res_id, activityId);
            return this._super(...arguments);
        },
    });
    assert.containsOnce($, ".o-Activity");
    assert.containsOnce($, ".btn:contains('Edit')");

    await click(".btn:contains('Edit')");
    assert.verifySteps(["do_action"]);
});

QUnit.test("activity click on cancel", async (assert) => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    const activityTypeId = pyEnv["mail.activity.type"].search([["name", "=", "Email"]])[0];
    const activityId = pyEnv["mail.activity"].create({
        activity_type_id: activityTypeId,
        can_write: true,
        res_id: partnerId,
        res_model: "res.partner",
    });
    const { openView } = await start({
        async mockRPC(route, args) {
            if (route === "/web/dataset/call_kw/mail.activity/unlink") {
                assert.step("unlink");
                assert.strictEqual(args.args[0].length, 1);
                assert.strictEqual(args.args[0][0], activityId);
            }
        },
    });
    await openView({
        res_id: partnerId,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce($, ".o-Activity");
    assert.containsOnce($, ".o-Activity span:contains(Cancel)");

    await click(".o-Activity span:contains(Cancel)");
    assert.verifySteps(["unlink"]);
    assert.containsNone($, ".o-Activity");
});

QUnit.test("activity mark done popover close on ESCAPE", async (assert) => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    const activityTypeId = pyEnv["mail.activity.type"].search([["name", "=", "Email"]])[0];
    pyEnv["mail.activity"].create({
        activity_category: "default",
        activity_type_id: activityTypeId,
        can_write: true,
        res_id: partnerId,
        res_model: "res.partner",
    });
    const { openView } = await start();
    await openView({
        res_id: partnerId,
        res_model: "res.partner",
        views: [[false, "form"]],
    });

    await click(".btn:contains('Mark Done')");
    assert.containsOnce($, ".o-ActivityMarkAsDone");

    await afterNextRender(() => triggerHotkey("Escape"));
    assert.containsNone($, ".o-ActivityMarkAsDone");
});

QUnit.test("activity mark done popover click on discard", async (assert) => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    const activityTypeId = pyEnv["mail.activity.type"].search([["name", "=", "Email"]])[0];
    pyEnv["mail.activity"].create({
        activity_category: "default",
        activity_type_id: activityTypeId,
        can_write: true,
        res_id: partnerId,
        res_model: "res.partner",
    });
    const { openView } = await start();
    await openView({
        res_id: partnerId,
        res_model: "res.partner",
        views: [[false, "form"]],
    });

    await click(".btn:contains('Mark Done')");
    assert.containsOnce($, ".o-ActivityMarkAsDone");
    assert.containsOnce($, ".o-ActivityMarkAsDone button:contains(Discard)");
    await click(".o-ActivityMarkAsDone button:contains(Discard)");
    assert.containsNone($, ".o-ActivityMarkAsDone");
});
