/** @odoo-module **/

import { afterNextRender, start, startServer } from "@mail/../tests/helpers/test_utils";

import { date_to_str } from "web.time";
import { patchWithCleanup } from "@web/../tests/helpers/utils";

QUnit.module("mail", {}, function () {
    QUnit.module("components", {}, function () {
        QUnit.module("activity_tests.js");

        QUnit.skipRefactoring("activity details layout", async function (assert) {
            assert.expect(11);

            const today = new Date();
            const tomorrow = new Date();
            tomorrow.setDate(today.getDate() + 1);
            const pyEnv = await startServer();
            const resUsersId1 = pyEnv["res.users"].create({ name: "Pauvre pomme" });
            const resPartnerId1 = pyEnv["res.partner"].create({});
            const emailActivityTypeId = pyEnv["mail.activity.type"].search([
                ["name", "=", "Email"],
            ])[0];
            pyEnv["mail.activity"].create({
                activity_type_id: emailActivityTypeId,
                create_date: date_to_str(today),
                create_uid: resUsersId1,
                date_deadline: date_to_str(tomorrow),
                res_id: resPartnerId1,
                res_model: "res.partner",
                state: "planned",
                user_id: resUsersId1,
            });
            const { click, openView } = await start();
            await openView({
                res_model: "res.partner",
                res_id: resPartnerId1,
                views: [[false, "form"]],
            });
            assert.strictEqual(
                document.querySelectorAll(".o-mail-activity").length,
                1,
                "should have activity component"
            );
            assert.strictEqual(
                document.querySelectorAll(".o-mail-activity-user-avatar").length,
                1,
                "should have activity user avatar"
            );
            assert.strictEqual(
                document.querySelectorAll(".o-mail-activity-toggle").length,
                1,
                "activity should have a details button"
            );

            await click(".o-mail-activity-toggle");
            assert.strictEqual(
                document.querySelectorAll(".o-mail-activity-details").length,
                1,
                "activity details should be visible after clicking on details button"
            );
            assert.strictEqual(
                document.querySelectorAll(".o-mail-activity-name").length,
                1,
                "activity details should have name"
            );
            assert.strictEqual(
                document.querySelector(".o-mail-activity-name").textContent,
                "Email",
                "activity details name should be 'Email'"
            );
            assert.strictEqual(
                document.querySelectorAll(".o_ActivityView_detailsCreation").length,
                1,
                "activity details should have creation date "
            );
            assert.strictEqual(
                document.querySelectorAll(".o_ActivityView_detailsCreator").length,
                1,
                "activity details should have creator"
            );
            assert.strictEqual(
                document.querySelectorAll(".o_ActivityView_detailsAssignation").length,
                1,
                "activity details should have assignation information"
            );
            assert.strictEqual(
                document
                    .querySelector(".o_ActivityView_detailsAssignation")
                    .textContent.indexOf("Pauvre pomme"),
                0,
                "activity details assignation information should contain creator display name"
            );
            assert.strictEqual(
                document.querySelectorAll(".o_ActivityView_detailsAssignationUserAvatar").length,
                1,
                "activity details should have user avatar"
            );
        });

        QUnit.skipRefactoring("activity edition", async function (assert) {
            assert.expect(14);

            const pyEnv = await startServer();
            const resPartnerId1 = pyEnv["res.partner"].create({});
            const mailActivityId1 = pyEnv["mail.activity"].create({
                can_write: true,
                icon: "fa-times",
                res_id: resPartnerId1,
                res_model: "res.partner",
            });
            const { click, env, openView } = await start();
            await openView({
                res_id: resPartnerId1,
                res_model: "res.partner",
                views: [[false, "form"]],
            });
            patchWithCleanup(env.services.action, {
                doAction(action, options) {
                    assert.step("do_action");
                    assert.strictEqual(
                        action.context.default_res_id,
                        resPartnerId1,
                        "Action should have the activity res id as default res id in context"
                    );
                    assert.strictEqual(
                        action.context.default_res_model,
                        "res.partner",
                        "Action should have the activity res model as default res model in context"
                    );
                    assert.strictEqual(
                        action.type,
                        "ir.actions.act_window",
                        'Action should be of type "ir.actions.act_window"'
                    );
                    assert.strictEqual(
                        action.res_model,
                        "mail.activity",
                        'Action should have "mail.activity" as res_model'
                    );
                    assert.strictEqual(
                        action.res_id,
                        mailActivityId1,
                        "Action should have activity id as res_id"
                    );
                    pyEnv["mail.activity"].write([mailActivityId1], { icon: "fa-check" });
                    options.onClose();
                },
            });
            assert.containsOnce(
                document.body,
                ".o-mail-activity",
                "should have activity component"
            );
            assert.containsOnce(
                document.body,
                ".btn:contains('Edit')",
                "should have activity edit button"
            );
            assert.containsOnce(document.body, ".o_ActivityView_icon", "should have activity icon");
            assert.containsOnce(
                document.body,
                ".o_ActivityView_icon.fa-times",
                "should have initial activity icon"
            );
            assert.containsNone(
                document.body,
                ".o_ActivityView_icon.fa-check",
                "should not have new activity icon when not edited yet"
            );

            await click(".btn:contains('Edit')");
            assert.verifySteps(
                ["do_action"],
                "should have called 'schedule activity' action correctly"
            );
            assert.containsNone(
                document.body,
                ".o_ActivityView_icon.fa-times",
                "should no more have initial activity icon once edited"
            );
            assert.containsOnce(
                document.body,
                ".o_ActivityView_icon.fa-check",
                "should now have new activity icon once edited"
            );
        });

        QUnit.skipRefactoring(
            "data-oe-id & data-oe-model link redirection on click",
            async function (assert) {
                assert.expect(7);

                const pyEnv = await startServer();
                const resPartnerId1 = pyEnv["res.partner"].create({});
                const emailActivityTypeId = pyEnv["mail.activity.type"].search([
                    ["name", "=", "Email"],
                ])[0];
                pyEnv["mail.activity"].create({
                    activity_category: "default",
                    activity_type_id: emailActivityTypeId,
                    can_write: true,
                    note: `<p><a href="#" data-oe-id="250" data-oe-model="some.model">some.model_250</a></p>`,
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
                        assert.strictEqual(
                            action.type,
                            "ir.actions.act_window",
                            "action should open view"
                        );
                        assert.strictEqual(
                            action.res_model,
                            "some.model",
                            "action should open view on 'some.model' model"
                        );
                        assert.strictEqual(action.res_id, 250, "action should open view on 250");
                        assert.step("do-action:openFormView_some.model_250");
                    },
                });
                assert.containsOnce(
                    document.body,
                    ".o-activity-note",
                    "activity should have a note"
                );
                assert.containsOnce(
                    document.querySelector(".o-activity-note"),
                    "a",
                    "activity note should have a link"
                );

                document.querySelector(`.o-activity-note a`).click();
                assert.verifySteps(
                    ["do-action:openFormView_some.model_250"],
                    "should have open form view on related record after click on link"
                );
            }
        );

        QUnit.skipRefactoring(
            'button related to file uploading is replaced when updating activity type from "Upload Document" to "Email"',
            async function (assert) {
                assert.expect(2);

                const pyEnv = await startServer();
                const resPartnerId1 = pyEnv["res.partner"].create({});
                const uploadActivityTypeId = pyEnv["mail.activity.type"].search([
                    ["name", "=", "Upload document"],
                ])[0];
                const emailActivityTypeId = pyEnv["mail.activity.type"].search([
                    ["name", "=", "Email"],
                ])[0];
                const mailActivityId1 = pyEnv["mail.activity"].create({
                    activity_category: "upload_file",
                    activity_type_id: uploadActivityTypeId,
                    can_write: true,
                    res_id: resPartnerId1,
                    res_model: "res.partner",
                });
                const { messaging, openView } = await start();
                await openView({
                    res_id: resPartnerId1,
                    res_model: "res.partner",
                    views: [[false, "form"]],
                });

                // Update the record server side then fetch updated data in order to
                // emulate what happens when using the form view.
                pyEnv["mail.activity"].write([mailActivityId1], {
                    activity_category: "default",
                    activity_type_id: emailActivityTypeId,
                });
                await afterNextRender(async () => {
                    const activity = messaging.models["Activity"].findFromIdentifyingData({
                        id: mailActivityId1,
                    });
                    await activity.fetchAndUpdate();
                });
                assert.containsOnce(
                    document.body,
                    ".btn:contains('Mark Done')",
                    "should have a mark done button when changing activity type from 'Upload Document' to 'Email'"
                );
                assert.containsNone(
                    document.body,
                    ".o_ActivityView_uploadButton",
                    "should not have an upload button after changing the activity type from 'Upload Document' to 'Email'"
                );
            }
        );
    });
});
