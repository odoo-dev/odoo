/** @odoo-module **/

import { startServer } from "@bus/../tests/helpers/mock_python_environment";

import {
    click,
    loadDefaultConfig,
    start,
    setCookie,
} from "@im_livechat/../tests/helpers/new/test_utils";

QUnit.module("livechat service");

QUnit.test("persisted session history", async (assert) => {
    const pyEnv = await startServer();
    const channelId = await loadDefaultConfig();
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
    await click(".o-livechat-LivechatButton");
    assert.containsOnce(root, ".o-mail-Message:contains(Old message in history)");
});
