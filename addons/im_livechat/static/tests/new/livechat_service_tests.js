/** @odoo-module **/

import { startServer } from "@bus/../tests/helpers/mock_python_environment";

import {
    click,
    loadDefaultConfig,
    start,
    setCookie,
} from "@im_livechat/../tests/helpers/new/test_utils";

import { Command } from "@mail/../tests/helpers/command";

QUnit.module("livechat service");

QUnit.test("persisted session history", async (assert) => {
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
    pyEnv["mail.message"].create({
        author_id: pyEnv.currentPartnerId,
        body: "Old message in history",
        res_id: channelId,
        model: "discuss.channel",
        message_type: "comment",
    });

    const { root } = await start();
    assert.containsOnce(root, ".o-mail-Message:contains(Old message in history)");
});

QUnit.test("previous operator prioritized", async (assert) => {
    const pyEnv = await startServer();
    const livechatChannelId = await loadDefaultConfig();
    const userId = pyEnv["res.users"].create({ name: "John Doe", im_status: "online" });
    const previousOperatorId = pyEnv["res.partner"].create({ user_ids: [userId] });
    pyEnv["im_livechat.channel"].write([livechatChannelId], { user_ids: [Command.link(userId)] });
    setCookie("im_livechat_previous_operator_pid", JSON.stringify(previousOperatorId));
    const { root } = await start();
    await click(".o-livechat-LivechatButton");
    assert.containsOnce(root, ".o-mail-Message-author:contains(John Doe)");
});
