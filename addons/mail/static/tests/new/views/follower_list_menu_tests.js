/** @odoo-module **/

import { click, start, startServer } from "@mail/../tests/helpers/test_utils";

import { nextTick } from "web.test_utils";
import { getFixture, patchWithCleanup } from "@web/../tests/helpers/utils";

let target;
QUnit.module("follower list menu", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test("base rendering not editable", async function (assert) {
    const { openView } = await start();
    await openView(
        {
            res_model: "res.partner",
            views: [[false, "form"]],
        },
        { mode: "edit" }
    );
    assert.containsOnce(target, ".o-mail-chatter-topbar-follower-list");
    assert.containsOnce(target, ".o-mail-chatter-topbar-follower-list-button");
    assert.ok(document.querySelector(".o-mail-chatter-topbar-follower-list-button").disabled);
    assert.containsNone(target, ".o-mail-chatter-topbar-follower-list-dropdown");

    document.querySelector(".o-mail-chatter-topbar-follower-list-button").click();
    await nextTick();
    assert.containsNone(
        target,
        ".o-mail-chatter-topbar-follower-list-dropdown",
        "followers dropdown should still be closed as button is disabled"
    );
});

QUnit.test("base rendering editable", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    const { openView } = await start({
        async mockRPC(route, args, performRPC) {
            if (route === "/mail/thread/data") {
                // mimic user with write access
                const res = await performRPC(route, args);
                res["hasWriteAccess"] = true;
                return res;
            }
        },
    });
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-chatter-topbar-follower-list");
    assert.containsOnce(target, ".o-mail-chatter-topbar-follower-list-button");
    assert.notOk(document.querySelector(".o-mail-chatter-topbar-follower-list-button").disabled);
    assert.containsNone(target, ".o-mail-chatter-topbar-follower-list-dropdown");

    await click(".o-mail-chatter-topbar-follower-list-button");
    assert.containsOnce(target, ".o-mail-chatter-topbar-follower-list-dropdown");
});

QUnit.test('click on "add followers" button', async function (assert) {
    const pyEnv = await startServer();
    const [resPartnerId1, resPartnerId2, resPartnerId3] = pyEnv["res.partner"].create([
        { name: "resPartner1" },
        { name: "François Perusse" },
        { name: "resPartner3" },
    ]);
    pyEnv["mail.followers"].create({
        partner_id: resPartnerId2,
        email: "bla@bla.bla",
        is_active: true,
        res_id: resPartnerId1,
        res_model: "res.partner",
    });

    const { env, openView } = await start({
        async mockRPC(route, args, performRPC) {
            if (route === "/mail/thread/data") {
                // mimic user with write access
                const res = await performRPC(route, args);
                res["hasWriteAccess"] = true;
                return res;
            }
        },
    });
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    patchWithCleanup(env.services.action, {
        doAction(action, options) {
            assert.step("action:open_view");
            assert.strictEqual(action.context.default_res_model, "res.partner");
            assert.strictEqual(action.context.default_res_id, resPartnerId1);
            assert.strictEqual(action.res_model, "mail.wizard.invite");
            assert.strictEqual(action.type, "ir.actions.act_window");
            pyEnv["mail.followers"].create({
                partner_id: resPartnerId3,
                email: "bla@bla.bla",
                is_active: true,
                name: "Wololo",
                res_id: resPartnerId1,
                res_model: "res.partner",
            });
            options.onClose();
        },
    });

    assert.containsOnce(target, ".o-mail-chatter-topbar-follower-list");
    assert.containsOnce(target, ".o-mail-chatter-topbar-follower-list-button");
    assert.strictEqual(
        document.querySelector(".o-mail-chatter-topbar-followers-count").textContent,
        "1"
    );

    await click(".o-mail-chatter-topbar-follower-list-button");
    assert.containsOnce(target, ".o-mail-chatter-topbar-follower-list-dropdown");
    assert.containsOnce(target, ".o-mail-chatter-topbar-follower-list-add-follower");

    await click(".o-mail-chatter-topbar-follower-list-add-follower");
    assert.containsNone(target, ".o-mail-chatter-topbar-follower-list-dropdown");
    assert.verifySteps(["action:open_view"]);
    assert.strictEqual(
        document.querySelector(".o-mail-chatter-topbar-followers-count").textContent,
        "2"
    );

    await click(".o-mail-chatter-topbar-follower-list-button");
    assert.containsN(target, ".o-mail-chatter-topbar-follower-list-follower", 2);
    assert.strictEqual(
        document.querySelector(".o-mail-chatter-topbar-follower-list-follower").textContent,
        "François Perusse"
    );
});

QUnit.test("click on remove follower", async function (assert) {
    const pyEnv = await startServer();
    const [resPartnerId1, resPartnerId2] = pyEnv["res.partner"].create([
        { name: "resPartner1" },
        { name: "resPartner2" },
    ]);
    pyEnv["mail.followers"].create({
        partner_id: resPartnerId2,
        email: "bla@bla.bla",
        is_active: true,
        name: "Wololo",
        res_id: resPartnerId1,
        res_model: "res.partner",
    });
    const { openView } = await start({
        async mockRPC(route, args, performRPC) {
            if (route === "/mail/thread/data") {
                // mimic user with write access
                const res = await performRPC(route, args);
                res["hasWriteAccess"] = true;
                return res;
            }
            if (route.includes("message_unsubscribe")) {
                assert.step("message_unsubscribe");
                assert.deepEqual(args.args, [[resPartnerId1], [resPartnerId2]]);
            }
        },
    });
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });

    await click(".o-mail-chatter-topbar-follower-list-button");
    assert.containsOnce(target, ".o-mail-chatter-topbar-follower-list-follower");
    assert.containsOnce(target, ".o-mail-chatter-topbar-follower-list-follower-remove-button");

    await click(".o-mail-chatter-topbar-follower-list-follower-remove-button");
    assert.verifySteps(["message_unsubscribe"]);
    assert.containsNone(target, ".o-mail-chatter-topbar-follower-list-follower");
});

QUnit.test(
    'Hide "Add follower" and subtypes edition/removal buttons except own user on read only record',
    async function (assert) {
        const pyEnv = await startServer();
        const [resPartnerId1, resPartnerId2] = pyEnv["res.partner"].create([
            { name: "resPartner1" },
            { name: "resPartner2" },
        ]);
        pyEnv["mail.followers"].create([
            {
                is_active: true,
                partner_id: pyEnv.currentPartnerId,
                res_id: resPartnerId1,
                res_model: "res.partner",
            },
            {
                is_active: true,
                partner_id: resPartnerId2,
                res_id: resPartnerId1,
                res_model: "res.partner",
            },
        ]);
        const { openView } = await start({
            async mockRPC(route, args, performRPC) {
                if (route === "/mail/thread/data") {
                    // mimic user with no write access
                    const res = await performRPC(route, args);
                    res["hasWriteAccess"] = false;
                    return res;
                }
            },
        });
        await openView({
            res_id: resPartnerId1,
            res_model: "res.partner",
            views: [[false, "form"]],
        });

        await click(".o-mail-chatter-topbar-follower-list-button");
        assert.containsNone(target, ".o-mail-chatter-topbar-follower-list-add-follower");
        const followersList = document.querySelectorAll(
            ".o-mail-chatter-topbar-follower-list-follower"
        );
        assert.containsOnce(
            followersList[0],
            ".o-mail-chatter-topbar-follower-list-follower-edit-button",
            "should display edit button for a follower related to current user"
        );
        assert.containsOnce(
            followersList[0],
            ".o-mail-chatter-topbar-follower-list-follower-remove-button",
            "should display remove button for a follower related to current user"
        );
        assert.containsNone(
            followersList[1],
            ".o-mail-chatter-topbar-follower-list-follower-edit-button"
        );
        assert.containsNone(
            followersList[1],
            ".o-mail-chatter-topbar-follower-list-follower-remove-button"
        );
    }
);

QUnit.test(
    'Show "Add follower" and subtypes edition/removal buttons on all followers if user has write access',
    async function (assert) {
        const pyEnv = await startServer();
        const [resPartnerId1, resPartnerId2] = pyEnv["res.partner"].create([
            { name: "resPartner1" },
            { name: "resPartner2" },
        ]);
        pyEnv["mail.followers"].create([
            {
                is_active: true,
                partner_id: pyEnv.currentPartnerId,
                res_id: resPartnerId1,
                res_model: "res.partner",
            },
            {
                is_active: true,
                partner_id: resPartnerId2,
                res_id: resPartnerId1,
                res_model: "res.partner",
            },
        ]);
        const { openView } = await start({
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
            res_id: resPartnerId1,
            res_model: "res.partner",
            views: [[false, "form"]],
        });

        await click(".o-mail-chatter-topbar-follower-list-button");
        assert.containsOnce(target, ".o-mail-chatter-topbar-follower-list-add-follower");
        const followersList = document.querySelectorAll(
            ".o-mail-chatter-topbar-follower-list-follower"
        );
        assert.containsOnce(
            followersList[0],
            ".o-mail-chatter-topbar-follower-list-follower-edit-button"
        );
        assert.containsOnce(
            followersList[0],
            ".o-mail-chatter-topbar-follower-list-follower-remove-button"
        );
        assert.containsOnce(
            followersList[1],
            ".o-mail-chatter-topbar-follower-list-follower-edit-button"
        );
        assert.containsOnce(
            followersList[1],
            ".o-mail-chatter-topbar-follower-list-follower-remove-button"
        );
    }
);

QUnit.test(
    'Show "No Followers" dropdown-item if there are no followers and user does not have write access',
    async function (assert) {
        const pyEnv = await startServer();
        const resPartnerId1 = pyEnv["res.partner"].create({});
        const { openView } = await start({
            async mockRPC(route, args, performRPC) {
                if (route === "/mail/thread/data") {
                    // mimic user without write access
                    const res = await performRPC(route, args);
                    res["hasWriteAccess"] = false;
                    return res;
                }
            },
        });
        await openView({
            res_id: resPartnerId1,
            res_model: "res.partner",
            views: [[false, "form"]],
        });

        await click(".o-mail-chatter-topbar-follower-list-button");
        assert.containsOnce(
            target,
            ".o-mail-chatter-topbar-follower-list-no-followers.disabled",
            "should display 'No Followers' dropdown-item"
        );
    }
);
