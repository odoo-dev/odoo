/** @odoo-module **/

import { start, startServer } from "@mail/../tests/helpers/test_utils";

QUnit.module("chatter topbar");

QUnit.test("base rendering", async function (assert) {
    assert.expect(7);

    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    const { openView } = await start();
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });

    assert.strictEqual(
        document.querySelectorAll(`.o-mail-chatter-topbar`).length,
        1,
        "should have a chatter topbar"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o-mail-chatter-topbar-send-message-button`).length,
        1,
        "should have a send message button in chatter menu"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o-mail-chatter-topbar-log-note-button`).length,
        1,
        "should have a log note button in chatter menu"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o-mail-chatter-topbar-schedule-activity-button`).length,
        1,
        "should have a schedule activity button in chatter menu"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o-mail-chatter-topbar-add-attachments`).length,
        1,
        "should have an attachments button in chatter menu"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_ChatterTopbar_buttonAttachmentsCountLoader`).length,
        0,
        "attachments button should not have a loader"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o-mail-chatter-topbar-follower-list`).length,
        1,
        "should have a follower menu"
    );
});

QUnit.test("base disabled rendering", async function (assert) {
    assert.expect(6);

    const { openView } = await start();
    await openView({
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.strictEqual(
        document.querySelectorAll(`.o-mail-chatter-topbar`).length,
        1,
        "should have a chatter topbar"
    );
    assert.ok(
        document.querySelector(`.o-mail-chatter-topbar-send-message-button`).disabled,
        "send message button should be disabled"
    );
    assert.ok(
        document.querySelector(`.o-mail-chatter-topbar-log-note-button`).disabled,
        "log note button should be disabled"
    );
    assert.ok(
        document.querySelector(`.o-mail-chatter-topbar-schedule-activity-button`).disabled,
        "schedule activity should be disabled"
    );
    assert.ok(
        document.querySelector(`.o-mail-chatter-topbar-add-attachments`).disabled,
        "attachments button should be disabled"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_ChatterTopbar_buttonAttachmentsCountLoader`).length,
        0,
        "attachments button should not have a loader"
    );
});

QUnit.test("rendering with multiple partner followers", async function (assert) {
    assert.expect(7);

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

    assert.containsOnce(
        document.body,
        ".o-mail-chatter-topbar-follower-list",
        "should have followers menu component"
    );
    assert.containsOnce(
        document.body,
        ".o-mail-chatter-topbar-follower-list-button",
        "should have followers button"
    );

    await click(".o-mail-chatter-topbar-follower-list-button");
    assert.containsOnce(
        document.body,
        ".o-mail-chatter-topbar-follower-list-dropdown",
        "followers dropdown should be opened"
    );
    assert.containsN(
        document.body,
        ".o-mail-chatter-topbar-follower-list-follower",
        2,
        "exactly two followers should be listed"
    );
    assert.containsN(
        document.body,
        ".o-mail-chatter-topbar-follower-list-follower",
        2,
        "exactly two follower names should be listed"
    );
    assert.strictEqual(
        document
            .querySelectorAll(".o-mail-chatter-topbar-follower-list-follower")[0]
            .textContent.trim(),
        "Jean Michang",
        "first follower is 'Jean Michang'"
    );
    assert.strictEqual(
        document
            .querySelectorAll(".o-mail-chatter-topbar-follower-list-follower")[1]
            .textContent.trim(),
        "Eden Hazard",
        "second follower is 'Eden Hazard'"
    );
});
