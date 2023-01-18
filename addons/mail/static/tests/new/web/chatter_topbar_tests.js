/** @odoo-module **/

import { afterNextRender, click, start, startServer } from "@mail/../tests/helpers/test_utils";
import { makeDeferred } from "@mail/utils/deferred";
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
    assert.containsOnce(target, "button:contains(Send message)");
    assert.containsOnce(target, "button:contains(Log note)");
    assert.containsOnce(target, "button:contains(Activities)");
    assert.containsOnce(target, "button[aria-label='Attach files']");
    assert.containsOnce(target, ".o-mail-chatter-topbar-follower-list");
});

QUnit.test("base disabled rendering", async function (assert) {
    const { openView } = await start();
    await openView({
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-chatter-topbar");
    assert.ok($(target).find("button:contains(Send message)")[0].disabled);
    assert.ok($(target).find("button:contains(Log note)")[0].disabled);
    assert.ok($(target).find("button:contains(Activities)")[0].disabled);
    assert.ok($(target).find("button[aria-label='Attach files']")[0].disabled);
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
    const { openView } = await start();
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

QUnit.test("log note toggling", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    const { click, openView } = await start();
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, "button:contains(Log note)");
    assert.doesNotHaveClass($(target).find("button:contains(Log note)"), "o-active");
    assert.containsNone(target, ".o-mail-composer");

    await click("button:contains(Log note)");
    assert.hasClass($(target).find("button:contains(Log note)"), "o-active");
    assert.containsOnce(
        target,
        ".o-mail-composer .o-mail-composer-textarea[placeholder='Log an internal note...']"
    );

    await click("button:contains(Log note)");
    assert.doesNotHaveClass($(target).find("button:contains(Log note)"), "o-active");
    assert.containsNone(target, ".o-mail-composer");
});

QUnit.test("send message toggling", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    const { click, openView } = await start();
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, "button:contains(Send message)");
    assert.doesNotHaveClass($(target).find("button:contains(Send message)"), "o-active");
    assert.containsNone(target, ".o-mail-composer");

    await click("button:contains(Send message)");
    assert.hasClass($(target).find("button:contains(Send message)"), "o-active");
    assert.containsOnce(
        target,
        ".o-mail-composer .o-mail-composer-textarea[placeholder='Send a message to followers...']"
    );

    await click("button:contains(Send message)");
    assert.doesNotHaveClass($(target).find("button:contains(Send message)"), "o-active");
    assert.containsNone(target, ".o-mail-composer");
});

QUnit.test("log note/send message switching", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    const { click, openView } = await start();
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, "button:contains(Send message)");
    assert.doesNotHaveClass($(target).find("button:contains(Send message)"), "o-active");
    assert.containsOnce(target, "button:contains(Log note)");
    assert.doesNotHaveClass($(target).find("button:contains(Log note)"), "o-active");
    assert.containsNone(target, ".o-mail-composer");

    await click("button:contains(Send message)");
    assert.hasClass($(target).find("button:contains(Send message)"), "o-active");
    assert.doesNotHaveClass($(target).find("button:contains(Log note)"), "o-active");
    assert.containsOnce(
        target,
        ".o-mail-composer .o-mail-composer-textarea[placeholder='Send a message to followers...']"
    );

    await click("button:contains(Log note)");
    assert.doesNotHaveClass($(target).find("button:contains(Send message)"), "o-active");
    assert.hasClass($(target).find("button:contains(Log note)"), "o-active");
    assert.containsOnce(
        target,
        ".o-mail-composer .o-mail-composer-textarea[placeholder='Log an internal note...']"
    );
});

QUnit.test("attachment counter without attachments", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId = pyEnv["res.partner"].create({});
    const { openView } = await start();
    await openView({
        res_id: resPartnerId,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, "button[aria-label='Attach files']");
    assert.containsOnce(target, "button[aria-label='Attach files']:contains(0)");
});

QUnit.test("attachment counter with attachments", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId = pyEnv["res.partner"].create({});
    pyEnv["ir.attachment"].create([
        {
            mimetype: "text/plain",
            name: "Blah.txt",
            res_id: resPartnerId,
            res_model: "res.partner",
        },
        {
            mimetype: "text/plain",
            name: "Blu.txt",
            res_id: resPartnerId,
            res_model: "res.partner",
        },
    ]);
    const { openView } = await start();
    await openView({
        res_id: resPartnerId,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, "button[aria-label='Attach files']:contains(2)");
});

QUnit.test("attachment counter while loading attachments", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    const { openView } = await start({
        async mockRPC(route) {
            if (route.includes("/mail/thread/data")) {
                await makeDeferred(); // simulate long loading
            }
        },
    });
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, "button[aria-label='Attach files'] .fa-spin");
    assert.containsNone(target, "button[aria-label='Attach files']:contains(0)");
});

QUnit.test("attachment counter transition when attachments become loaded", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    const attachmentPromise = makeDeferred();
    const { openView } = await start({
        async mockRPC(route) {
            if (route.includes("/mail/thread/data")) {
                await attachmentPromise;
            }
        },
    });
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, "button[aria-label='Attach files'] .fa-spin");
    assert.containsNone(target, "button[aria-label='Attach files']:contains(0)");

    await afterNextRender(() => attachmentPromise.resolve());
    assert.containsNone(target, "button[aria-label='Attach files'] .fa-spin");
    assert.containsOnce(target, "button[aria-label='Attach files']:contains(0)");
});
