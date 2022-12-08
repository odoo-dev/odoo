/** @odoo-module **/

import { start, startServer } from "@mail/../tests/helpers/test_utils";
import { Activity } from "@mail/new/activity/activity";
import { click, getFixture, mount } from "@web/../tests/helpers/utils";
import { makeTestEnv, TestServer } from "../helpers/helpers";

let target;

QUnit.module("mail", (hooks) => {
    hooks.beforeEach(async () => {
        target = getFixture();
    });

    QUnit.module("activity");

    QUnit.test("Toggle activity detail", async (assert) => {
        const server = new TestServer();
        const env = makeTestEnv((route, params) => server.rpc(route, params));
        const activity = server.addActivity(1);
        await mount(Activity, target, {
            env,
            props: { data: activity },
        });
        await click(document.querySelector(".o-mail-activity-toggle"));
        assert.containsOnce(target, ".o-mail-activity-details", "Activity details should be open.");
        await click(document.querySelector(".o-mail-activity-toggle"));
        assert.containsNone(
            target,
            ".o-mail-activity-details",
            "Activity details should be closed"
        );
    });

    QUnit.test("Delete activity", async (assert) => {
        const server = new TestServer();
        const env = makeTestEnv((route, params) => {
            if (route === "/web/dataset/call_kw/mail.activity/unlink") {
                assert.step("/web/dataset/call_kw/mail.activity/unlink");
            }
            return server.rpc(route, params);
        });
        const activity = server.addActivity(1);
        await mount(Activity, target, {
            env,
            props: { data: activity },
        });
        await click(document.querySelector(".o-mail-activity-unlink-button"));
        assert.verifySteps(["/web/dataset/call_kw/mail.activity/unlink"]);
    });

    QUnit.test("activity upload document is available", async function (assert) {
        assert.expect(3);

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
        assert.containsOnce(
            document.body,
            ".o-mail-activity-name:contains('Upload Document')",
            "Should have upload document activity"
        );
        assert.containsOnce(document.body, ".fa-upload", "Should have activity upload button");
        assert.containsOnce(document.body, ".o_input_file", "Should have a file uploader");
    });
});
