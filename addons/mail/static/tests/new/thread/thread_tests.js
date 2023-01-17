/** @odoo-module **/

import {
    afterNextRender,
    click,
    dragenterFiles,
    insertText,
    isScrolledTo,
    isScrolledToBottom,
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
    const { openDiscuss } = await start();
    await openDiscuss(mailChannelId1);
    await afterNextRender(() => dragenterFiles(target.querySelector(".o-mail-thread")));
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
    const { openDiscuss } = await start();
    await openDiscuss(mailChannelId1);
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
        const { openDiscuss } = await start();
        await openDiscuss(mailChannelId1);
        assert.containsOnce(target, ".o-mail-message");
        assert.containsOnce(target, ".o-mail-message-subject");
        assert.strictEqual(
            target.querySelector(".o-mail-message-subject").textContent,
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
        const { openDiscuss } = await start();
        await openDiscuss(mailChannelId1);
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
    const { openDiscuss } = await start();
    await openDiscuss(mailChannelId1);
    assert.containsN(target, ".o-mail-message", 25);
    const $thread = $(target).find(".o-mail-thread");
    assert.strictEqual($thread[0].scrollTop, $thread[0].scrollHeight - $thread[0].clientHeight); // FIXME UI scaling might mess with this assertion
});

QUnit.test("display day separator before first message of the day", async function (assert) {
    const pyEnv = await startServer();
    const mailChannelId1 = pyEnv["mail.channel"].create({ name: "" });
    pyEnv["mail.message"].create([
        {
            body: "not empty",
            model: "mail.channel",
            res_id: mailChannelId1,
        },
        {
            body: "not empty",
            model: "mail.channel",
            res_id: mailChannelId1,
        },
    ]);
    const { openDiscuss } = await start();
    await openDiscuss(mailChannelId1);
    assert.containsOnce(target, ".o-mail-thread-date-separator");
});

QUnit.test(
    "do not display day separator if all messages of the day are empty",
    async function (assert) {
        const pyEnv = await startServer();
        const mailChannelId1 = pyEnv["mail.channel"].create({ name: "" });
        pyEnv["mail.message"].create({
            body: "",
            model: "mail.channel",
            res_id: mailChannelId1,
        });
        const { openDiscuss } = await start();
        await openDiscuss(mailChannelId1);
        assert.containsNone(target, ".o-mail-thread-date-separator");
    }
);

QUnit.test(
    "scroll position is kept when navigating from one channel to another",
    async function (assert) {
        const pyEnv = await startServer();
        const channelId_1 = pyEnv["mail.channel"].create({ name: "channel-1" });
        const channelId_2 = pyEnv["mail.channel"].create({ name: "channel-2" });
        // Fill both channels with random messages in order for the scrollbar to
        // appear.
        pyEnv["mail.message"].create(
            Array(40)
                .fill(0)
                .map((_, index) => ({
                    body: "Non Empty Body ".repeat(25),
                    message_type: "comment",
                    model: "mail.channel",
                    res_id: index & 1 ? channelId_1 : channelId_2,
                }))
        );
        const { openDiscuss } = await start();
        await openDiscuss(channelId_1);
        const scrolltop_1 = target.querySelector(".o-mail-thread").scrollHeight / 2;
        target.querySelector(".o-mail-thread").scrollTo({ top: scrolltop_1 });
        await click(".o-mail-category-item:contains(channel-2)");
        const scrolltop_2 = target.querySelector(".o-mail-thread").scrollHeight / 3;
        target.querySelector(".o-mail-thread").scrollTo({ top: scrolltop_2 });
        await click(".o-mail-category-item:contains(channel-1)");
        assert.ok(isScrolledTo(target.querySelector(".o-mail-thread"), scrolltop_1));

        await click(".o-mail-category-item:contains(channel-2)");
        assert.ok(isScrolledTo(target.querySelector(".o-mail-thread"), scrolltop_2));
    }
);

QUnit.test("thread is still scrolling after scrolling up then to bottom", async function (assert) {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({ name: "channel-1" });
    pyEnv["mail.message"].create(
        Array(20)
            .fill(0)
            .map(() => ({
                body: "Non Empty Body ".repeat(25),
                message_type: "comment",
                model: "mail.channel",
                res_id: channelId,
            }))
    );
    const { openDiscuss } = await start();
    await openDiscuss(channelId);
    const thread = target.querySelector(".o-mail-thread");
    thread.scrollTo({ top: thread.scrollHeight / 2 });
    thread.scrollTo({ top: thread.scrollHeight });
    await insertText(".o-mail-composer-textarea", "123");
    await click(".o-mail-composer-send-button");
    assert.ok(isScrolledToBottom(thread));
});
