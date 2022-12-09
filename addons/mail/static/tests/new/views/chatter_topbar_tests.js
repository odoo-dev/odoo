/** @odoo-module **/

import { start, startServer } from "@mail/../tests/helpers/test_utils";
import { getFixture } from "@web/../tests/helpers/utils";

let target;
QUnit.module("chatter topbar", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test("base rendering", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    const { openView } = await start();
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });

    assert.containsOnce(target, ".o-mail-chatter-topbar");
    assert.containsOnce(target, ".o-mail-chatter-topbar-send-message-button");
    assert.containsOnce(target, ".o-mail-chatter-topbar-log-note-button");
    assert.containsOnce(target, ".o-mail-chatter-topbar-schedule-activity-button");
    assert.containsOnce(target, ".o-mail-chatter-topbar-add-attachments");
    assert.containsOnce(target, ".o-mail-chatter-topbar-follower-list");
});

QUnit.test("base disabled rendering", async function (assert) {
    const { openView } = await start();
    await openView({
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-chatter-topbar");
    assert.ok(document.querySelector(".o-mail-chatter-topbar-send-message-button").disabled);
    assert.ok(document.querySelector(".o-mail-chatter-topbar-log-note-button").disabled);
    assert.ok(document.querySelector(".o-mail-chatter-topbar-schedule-activity-button").disabled);
    assert.ok(document.querySelector(".o-mail-chatter-topbar-add-attachments").disabled);
});

QUnit.test("rendering with multiple partner followers", async function (assert) {
    const pyEnv = await startServer();
    const [resPartnerId1, resPartnerId2, resPartnerId3] = pyEnv["res.partner"].create([
        { name: "Eden Hazard" },
        { name: "Jean Michang" },
        { message_follower_ids: [1, 2] },
    ]);
    pyEnv["mail.followers"].create([
        {
            partner_id: resPartnerId2,
            res_id: resPartnerId3,
            res_model: "res.partner",
        },
        {
            partner_id: resPartnerId1,
            res_id: resPartnerId3,
            res_model: "res.partner",
        },
    ]);
    const { click, openView } = await start();
    await openView({
        res_id: resPartnerId3,
        res_model: "res.partner",
        views: [[false, "form"]],
    });

    assert.containsOnce(target, ".o-mail-chatter-topbar-follower-list");
    assert.containsOnce(target, ".o-mail-chatter-topbar-follower-list-button");

    await click(".o-mail-chatter-topbar-follower-list-button");
    assert.containsOnce(target, ".o-mail-chatter-topbar-follower-list-dropdown");
    assert.containsN(target, ".o-mail-chatter-topbar-follower-list-follower", 2);
    assert.strictEqual(
        target
            .querySelectorAll(".o-mail-chatter-topbar-follower-list-follower")[0]
            .textContent.trim(),
        "Jean Michang"
    );
    assert.strictEqual(
        target
            .querySelectorAll(".o-mail-chatter-topbar-follower-list-follower")[1]
            .textContent.trim(),
        "Eden Hazard"
    );
});
