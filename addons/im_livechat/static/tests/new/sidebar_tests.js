/** @odoo-module */

import { getFixture, nextTick } from "@web/../tests/helpers/utils";

import { afterNextRender, click, start, startServer } from "@mail/../tests/helpers/test_utils";

let target;
QUnit.module("discuss sidebar", {
    beforeEach() {
        target = getFixture();
    },
});

QUnit.test("Unknown visitor", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({
        anonymous_name: "Visitor 11",
        channel_member_ids: [
            [0, 0, { partner_id: pyEnv.currentPartnerId }],
            [0, 0, { partner_id: pyEnv.publicPartnerId }],
        ],
        channel_type: "livechat",
        livechat_operator_id: pyEnv.currentPartnerId,
    });
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-discuss-sidebar .o-mail-category-livechat");
    assert.containsOnce(target, ".o-mail-category-item:contains(Visitor 11)");
});

QUnit.test("Known user with country", async function (assert) {
    const pyEnv = await startServer();
    const resCountryId1 = pyEnv["res.country"].create({
        code: "be",
        name: "Belgium",
    });
    const resPartnerId1 = pyEnv["res.partner"].create({
        country_id: resCountryId1,
        name: "Jean",
    });
    pyEnv["mail.channel"].create({
        channel_member_ids: [
            [0, 0, { partner_id: pyEnv.currentPartnerId }],
            [0, 0, { partner_id: resPartnerId1 }],
        ],
        channel_type: "livechat",
        livechat_operator_id: pyEnv.currentPartnerId,
    });
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-category-item:contains(Jean (Belgium))");
});

QUnit.test("Do not show channel when visitor is typing", async function (assert) {
    assert.expect(2);

    const pyEnv = await startServer();
    pyEnv["res.users"].write([pyEnv.currentUserId], { im_status: "online" });
    const imLivechatChannelId1 = pyEnv["im_livechat.channel"].create({
        user_ids: [pyEnv.currentUserId],
    });
    const mailChannelId1 = pyEnv["mail.channel"].create({
        channel_member_ids: [
            [
                0,
                0,
                {
                    is_pinned: false,
                    partner_id: pyEnv.currentPartnerId,
                },
            ],
            [0, 0, { partner_id: pyEnv.publicPartnerId }],
        ],
        channel_type: "livechat",
        livechat_channel_id: imLivechatChannelId1,
        livechat_operator_id: pyEnv.currentPartnerId,
    });
    const { env, openDiscuss } = await start();
    await openDiscuss();
    assert.containsNone(target, ".o-mail-category-livechat");
    // simulate livechat visitor typing
    const channel = pyEnv["mail.channel"].searchRead([["id", "=", mailChannelId1]])[0];
    await env.services.rpc("/im_livechat/notify_typing", {
        context: {
            mockedPartnerId: pyEnv.publicPartnerId,
        },
        is_typing: true,
        uuid: channel.uuid,
    });
    await nextTick();
    assert.containsNone(target, ".o-mail-category-livechat");
});

QUnit.test("Close should update the value on the server", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({
        anonymous_name: "Visitor 11",
        channel_member_ids: [
            [0, 0, { partner_id: pyEnv.currentPartnerId }],
            [0, 0, { partner_id: pyEnv.publicPartnerId }],
        ],
        channel_type: "livechat",
        livechat_operator_id: pyEnv.currentPartnerId,
    });
    pyEnv["res.users.settings"].create({
        user_id: pyEnv.currentUserId,
        is_discuss_sidebar_category_livechat_open: true,
    });
    const currentUserId = pyEnv.currentUserId;
    const { env, openDiscuss } = await start();
    await openDiscuss();
    const initalSettings = await env.services.orm.call(
        "res.users.settings",
        "_find_or_create_for_user",
        [[currentUserId]]
    );
    assert.strictEqual(initalSettings.is_discuss_sidebar_category_livechat_open, true);
    await click(".o-mail-category-livechat .btn");
    const newSettings = await env.services.orm.call(
        "res.users.settings",
        "_find_or_create_for_user",
        [[currentUserId]]
    );
    assert.strictEqual(newSettings.is_discuss_sidebar_category_livechat_open, false);
});

QUnit.test("Open should update the value on the server", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({
        anonymous_name: "Visitor 11",
        channel_member_ids: [
            [0, 0, { partner_id: pyEnv.currentPartnerId }],
            [0, 0, { partner_id: pyEnv.publicPartnerId }],
        ],
        channel_type: "livechat",
        livechat_operator_id: pyEnv.currentPartnerId,
    });
    pyEnv["res.users.settings"].create({
        user_id: pyEnv.currentUserId,
        is_discuss_sidebar_category_livechat_open: false,
    });
    const currentUserId = pyEnv.currentUserId;
    const { env, openDiscuss } = await start();
    await openDiscuss();
    const initalSettings = await env.services.orm.call(
        "res.users.settings",
        "_find_or_create_for_user",
        [[currentUserId]]
    );
    assert.strictEqual(initalSettings.is_discuss_sidebar_category_livechat_open, false);
    await click(".o-mail-category-livechat .btn");
    const newSettings = await env.services.orm.call(
        "res.users.settings",
        "_find_or_create_for_user",
        [[currentUserId]]
    );
    assert.strictEqual(newSettings.is_discuss_sidebar_category_livechat_open, true);
});

QUnit.test("Open from the bus", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({
        anonymous_name: "Visitor 11",
        channel_member_ids: [
            [0, 0, { partner_id: pyEnv.currentPartnerId }],
            [0, 0, { partner_id: pyEnv.publicPartnerId }],
        ],
        channel_type: "livechat",
        livechat_operator_id: pyEnv.currentPartnerId,
    });
    const resUsersSettingsId1 = pyEnv["res.users.settings"].create({
        user_id: pyEnv.currentUserId,
        is_discuss_sidebar_category_livechat_open: false,
    });
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsNone(target, ".o-mail-category-livechat + .o-mail-category-item");
    await afterNextRender(() => {
        pyEnv["bus.bus"]._sendone(pyEnv.currentPartner, "mail.record/insert", {
            "res.users.settings": {
                id: resUsersSettingsId1,
                is_discuss_sidebar_category_livechat_open: true,
            },
        });
    });
    assert.containsOnce(target, ".o-mail-category-livechat + .o-mail-category-item");
});

QUnit.test("Close from the bus", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({
        anonymous_name: "Visitor 11",
        channel_member_ids: [
            [0, 0, { partner_id: pyEnv.currentPartnerId }],
            [0, 0, { partner_id: pyEnv.publicPartnerId }],
        ],
        channel_type: "livechat",
        livechat_operator_id: pyEnv.currentPartnerId,
    });
    const resUsersSettingsId1 = pyEnv["res.users.settings"].create({
        user_id: pyEnv.currentUserId,
        is_discuss_sidebar_category_livechat_open: true,
    });
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-category-livechat + .o-mail-category-item");
    await afterNextRender(() => {
        pyEnv["bus.bus"]._sendone(pyEnv.currentPartner, "mail.record/insert", {
            "res.users.settings": {
                id: resUsersSettingsId1,
                is_discuss_sidebar_category_livechat_open: false,
            },
        });
    });
    assert.containsNone(target, ".o-mail-category-livechat + .o-mail-category-item");
});

QUnit.test("Smiley face avatar for an anonymous livechat item", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({
        anonymous_name: "Visitor 11",
        channel_member_ids: [
            [0, 0, { partner_id: pyEnv.currentPartnerId }],
            [0, 0, { partner_id: pyEnv.publicPartnerId }],
        ],
        channel_type: "livechat",
        livechat_operator_id: pyEnv.currentPartnerId,
    });
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.strictEqual(
        document.querySelector(".o-mail-category-livechat + .o-mail-category-item img").dataset.src,
        "/mail/static/src/img/smiley/avatar.jpg"
    );
});

QUnit.test(
    "Partner profile picture for livechat item linked to a partner",
    async function (assert) {
        const pyEnv = await startServer();
        const resPartnerId1 = pyEnv["res.partner"].create({
            name: "Jean",
        });
        const channelId = pyEnv["mail.channel"].create({
            channel_member_ids: [
                [0, 0, { partner_id: pyEnv.currentPartnerId }],
                [0, 0, { partner_id: resPartnerId1 }],
            ],
            channel_type: "livechat",
            livechat_operator_id: pyEnv.currentPartnerId,
        });
        const { openDiscuss } = await start();
        await openDiscuss(channelId);
        assert.strictEqual(
            document.querySelector(".o-mail-category-livechat + .o-mail-category-item img").dataset
                .src,
            `/web/image/res.partner/${resPartnerId1}/avatar_128`
        );
    }
);

QUnit.test(
    "No counter if the category is unfolded and with unread messages",
    async function (assert) {
        const pyEnv = await startServer();
        pyEnv["mail.channel"].create({
            anonymous_name: "Visitor 11",
            channel_member_ids: [
                [
                    0,
                    0,
                    {
                        message_unread_counter: 10,
                        partner_id: pyEnv.currentPartnerId,
                    },
                ],
                [0, 0, { partner_id: pyEnv.publicPartnerId }],
            ],
            channel_type: "livechat",
            livechat_operator_id: pyEnv.currentPartnerId,
        });
        const { openDiscuss } = await start();
        await openDiscuss();
        assert.containsNone(
            target,
            ".o-mail-category-livechat .o-mail-discuss-category-counter",
            "should not have a counter if the category is unfolded and with unread messages"
        );
    }
);

QUnit.test("No counter if category is folded and without unread messages", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({
        anonymous_name: "Visitor 11",
        channel_member_ids: [
            [0, 0, { partner_id: pyEnv.currentPartnerId }],
            [0, 0, { partner_id: pyEnv.publicPartnerId }],
        ],
        channel_type: "livechat",
        livechat_operator_id: pyEnv.currentPartnerId,
    });
    pyEnv["res.users.settings"].create({
        user_id: pyEnv.currentUserId,
        is_discuss_sidebar_category_livechat_open: false,
    });
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsNone(
        target,
        ".o-mail-category-livechat .o-mail-category-counter",
        "should not have a counter if the category is unfolded and with unread messages"
    );
});

QUnit.test(
    "Counter should have correct value of unread threads if category is folded and with unread messages",
    async function (assert) {
        const pyEnv = await startServer();
        pyEnv["mail.channel"].create({
            anonymous_name: "Visitor 11",
            channel_member_ids: [
                [
                    0,
                    0,
                    {
                        message_unread_counter: 10,
                        partner_id: pyEnv.currentPartnerId,
                    },
                ],
                [0, 0, { partner_id: pyEnv.publicPartnerId }],
            ],
            channel_type: "livechat",
            livechat_operator_id: pyEnv.currentPartnerId,
        });
        pyEnv["res.users.settings"].create({
            user_id: pyEnv.currentUserId,
            is_discuss_sidebar_category_livechat_open: false,
        });
        const { openDiscuss } = await start();
        await openDiscuss();
        assert.strictEqual(
            document.querySelector(".o-mail-category-livechat .o-mail-category-counter")
                .textContent,
            "1"
        );
    }
);

QUnit.test("Close manually by clicking the title", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({
        anonymous_name: "Visitor 11",
        channel_member_ids: [
            [0, 0, { partner_id: pyEnv.currentPartnerId }],
            [0, 0, { partner_id: pyEnv.publicPartnerId }],
        ],
        channel_type: "livechat",
        livechat_operator_id: pyEnv.currentPartnerId,
    });
    pyEnv["res.users.settings"].create({
        user_id: pyEnv.currentUserId,
        is_discuss_sidebar_category_livechat_open: true,
    });
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(
        target,
        ".o-mail-category-livechat + .o-mail-category-item",
        "Category is unfolded initially"
    );
    // fold the livechat category
    await click(".o-mail-category-livechat .btn");
    assert.containsNone(target, ".o-mail-category-item");
});

QUnit.test("Open manually by clicking the title", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({
        anonymous_name: "Visitor 11",
        channel_member_ids: [
            [0, 0, { partner_id: pyEnv.currentPartnerId }],
            [0, 0, { partner_id: pyEnv.publicPartnerId }],
        ],
        channel_type: "livechat",
        livechat_operator_id: pyEnv.currentPartnerId,
    });
    pyEnv["res.users.settings"].create({
        user_id: pyEnv.currentUserId,
        is_discuss_sidebar_category_livechat_open: false,
    });
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsNone(
        target,
        ".o-mail-category-livechat + .o-mail-category-item",
        "Category is folded initially"
    );
    // open the livechat category
    await click(".o-mail-category-livechat .btn");
    assert.containsOnce(target, ".o-mail-category-livechat + .o-mail-category-item");
});

QUnit.test("Category item should be invisible if the category is closed", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({
        anonymous_name: "Visitor 11",
        channel_member_ids: [
            [0, 0, { partner_id: pyEnv.currentPartnerId }],
            [0, 0, { partner_id: pyEnv.publicPartnerId }],
        ],
        channel_type: "livechat",
        livechat_operator_id: pyEnv.currentPartnerId,
    });
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-category-livechat + .o-mail-category-item");
    await click(".o-mail-category-livechat .btn");
    assert.containsNone(target, ".o-mail-category-livechat + .o-mail-category-item");
});

QUnit.test(
    "Active category item should be visible even if the category is closed",
    async function (assert) {
        const pyEnv = await startServer();
        pyEnv["mail.channel"].create({
            anonymous_name: "Visitor 11",
            channel_member_ids: [
                [0, 0, { partner_id: pyEnv.currentPartnerId }],
                [0, 0, { partner_id: pyEnv.publicPartnerId }],
            ],
            channel_type: "livechat",
            livechat_operator_id: pyEnv.currentPartnerId,
        });
        const { openDiscuss } = await start();
        await openDiscuss();
        assert.containsOnce(target, ".o-mail-category-livechat + .o-mail-category-item");
        await click(".o-mail-category-livechat + .o-mail-category-item");
        assert.containsOnce(target, ".o-mail-category-livechat + .o-mail-category-item.o-active");
        await click(".o-mail-category-livechat .btn");
        assert.containsOnce(target, ".o-mail-category-livechat + .o-mail-category-item");
    }
);
