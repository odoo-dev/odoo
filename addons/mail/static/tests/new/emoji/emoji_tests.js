/* @odoo-module */

import {
    afterNextRender,
    click,
    insertText,
    start,
    startServer,
} from "@mail/../tests/helpers/test_utils";

import { getFixture, triggerHotkey } from "@web/../tests/helpers/utils";

let target;

QUnit.module("emoji", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test("search emoji from keywords", async function (assert) {
    const pyEnv = await startServer();
    const mailChannelId1 = pyEnv["mail.channel"].create({ name: "" });
    const { openDiscuss } = await start();
    await openDiscuss(mailChannelId1);
    await click("i[aria-label='Emojis']");
    await insertText("input[placeholder='Search for an emoji']", "mexican");
    assert.containsOnce(target, ".o-emoji[data-codepoints='🌮']");
});

QUnit.test("search emoji from keywords with special regex character", async function (assert) {
    const pyEnv = await startServer();
    const mailChannelId1 = pyEnv["mail.channel"].create({ name: "" });
    const { openDiscuss } = await start();
    await openDiscuss(mailChannelId1);
    await click("i[aria-label='Emojis']");
    await insertText("input[placeholder='Search for an emoji']", "(blood");
    assert.containsOnce(target, ".o-emoji[data-codepoints='🆎']");
});

QUnit.test("Press Escape in emoji picker closes the emoji picker", async function (assert) {
    const pyEnv = await startServer();
    const mailChannelId1 = pyEnv["mail.channel"].create({ name: "" });
    const { openDiscuss } = await start();
    await openDiscuss(mailChannelId1);
    await click("i[aria-label='Emojis']");
    await afterNextRender(() => triggerHotkey("Escape"));
    assert.containsNone(target, ".o-mail-emoji-picker");
});
