/** @odoo-module **/

import { afterNextRender, start, startServer } from "@mail/../tests/helpers/test_utils";

QUnit.module("follow button");

QUnit.test("base rendering not editable", async function (assert) {
    assert.expect(1);

    const { openView, pyEnv } = await start();
    await openView({
        res_id: pyEnv.currentPartnerId,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(
        document.body,
        ".o-mail-chatter-topbar-follow",
        "should have 'Follow' button"
    );
});

QUnit.test("hover following button", async function (assert) {
    assert.expect(7);

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
    assert.containsOnce(
        document.body,
        ".o-mail-chatter-topbar-unfollow",
        "should have 'Unfollow' button"
    );
    assert.strictEqual(
        document.querySelector(".o-mail-chatter-topbar-unfollow-text").textContent.trim(),
        "Following",
        "'unfollow' button should display 'Following' as text when not hovered"
    );
    assert.containsNone(
        document.querySelector(".o-mail-chatter-topbar-unfollow"),
        ".fa-times",
        "'unfollow' button should not contain a cross icon when not hovered"
    );
    assert.containsOnce(
        document.querySelector(".o-mail-chatter-topbar-unfollow"),
        ".fa-check",
        "'unfollow' button should contain a check icon when not hovered"
    );

    await afterNextRender(() => {
        document
            .querySelector(".o-mail-chatter-topbar-unfollow")
            .dispatchEvent(new window.MouseEvent("mouseenter"));
    });
    assert.strictEqual(
        document.querySelector(".o-mail-chatter-topbar-unfollow-text").textContent.trim(),
        "Unfollow",
        "'unfollow' button should display 'Unfollow' as text when hovered"
    );
    assert.containsOnce(
        document.querySelector(".o-mail-chatter-topbar-unfollow"),
        ".fa-times",
        "'unfollow' button should contain a cross icon when hovered"
    );
    assert.containsNone(
        document.querySelector(".o-mail-chatter-topbar-unfollow"),
        ".fa-check",
        "'unfollow' button should not contain a check icon when hovered"
    );
});

QUnit.test('click on "follow" button', async function (assert) {
    assert.expect(3);

    const { click, openView, pyEnv } = await start();
    await openView({
        res_id: pyEnv.currentPartnerId,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(
        document.body,
        ".o-mail-chatter-topbar-follow",
        "should have button follow"
    );

    await click(".o-mail-chatter-topbar-follow");
    assert.containsNone(
        document.body,
        ".o-mail-chatter-topbar-follow",
        "should not have follow button after clicked on follow"
    );
    assert.containsOnce(
        document.body,
        ".o-mail-chatter-topbar-unfollow",
        "should have unfollow button after clicked on follow"
    );
});

QUnit.test('click on "unfollow" button', async function (assert) {
    assert.expect(4);

    const pyEnv = await startServer();
    const threadId = pyEnv["res.partner"].create({});
    pyEnv["mail.followers"].create({
        is_active: true,
        partner_id: pyEnv.currentPartnerId,
        res_id: threadId,
        res_model: "res.partner",
    });
    const { click, openView } = await start();
    await openView({
        res_id: threadId,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsNone(
        document.body,
        ".o-mail-chatter-topbar-follow",
        "should not have button follow"
    );
    assert.containsOnce(
        document.body,
        ".o-mail-chatter-topbar-unfollow",
        "should have button unfollow"
    );

    await click(".o-mail-chatter-topbar-unfollow");
    assert.containsOnce(
        document.body,
        ".o-mail-chatter-topbar-follow",
        "should have follow button after clicked on unfollow"
    );
    assert.containsNone(
        document.body,
        ".o-mail-chatter-topbar-unfollow",
        "should not have unfollow button after clicked on unfollow"
    );
});
