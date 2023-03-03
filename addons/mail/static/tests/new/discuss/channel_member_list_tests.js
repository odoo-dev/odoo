/** @odoo-module **/

import { click, start, startServer } from "@mail/../tests/helpers/test_utils";
import { createLocalId } from "@mail/new/utils/misc";
import { getFixture, nextTick } from "@web/../tests/helpers/utils";

let target;

QUnit.module("channel member list", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test(
    "there should be a button to show member list in the thread view topbar initially",
    async function (assert) {
        const pyEnv = await startServer();
        const partnerId = pyEnv["res.partner"].create({ name: "Demo" });
        const channelId = pyEnv["mail.channel"].create({
            name: "TestChanel",
            channel_member_ids: [
                [0, 0, { partner_id: pyEnv.currentPartnerId }],
                [0, 0, { partner_id: partnerId }],
            ],
            channel_type: "channel",
        });
        const { openDiscuss } = await start();
        await openDiscuss(channelId);
        assert.containsOnce(target, "[title='Show Member List']");
    }
);

QUnit.test(
    "should show member list when clicking on show member list button in thread view topbar",
    async function (assert) {
        const pyEnv = await startServer();
        const partnerId = pyEnv["res.partner"].create({ name: "Demo" });
        const channelId = pyEnv["mail.channel"].create({
            name: "TestChanel",
            channel_member_ids: [
                [0, 0, { partner_id: pyEnv.currentPartnerId }],
                [0, 0, { partner_id: partnerId }],
            ],
            channel_type: "channel",
        });
        const { openDiscuss } = await start();
        await openDiscuss(channelId);
        await click("button[title='Show Member List']");
        assert.containsOnce(target, ".o-mail-channel-member-list");
    }
);

QUnit.test("should have correct members in member list", async function (assert) {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ name: "Demo" });
    const channelId = pyEnv["mail.channel"].create({
        name: "TestChanel",
        channel_member_ids: [
            [0, 0, { partner_id: pyEnv.currentPartnerId }],
            [0, 0, { partner_id: partnerId }],
        ],
        channel_type: "channel",
    });
    const { openDiscuss } = await start();
    await openDiscuss(channelId);
    await click("button[title='Show Member List']");
    assert.containsN(target, ".o-mail-channel-member", 2);
    assert.containsOnce(target, `.o-mail-channel-member:contains("${pyEnv.currentPartner.name}")`);
    assert.containsOnce(target, ".o-mail-channel-member:contains('Demo')");
});

QUnit.test(
    "there should be a button to hide member list in the thread view topbar when the member list is visible",
    async function (assert) {
        const pyEnv = await startServer();
        const partnerId = pyEnv["res.partner"].create({ name: "Demo" });
        const channelId = pyEnv["mail.channel"].create({
            name: "TestChanel",
            channel_member_ids: [
                [0, 0, { partner_id: pyEnv.currentPartnerId }],
                [0, 0, { partner_id: partnerId }],
            ],
            channel_type: "channel",
        });
        const { openDiscuss } = await start();
        await openDiscuss(channelId);
        await click("button[title='Show Member List']");
        assert.containsOnce(target, "[title='Hide Member List']");
    }
);

QUnit.test(
    "chat with member should be opened after clicking on channel member",
    async function (assert) {
        const pyEnv = await startServer();
        const partnerId = pyEnv["res.partner"].create({ name: "Demo" });
        pyEnv["res.users"].create({ partner_id: partnerId });
        const channelId = pyEnv["mail.channel"].create({
            name: "TestChanel",
            channel_member_ids: [
                [0, 0, { partner_id: pyEnv.currentPartnerId }],
                [0, 0, { partner_id: partnerId }],
            ],
            channel_type: "channel",
        });
        const { openDiscuss } = await start();
        await openDiscuss(channelId);
        await click("button[title='Show Member List']");
        await click(".o-mail-channel-member.cursor-pointer");
        assert.containsOnce(target, ".o-mail-autoresize-input[title='Demo']");
    }
);

QUnit.test(
    "should show a button to load more members if they are not all loaded",
    async function (assert) {
        // Test assumes at most 100 members are loaded at once.
        const pyEnv = await startServer();
        const channel_member_ids = [];
        for (let i = 0; i < 101; i++) {
            const partnerId = pyEnv["res.partner"].create({ name: "name" + i });
            channel_member_ids.push([0, 0, { partner_id: partnerId }]);
        }
        const channelId = pyEnv["mail.channel"].create({
            name: "TestChanel",
            channel_type: "channel",
        });
        const { openDiscuss } = await start();
        await openDiscuss(channelId);
        pyEnv["mail.channel"].write([channelId], { channel_member_ids });
        await click("button[title='Show Member List']");
        assert.containsOnce(target, "button:contains(Load more)");
    }
);

QUnit.test("Load more button should load more members", async function (assert) {
    // Test assumes at most 100 members are loaded at once.
    const pyEnv = await startServer();
    const channel_member_ids = [];
    for (let i = 0; i < 101; i++) {
        const partnerId = pyEnv["res.partner"].create({ name: "name" + i });
        channel_member_ids.push([0, 0, { partner_id: partnerId }]);
    }
    const channelId = pyEnv["mail.channel"].create({
        name: "TestChanel",
        channel_type: "channel",
    });
    const { openDiscuss } = await start();
    await openDiscuss(channelId);
    pyEnv["mail.channel"].write([channelId], { channel_member_ids });
    await click("button[title='Show Member List']");
    await click("button[title='Load more']");
    assert.containsN(target, ".o-mail-channel-member", 102);
});

QUnit.test("Channel member count update after user joined", async function (assert) {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({ name: "General" });
    const userId = pyEnv["res.users"].create({ name: "Harry" });
    pyEnv["res.partner"].create({ name: "Harry", user_ids: [userId] });
    const { env, openDiscuss } = await start();
    await openDiscuss(channelId);
    const thread = env.services["mail.store"].threads[createLocalId("mail.channel", channelId)];
    assert.strictEqual(thread.memberCount, 1);
    await click("button[title='Show Member List']");
    await click("button[title='Add Users']");
    await click("button[title='Invite to Channel']");
    assert.strictEqual(thread.memberCount, 2);
});

QUnit.test("Channel member count update after user left", async function (assert) {
    const pyEnv = await startServer();
    const userId = pyEnv["res.users"].create({ name: "Dobby" });
    const partnerId = pyEnv["res.partner"].create({ name: "Dobby", user_ids: [userId] });
    const channelId = pyEnv["mail.channel"].create({
        name: "General",
        channel_member_ids: [
            [0, 0, { partner_id: pyEnv.currentPartnerId }],
            [0, 0, { partner_id: partnerId }],
        ],
    });
    const { env, openDiscuss } = await start();
    await openDiscuss(channelId);
    const thread = env.services["mail.store"].threads[createLocalId("mail.channel", channelId)];
    assert.strictEqual(thread.memberCount, 2);
    await env.services.orm.call("mail.channel", "action_unfollow", [channelId], {
        context: { mockedUserId: userId },
    });
    await nextTick();
    assert.strictEqual(thread.memberCount, 1);
});
