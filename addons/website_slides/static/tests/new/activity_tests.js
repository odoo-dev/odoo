/** @odoo-module **/

import { click, start, startServer } from "@mail/../tests/helpers/test_utils";

QUnit.module("activity");

QUnit.test("grant course access", async function (assert) {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    const channelId = pyEnv["slide.channel"].create({});
    pyEnv["mail.activity"].create({
        can_write: true,
        res_id: channelId,
        request_partner_id: partnerId,
        res_model: "slide.channel",
    });
    const { openView } = await start({
        async mockRPC(route, args) {
            if (args.method === "action_grant_access") {
                assert.strictEqual(args.args.length, 1);
                assert.strictEqual(args.args[0].length, 1);
                assert.strictEqual(args.args[0][0], channelId);
                assert.strictEqual(args.kwargs.partner_id, partnerId);
                assert.step("access_grant");
                // random value returned in order for the mock server to know that this route is implemented.
                return true;
            }
        },
    });
    await openView({
        res_id: channelId,
        res_model: "slide.channel",
        views: [[false, "form"]],
    });
    assert.containsOnce(document.body, ".o-mail-activity");
    assert.containsOnce(document.body, "button:contains(Grant Access)");

    await click("button:contains(Grant Access)");
    assert.verifySteps(["access_grant"]);
});

QUnit.test("refuse course access", async function (assert) {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    const channelId = pyEnv["slide.channel"].create({});
    pyEnv["mail.activity"].create({
        can_write: true,
        res_id: channelId,
        request_partner_id: partnerId,
        res_model: "slide.channel",
    });
    const { openView } = await start({
        async mockRPC(route, args) {
            if (args.method === "action_refuse_access") {
                assert.strictEqual(args.args.length, 1);
                assert.strictEqual(args.args[0].length, 1);
                assert.strictEqual(args.args[0][0], channelId);
                assert.strictEqual(args.kwargs.partner_id, partnerId);
                assert.step("access_refuse");
                // random value returned in order for the mock server to know that this route is implemented.
                return true;
            }
        },
    });
    await openView({
        res_id: channelId,
        res_model: "slide.channel",
        views: [[false, "form"]],
    });
    assert.containsOnce(document.body, ".o-mail-activity");
    assert.containsOnce(document.body, "button:contains(Refuse Access)");

    await click("button:contains(Refuse Access)");
    assert.verifySteps(["access_refuse"]);
});
