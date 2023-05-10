/* @odoo-module */

import { startServer } from "@bus/../tests/helpers/mock_python_environment";
import {
    insertText,
    loadDefaultConfig,
    start,
    setCookie,
    triggerHotkey,
} from "@im_livechat/../tests/helpers/new/test_utils";

import { afterNextRender } from "@mail/../tests/helpers/test_utils";
import { Command } from "@mail/../tests/helpers/command";

QUnit.module("livechat session");

QUnit.test("Unsuccessful message post shows session expired", async (assert) => {
    const pyEnv = await startServer();
    const livechatChannelId = await loadDefaultConfig();
    const channelId = pyEnv["discuss.channel"].create({
        channel_member_ids: [
            Command.create({ partner_id: pyEnv.currentPartnerId }),
            Command.create({ partner_id: pyEnv.publicPartnerId }),
        ],
        channel_type: "livechat",
        livechat_channel_id: livechatChannelId,
        livechat_operator_id: pyEnv.currentPartnerId,
    });
    const [channelInfo] = pyEnv.mockServer._mockDiscussChannelChannelInfo([channelId]);
    setCookie("im_livechat_session", JSON.stringify(channelInfo));
    const { root } = await start({
        mockRPC(route) {
            if (route === "/im_livechat/chat_post") {
                return false;
            }
        },
    });
    await insertText(".o-mail-Composer-input", "Hello World!");
    await afterNextRender(() => triggerHotkey("Enter"));
    assert.containsOnce($, ".o_notification:contains(Session expired)");
    assert.containsNone(root, ".o-mail-ChatWindow");
});
