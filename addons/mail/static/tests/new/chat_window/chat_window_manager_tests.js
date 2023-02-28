/** @odoo-module **/

import { patchUiSize } from "@mail/../tests/helpers/patch_ui_size";
import { start, startServer, click } from "@mail/../tests/helpers/test_utils";
import {
    CHAT_WINDOW_END_GAP_WIDTH,
    CHAT_WINDOW_INBETWEEN_WIDTH,
    CHAT_WINDOW_WIDTH,
} from "@mail/new/web/chat_window/chat_window_service";
import { getFixture } from "@web/../tests/helpers/utils";

let target;

QUnit.module("chat window manager", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test("chat window does not fetch messages if hidden", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create([
        {
            channel_member_ids: [
                [0, 0, { is_minimized: true, partner_id: pyEnv.currentPartnerId }],
            ],
        },
        {
            channel_member_ids: [
                [0, 0, { is_minimized: true, partner_id: pyEnv.currentPartnerId }],
            ],
        },
        {
            channel_member_ids: [
                [0, 0, { is_minimized: true, partner_id: pyEnv.currentPartnerId }],
            ],
        },
    ]);
    patchUiSize({ width: 900 });
    assert.ok(
        CHAT_WINDOW_END_GAP_WIDTH * 2 + CHAT_WINDOW_WIDTH * 2 + CHAT_WINDOW_INBETWEEN_WIDTH < 900
    );
    assert.ok(
        CHAT_WINDOW_END_GAP_WIDTH * 2 + CHAT_WINDOW_WIDTH * 3 + CHAT_WINDOW_INBETWEEN_WIDTH * 2 >
            900
    );
    await start({
        mockRPC(route, args) {
            if (route === "/mail/channel/messages") {
                assert.step("fetch_messages");
            }
        },
    });
    assert.containsN(target, ".o-mail-chat-window", 2);
    assert.containsOnce(target, ".o-mail-chat-window-hidden-menu");
    assert.verifySteps(["fetch_messages", "fetch_messages"]);
});

QUnit.test("click on hidden chat window should fetch its messages", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create([
        {
            channel_member_ids: [
                [0, 0, { is_minimized: true, partner_id: pyEnv.currentPartnerId }],
            ],
        },
        {
            channel_member_ids: [
                [0, 0, { is_minimized: true, partner_id: pyEnv.currentPartnerId }],
            ],
        },
        {
            channel_member_ids: [
                [0, 0, { is_minimized: true, partner_id: pyEnv.currentPartnerId }],
            ],
        },
    ]);
    patchUiSize({ width: 900 });
    assert.ok(
        CHAT_WINDOW_END_GAP_WIDTH * 2 + CHAT_WINDOW_WIDTH * 2 + CHAT_WINDOW_INBETWEEN_WIDTH < 900
    );
    assert.ok(
        CHAT_WINDOW_END_GAP_WIDTH * 2 + CHAT_WINDOW_WIDTH * 3 + CHAT_WINDOW_INBETWEEN_WIDTH * 2 >
            900
    );
    await start({
        mockRPC(route, args) {
            if (route === "/mail/channel/messages") {
                assert.step("fetch_messages");
            }
        },
    });
    assert.containsN(target, ".o-mail-chat-window", 2);
    assert.containsOnce(target, ".o-mail-chat-window-hidden-menu");
    assert.verifySteps(["fetch_messages", "fetch_messages"]);
    await click(".o-mail-chat-window-hidden-menu");
    await click(".o-mail-chat-window-hidden-menu-item .o-mail-chat-window-header");
    assert.verifySteps(["fetch_messages"]);
});
