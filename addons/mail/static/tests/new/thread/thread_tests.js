/** @odoo-module **/

import {
    afterNextRender,
    dragenterFiles,
    start,
    startServer,
} from "@mail/../tests/helpers/test_utils";

import { getFixture } from "@web/../tests/helpers/utils";

let target;

QUnit.module("thread", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test("dragover files on thread with composer", async function (assert) {
    const pyEnv = await startServer();
    const mailChannelId1 = pyEnv["mail.channel"].create({
        channel_type: "channel",
        group_public_id: false,
        name: "General",
    });
    const { openDiscuss } = await start({
        discuss: {
            context: { active_id: `mail.channel_${mailChannelId1}` },
        },
    });
    await openDiscuss();
    await afterNextRender(() => dragenterFiles(document.querySelector(".o-mail-thread")));
    assert.containsOnce(target, ".o-dropzone");
});

QUnit.test("load more messages from channel (auto-load on scroll)", async function (assert) {
    const pyEnv = await startServer();
    const mailChannelId1 = pyEnv["mail.channel"].create({
        channel_type: "channel",
        group_public_id: false,
        name: "General",
    });
    for (let i = 0; i <= 60; i++) {
        pyEnv["mail.message"].create({
            body: "not empty",
            model: "mail.channel",
            res_id: mailChannelId1,
        });
    }
    const { openDiscuss } = await start({
        discuss: {
            context: { active_id: `mail.channel_${mailChannelId1}` },
        },
    });
    await openDiscuss();
    assert.containsN(target, ".o-mail-thread button:contains(Load More) ~ .o-mail-message", 30);

    await afterNextRender(() => (target.querySelector(".o-mail-thread").scrollTop = 0));
    assert.containsN(target, ".o-mail-thread .o-mail-message", 60);
});

QUnit.test(
    "show message subject when subject is not the same as the thread name",
    async function (assert) {
        const pyEnv = await startServer();
        const mailChannelId1 = pyEnv["mail.channel"].create({
            channel_type: "channel",
            group_public_id: false,
            name: "General",
        });
        pyEnv["mail.message"].create({
            body: "not empty",
            model: "mail.channel",
            res_id: mailChannelId1,
            subject: "Salutations, voyageur",
        });
        const { openDiscuss } = await start({
            discuss: {
                context: { active_id: `mail.channel_${mailChannelId1}` },
            },
        });
        await openDiscuss();
        assert.containsOnce(target, ".o-mail-message");
        assert.containsOnce(target, ".o-mail-message-subject");
        assert.strictEqual(
            document.querySelector(".o-mail-message-subject").textContent,
            "Subject: Salutations, voyageur"
        );
    }
);

QUnit.test(
    "do not show message subject when subject is the same as the thread name",
    async function (assert) {
        const pyEnv = await startServer();
        const mailChannelId1 = pyEnv["mail.channel"].create({
            channel_type: "channel",
            group_public_id: false,
            name: "Salutations, voyageur",
        });
        pyEnv["mail.message"].create({
            body: "not empty",
            model: "mail.channel",
            res_id: mailChannelId1,
            subject: "Salutations, voyageur",
        });
        const { openDiscuss } = await start({
            discuss: {
                context: { active_id: `mail.channel_${mailChannelId1}` },
            },
        });
        await openDiscuss();
        assert.containsNone(target, ".o-mail-message-subject");
    }
);

QUnit.test("auto-scroll to bottom of thread on load", async function (assert) {
    const pyEnv = await startServer();
    const mailChannelId1 = pyEnv["mail.channel"].create({ name: "general" });
    for (let i = 1; i <= 25; i++) {
        pyEnv["mail.message"].create({
            body: "not empty",
            model: "mail.channel",
            res_id: mailChannelId1,
        });
    }
    const { openDiscuss } = await start({
        discuss: {
            params: {
                default_active_id: `mail.channel_${mailChannelId1}`,
            },
        },
    });
    await openDiscuss();
    assert.containsN(document.body, ".o-mail-message", 25);
    const $thread = $(target).find(".o-mail-thread");
    assert.strictEqual($thread[0].scrollTop, $thread[0].scrollHeight - $thread[0].clientHeight); // FIXME UI scaling might mess with this assertion
});
