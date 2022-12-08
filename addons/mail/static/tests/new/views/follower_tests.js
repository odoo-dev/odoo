/** @odoo-module **/

import { makeDeferred } from "@mail/utils/deferred";
import { start, startServer } from "@mail/../tests/helpers/test_utils";

import { patchWithCleanup } from "@web/../tests/helpers/utils";

QUnit.module("mail", {}, function () {
    QUnit.module("components", {}, function () {
        QUnit.module("follower_tests.js");

        QUnit.test("base rendering not editable", async function (assert) {
            assert.expect(5);

            const pyEnv = await startServer();
            const [threadId, partnerId] = pyEnv["res.partner"].create([{}, {}]);
            pyEnv["mail.followers"].create({
                is_active: true,
                partner_id: partnerId,
                res_id: threadId,
                res_model: "res.partner",
            });
            const { click, openView } = await start({
                async mockRPC(route, args, performRpc) {
                    if (route === "/mail/thread/data") {
                        // mimic user without write access
                        const res = await performRpc(...arguments);
                        res["hasWriteAccess"] = false;
                        return res;
                    }
                },
            });
            await openView({
                res_id: threadId,
                res_model: "res.partner",
                views: [[false, "form"]],
            });
            await click(".o-mail-chatter-topbar-follower-list-button");
            assert.containsOnce(
                document.body,
                ".o-mail-chatter-topbar-follower-list-follower",
                "should have follower component"
            );
            assert.containsOnce(
                document.body,
                ".o-mail-chatter-topbar-follower-list-follower-details",
                "should display a details part"
            );
            assert.containsOnce(
                document.body,
                ".o-mail-chatter-topbar-follower-list-follower-avatar",
                "should display the avatar of the follower"
            );
            assert.containsOnce(
                document.body,
                ".o-mail-chatter-topbar-follower-list-follower",
                "should display the name of the follower"
            );
            assert.containsNone(
                document.body,
                ".o-mail-chatter-topbar-follower-list-follower-button",
                "should have no button as follower is not editable"
            );
        });

        QUnit.test("base rendering editable", async function (assert) {
            assert.expect(6);

            const pyEnv = await startServer();
            const [threadId, partnerId] = pyEnv["res.partner"].create([{}, {}]);
            pyEnv["mail.followers"].create({
                is_active: true,
                partner_id: partnerId,
                res_id: threadId,
                res_model: "res.partner",
            });
            const { click, openView } = await start();
            await openView({
                res_id: threadId,
                res_model: "res.partner",
                views: [[false, "form"]],
            });
            await click(".o-mail-chatter-topbar-follower-list-button");
            assert.containsOnce(
                document.body,
                ".o-mail-chatter-topbar-follower-list-follower",
                "should have follower component"
            );
            assert.containsOnce(
                document.body,
                ".o-mail-chatter-topbar-follower-list-follower-details",
                "should display a details part"
            );
            assert.containsOnce(
                document.body,
                ".o-mail-chatter-topbar-follower-list-follower-avatar",
                "should display the avatar of the follower"
            );
            assert.containsOnce(
                document.body,
                ".o-mail-chatter-topbar-follower-list-follower",
                "should display the name of the follower"
            );
            assert.containsOnce(
                document.body,
                ".o-mail-chatter-topbar-follower-list-follower-edit-button",
                "should have an edit button"
            );
            assert.containsOnce(
                document.body,
                ".o-mail-chatter-topbar-follower-list-follower-remove-button",
                "should have a remove button"
            );
        });

        QUnit.test("click on partner follower details", async function (assert) {
            assert.expect(7);

            const pyEnv = await startServer();
            const [threadId, partnerId] = pyEnv["res.partner"].create([{}, {}]);
            pyEnv["mail.followers"].create({
                is_active: true,
                partner_id: partnerId,
                res_id: threadId,
                res_model: "res.partner",
            });
            const openFormDef = makeDeferred();
            const { click, env, openView } = await start();
            await openView({
                res_id: threadId,
                res_model: "res.partner",
                views: [[false, "form"]],
            });
            patchWithCleanup(env.services.action, {
                doAction(action) {
                    assert.step("do_action");
                    assert.strictEqual(
                        action.res_id,
                        partnerId,
                        "The redirect action should redirect to the right res id (partnerId)"
                    );
                    assert.strictEqual(
                        action.res_model,
                        "res.partner",
                        "The redirect action should redirect to the right res model (res.partner)"
                    );
                    assert.strictEqual(
                        action.type,
                        "ir.actions.act_window",
                        "The redirect action should be of type 'ir.actions.act_window'"
                    );
                    openFormDef.resolve();
                },
            });
            await click(".o-mail-chatter-topbar-follower-list-button");
            assert.containsOnce(
                document.body,
                ".o-mail-chatter-topbar-follower-list-follower",
                "should have follower component"
            );
            assert.containsOnce(
                document.body,
                ".o-mail-chatter-topbar-follower-list-follower-details",
                "should display a details part"
            );

            document.querySelector(".o-mail-chatter-topbar-follower-list-follower-details").click();
            await openFormDef;
            assert.verifySteps(
                ["do_action"],
                "clicking on follower should redirect to partner form view"
            );
        });

        QUnit.test("click on edit follower", async function (assert) {
            assert.expect(5);

            const pyEnv = await startServer();
            const [threadId, partnerId] = pyEnv["res.partner"].create([{}, {}]);
            pyEnv["mail.followers"].create({
                is_active: true,
                partner_id: partnerId,
                res_id: threadId,
                res_model: "res.partner",
            });
            const { click, messaging, openView } = await start({
                async mockRPC(route, args) {
                    if (route.includes("/mail/read_subscription_data")) {
                        assert.step("fetch_subtypes");
                    }
                },
            });
            await openView({
                res_id: threadId,
                res_model: "res.partner",
                views: [[false, "form"]],
            });
            const thread = messaging.models["Thread"].insert({
                id: threadId,
                model: "res.partner",
            });
            await thread.fetchData(["followers"]);
            await openView({
                res_id: threadId,
                res_model: "res.partner",
                views: [[false, "form"]],
            });
            await click(".o-mail-chatter-topbar-follower-list-button");
            assert.containsOnce(
                document.body,
                ".o-mail-chatter-topbar-follower-list-follower",
                "should have follower component"
            );
            assert.containsOnce(
                document.body,
                ".o-mail-chatter-topbar-follower-list-follower-edit-button",
                "should display an edit button"
            );

            await click(".o-mail-chatter-topbar-follower-list-follower-edit-button");
            assert.verifySteps(
                ["fetch_subtypes"],
                "clicking on edit follower should fetch subtypes"
            );
            assert.containsOnce(
                document.body,
                ".o-mail-follower-subtype-dialog",
                "A dialog allowing to edit follower subtypes should have been created"
            );
        });

        QUnit.test("edit follower and close subtype dialog", async function (assert) {
            assert.expect(6);

            const pyEnv = await startServer();
            const [threadId, partnerId] = pyEnv["res.partner"].create([{}, {}]);
            pyEnv["mail.followers"].create({
                is_active: true,
                partner_id: partnerId,
                res_id: threadId,
                res_model: "res.partner",
            });
            const { click, openView } = await start({
                async mockRPC(route, args) {
                    if (route.includes("/mail/read_subscription_data")) {
                        assert.step("fetch_subtypes");
                    }
                },
            });
            await openView({
                res_id: threadId,
                res_model: "res.partner",
                views: [[false, "form"]],
            });
            await click(".o-mail-chatter-topbar-follower-list-button");
            assert.containsOnce(
                document.body,
                ".o-mail-chatter-topbar-follower-list-follower",
                "should have follower component"
            );
            assert.containsOnce(
                document.body,
                ".o-mail-chatter-topbar-follower-list-follower-edit-button",
                "should display an edit button"
            );

            await click(".o-mail-chatter-topbar-follower-list-follower-edit-button");
            assert.verifySteps(
                ["fetch_subtypes"],
                "clicking on edit follower should fetch subtypes"
            );
            assert.containsOnce(
                document.body,
                ".o-mail-follower-subtype-dialog",
                "dialog allowing to edit follower subtypes should have been created"
            );

            await click(".o-mail-follower-subtype-dialog-close");
            assert.containsNone(
                document.body,
                ".o_DialogManager_dialog",
                "follower subtype dialog should be closed after clicking on close button"
            );
        });
    });
});
