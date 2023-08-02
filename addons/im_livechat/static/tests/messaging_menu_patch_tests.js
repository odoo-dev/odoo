/* @odoo-module */

import { click, start, startServer } from "@mail/../tests/helpers/test_utils";
import { patchUiSize } from "@mail/../tests/helpers/patch_ui_size";

QUnit.module("messaging menu (patch)");

QUnit.test('livechats should be in "chat" filter', async (assert) => {
    const pyEnv = await startServer();
    pyEnv["discuss.channel"].create({
        name: "Visitor 11",
        channel_member_ids: [
            [0, 0, { partner_id: pyEnv.currentPartnerId }],
            [0, 0, { partner_id: pyEnv.publicPartnerId }],
        ],
        channel_type: "livechat",
        livechat_operator_id: pyEnv.currentPartnerId,
    });
    await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    assert.containsOnce($, ".o-mail-MessagingMenu button:contains(All)");
    assert.hasClass($(".o-mail-MessagingMenu button:contains(All)"), "fw-bolder");
    assert.containsOnce($, ".o-mail-NotificationItem:contains(Visitor 11)");
    await click(".o-mail-MessagingMenu button:contains(Chat)");
    assert.hasClass($(".o-mail-MessagingMenu button:contains(Chat)"), "fw-bolder");
    assert.containsOnce($, ".o-mail-NotificationItem:contains(Visitor 11)");
});

QUnit.test('livechats should be in "livechat" tab in mobile', async (assert) => {
    patchUiSize({ height: 360, width: 640 });
    const pyEnv = await startServer();
    pyEnv["discuss.channel"].create({
        name: "Visitor 11",
        channel_member_ids: [
            [0, 0, { partner_id: pyEnv.currentPartnerId }],
            [0, 0, { partner_id: pyEnv.publicPartnerId }],
        ],
        channel_type: "livechat",
        livechat_operator_id: pyEnv.currentPartnerId,
    });
    await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    await click("button:contains(Livechat)");
    assert.containsOnce($, ".o-mail-NotificationItem:contains(Visitor 11)");
    await click("button:contains(Chat)");
    assert.containsNone($, ".o-mail-NotificationItem:contains(Visitor 11)");
});
