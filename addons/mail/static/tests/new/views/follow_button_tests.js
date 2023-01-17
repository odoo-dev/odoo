/** @odoo-module **/

import { afterNextRender, click, start, startServer } from "@mail/../tests/helpers/test_utils";
import { getFixture } from "@web/../tests/helpers/utils";

let target;
QUnit.module("follow button", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test("base rendering not editable", async function (assert) {
    const { openView, pyEnv } = await start();
    await openView({
        res_id: pyEnv.currentPartnerId,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-chatter-topbar-follow");
});

QUnit.test("hover following button", async function (assert) {
    const pyEnv = await startServer();
    const threadId = pyEnv["res.partner"].create({});
    const followerId = pyEnv["mail.followers"].create({
        is_active: true,
        partner_id: pyEnv.currentPartnerId,
        res_id: threadId,
        res_model: "res.partner",
    });
    pyEnv["res.partner"].write([pyEnv.currentPartnerId], {
        message_follower_ids: [followerId],
    });
    const { openView } = await start();
    await openView({
        res_id: threadId,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-chatter-topbar-unfollow");
    assert.strictEqual(
        document.querySelector(".o-mail-chatter-topbar-unfollow-text").textContent.trim(),
        "Following"
    );
    assert.containsNone(document.querySelector(".o-mail-chatter-topbar-unfollow"), ".fa-times");
    assert.containsOnce(document.querySelector(".o-mail-chatter-topbar-unfollow"), ".fa-check");

    await afterNextRender(() => {
        document
            .querySelector(".o-mail-chatter-topbar-unfollow")
            .dispatchEvent(new window.MouseEvent("mouseenter"));
    });
    assert.strictEqual(
        document.querySelector(".o-mail-chatter-topbar-unfollow-text").textContent.trim(),
        "Unfollow"
    );
    assert.containsOnce(document.querySelector(".o-mail-chatter-topbar-unfollow"), ".fa-times");
    assert.containsNone(document.querySelector(".o-mail-chatter-topbar-unfollow"), ".fa-check");
});

QUnit.test('click on "follow" button', async function (assert) {
    const { openView, pyEnv } = await start();
    await openView({
        res_id: pyEnv.currentPartnerId,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-chatter-topbar-follow");

    await click(".o-mail-chatter-topbar-follow");
    assert.containsNone(target, ".o-mail-chatter-topbar-follow");
    assert.containsOnce(target, ".o-mail-chatter-topbar-unfollow");
});

QUnit.test('click on "unfollow" button', async function (assert) {
    const pyEnv = await startServer();
    const threadId = pyEnv["res.partner"].create({});
    pyEnv["mail.followers"].create({
        is_active: true,
        partner_id: pyEnv.currentPartnerId,
        res_id: threadId,
        res_model: "res.partner",
    });
    const { openView } = await start();
    await openView({
        res_id: threadId,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsNone(target, ".o-mail-chatter-topbar-follow");
    assert.containsOnce(target, ".o-mail-chatter-topbar-unfollow");

    await click(".o-mail-chatter-topbar-unfollow");
    assert.containsOnce(target, ".o-mail-chatter-topbar-follow");
    assert.containsNone(target, ".o-mail-chatter-topbar-unfollow");
});
