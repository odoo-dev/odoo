/** @odoo-module **/

import { start, startServer } from "@mail/../tests/helpers/test_utils";
import { getFixture } from "@web/../tests/helpers/utils";

let target;
QUnit.module("call", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test("basic rendering", async function (assert) {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({
        name: "General",
    });
    const { click, openDiscuss } = await start({
        discuss: { context: { active_id: `mail.channel_${channelId}` } },
    });
    await openDiscuss();
    await click(".o-mail-discuss-actions button[title='Start a Call']");
    assert.containsOnce(target, ".o-mail-call");
    assert.containsOnce(target, ".o-mail-call-participant-card[aria-label='Mitchell Admin']");
    assert.containsOnce(target, ".o-mail-call-participant-card-overlay:contains(Mitchell Admin)");
    assert.containsOnce(target, ".o-mail-call-action-list");
    assert.containsN(target, ".o-mail-call-action-list button", 6);
    assert.containsOnce(target, ".o-mail-call-action-list button[aria-label='Unmute']"); // FIXME depends on current browser navigation
    assert.containsOnce(target, ".o-mail-call-action-list button[aria-label='Deafen']");
    assert.containsOnce(target, ".o-mail-call-action-list button[aria-label='Turn camera on']");
    assert.containsOnce(target, ".o-mail-call-action-list button[aria-label='Share screen']");
    assert.containsOnce(
        target,
        ".o-mail-call-action-list button[aria-label='Activate Full Screen']"
    );
    assert.containsOnce(target, ".o-mail-call-action-list button[aria-label='Join Call']");
});
