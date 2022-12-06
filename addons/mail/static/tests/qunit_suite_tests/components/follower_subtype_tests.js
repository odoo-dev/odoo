/** @odoo-module **/

import { start, startServer } from "@mail/../tests/helpers/test_utils";

QUnit.module("mail", {}, function () {
    QUnit.module("components", {}, function () {
        QUnit.module("follower_subtype_tests.js");

        QUnit.test("simplest layout of a followed subtype", async function (assert) {
            assert.expect(5);

            const pyEnv = await startServer();
            const subtypeId = pyEnv["mail.message.subtype"].create({
                default: true,
                name: "TestSubtype",
            });
            const followerId = pyEnv["mail.followers"].create({
                display_name: "François Perusse",
                partner_id: pyEnv.currentPartnerId,
                res_model: "res.partner",
                res_id: pyEnv.currentPartnerId,
                subtype_ids: [subtypeId],
            });
            pyEnv["res.partner"].write([pyEnv.currentPartnerId], {
                message_follower_ids: [followerId],
            });
            const { click, openView } = await start({
                // FIXME: should adapt mock server code to provide `hasWriteAccess`
                async mockRPC(route, args, performRPC) {
                    if (route === "/mail/thread/data") {
                        // mimic user with write access
                        const res = await performRPC(...arguments);
                        res["hasWriteAccess"] = true;
                        return res;
                    }
                },
            });
            await openView({
                res_model: "res.partner",
                res_id: pyEnv.currentPartnerId,
                views: [[false, "form"]],
            });
            await click(".o-mail-chatter-topbar-follower-list-button");
            await click(".o-mail-chatter-topbar-follower-list-follower-edit-button");
            assert.containsOnce(
                document.body,
                ".o-mail-follower-subtype-dialog-subtype:contains(TestSubtype)",
                "should have a follower subtype for 'TestSubtype'"
            );
            assert.containsOnce(
                document.querySelector(".o-mail-follower-subtype-dialog-subtype"),
                ".o-mail-follower-subtype-dialog-subtype-label",
                "should have a label"
            );
            assert.containsOnce(
                $(".o-mail-follower-subtype-dialog-subtype:contains(TestSubtype)"),
                ".o-mail-follower-subtype-dialog-subtype-checkbox",
                "should have a checkbox"
            );
            assert.strictEqual(
                $(
                    ".o-mail-follower-subtype-dialog-subtype:contains(TestSubtype) .o-mail-follower-subtype-dialog-subtype-label"
                )[0].textContent,
                "TestSubtype",
                "should have the name of the subtype as label"
            );
            assert.ok(
                $(
                    ".o-mail-follower-subtype-dialog-subtype:contains(TestSubtype) .o-mail-follower-subtype-dialog-subtype-checkbox"
                )[0].checked,
                "checkbox should be checked as follower subtype is followed"
            );
        });

        QUnit.test("simplest layout of a not followed subtype", async function (assert) {
            assert.expect(1);

            const pyEnv = await startServer();
            pyEnv["mail.message.subtype"].create({
                default: true,
                name: "TestSubtype",
            });
            const followerId = pyEnv["mail.followers"].create({
                display_name: "François Perusse",
                partner_id: pyEnv.currentPartnerId,
                res_model: "res.partner",
                res_id: pyEnv.currentPartnerId,
            });
            pyEnv["res.partner"].write([pyEnv.currentPartnerId], {
                message_follower_ids: [followerId],
            });
            const { click, openView } = await start({
                // FIXME: should adapt mock server code to provide `hasWriteAccess`
                async mockRPC(route, args, performRPC) {
                    if (route === "/mail/thread/data") {
                        // mimic user with write access
                        const res = await performRPC(...arguments);
                        res["hasWriteAccess"] = true;
                        return res;
                    }
                },
            });
            await openView({
                res_model: "res.partner",
                res_id: pyEnv.currentPartnerId,
                views: [[false, "form"]],
            });
            await click(".o-mail-chatter-topbar-follower-list-button");
            await click(".o-mail-chatter-topbar-follower-list-follower-edit-button");
            assert.notOk(
                $(
                    ".o-mail-follower-subtype-dialog-subtype:contains(TestSubtype) .o-mail-follower-subtype-dialog-subtype-checkbox"
                )[0].checked,
                "checkbox should not be checked as follower subtype is not followed"
            );
        });

        QUnit.test("toggle follower subtype checkbox", async function (assert) {
            assert.expect(3);

            const pyEnv = await startServer();
            const followerSubtypeId = pyEnv["mail.message.subtype"].create({
                default: true,
                name: "TestSubtype",
            });
            const followerId = pyEnv["mail.followers"].create({
                display_name: "François Perusse",
                partner_id: pyEnv.currentPartnerId,
                res_model: "res.partner",
                res_id: pyEnv.currentPartnerId,
            });
            pyEnv["res.partner"].write([pyEnv.currentPartnerId], {
                message_follower_ids: [followerId],
            });
            const { click, openView } = await start({
                // FIXME: should adapt mock server code to provide `hasWriteAccess`
                async mockRPC(route, args, performRPC) {
                    if (route === "/mail/thread/data") {
                        // mimic user with write access
                        const res = await performRPC(...arguments);
                        res["hasWriteAccess"] = true;
                        return res;
                    }
                },
            });
            await openView({
                res_model: "res.partner",
                res_id: pyEnv.currentPartnerId,
                views: [[false, "form"]],
            });
            await click(".o-mail-chatter-topbar-follower-list-button");
            await click(".o-mail-chatter-topbar-follower-list-follower-edit-button");
            assert.notOk(
                document.querySelector(
                    `.o-mail-follower-subtype-dialog-subtype[data-follower-subtype-id="${followerSubtypeId}"] .o-mail-follower-subtype-dialog-subtype-checkbox`
                ).checked,
                "checkbox should not be checked as follower subtype is not followed"
            );

            await click(
                `.o-mail-follower-subtype-dialog-subtype[data-follower-subtype-id="${followerSubtypeId}"] .o-mail-follower-subtype-dialog-subtype-checkbox`
            );
            assert.ok(
                document.querySelector(
                    `.o-mail-follower-subtype-dialog-subtype[data-follower-subtype-id="${followerSubtypeId}"] .o-mail-follower-subtype-dialog-subtype-checkbox`
                ).checked,
                "checkbox should now be checked"
            );

            await click(
                `.o-mail-follower-subtype-dialog-subtype[data-follower-subtype-id="${followerSubtypeId}"] .o-mail-follower-subtype-dialog-subtype-checkbox`
            );
            assert.notOk(
                document.querySelector(
                    `.o-mail-follower-subtype-dialog-subtype[data-follower-subtype-id="${followerSubtypeId}"] .o-mail-follower-subtype-dialog-subtype-checkbox`
                ).checked,
                "checkbox should be no more checked"
            );
        });
    });
});
