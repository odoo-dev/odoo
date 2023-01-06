/** @odoo-module **/

import { UPDATE_BUS_PRESENCE_DELAY } from "@bus/im_status_service";
import { start, startServer, afterNextRender } from "@mail/../tests/helpers/test_utils";
import { getFixture, nextTick } from "@web/../tests/helpers/utils";

let target;

QUnit.module("im status", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test("initially online", async function (assert) {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ im_status: "online" });
    const mailChannelId = pyEnv["mail.channel"].create({ name: "TestChanel" });
    pyEnv["mail.message"].create({
        author_id: partnerId,
        body: "not empty",
        model: "mail.channel",
        res_id: mailChannelId,
    });
    const { advanceTime, openDiscuss } = await start({
        discuss: {
            params: {
                default_active_id: `mail.channel_${mailChannelId}`,
            },
        },
        hasTimeControl: true,
    });
    await openDiscuss();
    await afterNextRender(() => advanceTime(UPDATE_BUS_PRESENCE_DELAY));
    assert.containsOnce(target, ".o-mail-partner-im-status-icon.o-online");
});

QUnit.test("initially offline", async function (assert) {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ im_status: "offline" });
    const mailChannelId = pyEnv["mail.channel"].create({ name: "TestChannel" });
    pyEnv["mail.message"].create({
        author_id: partnerId,
        body: "not empty",
        model: "mail.channel",
        res_id: mailChannelId,
    });
    const { advanceTime, openDiscuss } = await start({
        discuss: {
            params: {
                default_active_id: `mail.channel_${mailChannelId}`,
            },
        },
        hasTimeControl: true,
    });
    await openDiscuss();
    await afterNextRender(() => advanceTime(UPDATE_BUS_PRESENCE_DELAY));
    assert.containsOnce(target, ".o-mail-partner-im-status-icon.o-offline");
});

QUnit.test("initially away", async function (assert) {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ im_status: "away" });
    const mailChannelId = pyEnv["mail.channel"].create({ name: "TestChanel" });
    pyEnv["mail.message"].create({
        author_id: partnerId,
        body: "not empty",
        model: "mail.channel",
        res_id: mailChannelId,
    });
    const { advanceTime, openDiscuss } = await start({
        discuss: {
            params: {
                default_active_id: `mail.channel_${mailChannelId}`,
            },
        },
        hasTimeControl: true,
    });
    await openDiscuss();
    await afterNextRender(() => advanceTime(UPDATE_BUS_PRESENCE_DELAY));
    assert.containsOnce(target, ".o-mail-partner-im-status-icon.o-away");
});

QUnit.test("change icon on change partner im_status", async function (assert) {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ im_status: "online" });
    const mailChannelId = pyEnv["mail.channel"].create({ name: "TestChannel" });
    pyEnv["mail.message"].create({
        author_id: partnerId,
        body: "not empty",
        model: "mail.channel",
        res_id: mailChannelId,
    });
    const { advanceTime, openDiscuss } = await start({
        discuss: {
            params: {
                default_active_id: `mail.channel_${mailChannelId}`,
            },
        },
        hasTimeControl: true,
    });
    await openDiscuss();
    await afterNextRender(() => advanceTime(UPDATE_BUS_PRESENCE_DELAY));
    assert.containsOnce(target, ".o-mail-partner-im-status-icon.o-online");

    pyEnv["res.partner"].write([partnerId], { im_status: "offline" });
    await afterNextRender(() => advanceTime(UPDATE_BUS_PRESENCE_DELAY));
    assert.containsOnce(target, ".o-mail-partner-im-status-icon.o-offline");

    pyEnv["res.partner"].write([partnerId], { im_status: "away" });
    await afterNextRender(() => advanceTime(UPDATE_BUS_PRESENCE_DELAY));
    assert.containsOnce(target, ".o-mail-partner-im-status-icon.o-away");

    pyEnv["res.partner"].write([partnerId], { im_status: "online" });
    await afterNextRender(() => advanceTime(UPDATE_BUS_PRESENCE_DELAY));
    assert.containsOnce(target, ".o-mail-partner-im-status-icon.o-online");
});

QUnit.test("Can handle im_status of unknown partner", async function (assert) {
    const { env, pyEnv } = await start();
    const partnerId = pyEnv["res.partner"].create({ name: "Bob" });
    pyEnv["bus.bus"]._sendone("channel-1", "mail.record/insert", {
        Partner: { im_status: "online", id: partnerId },
    });
    await nextTick();
    const partners = env.services["mail.store"].partners;
    assert.ok(partnerId in partners, "Unknown partner should have been added");
    assert.ok(
        partners[partnerId].im_status === "online",
        "ImStatus of partner should be the same as the one present in the notification"
    );
});
