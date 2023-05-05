/** @odoo-module **/

import { startServer } from "@bus/../tests/helpers/mock_python_environment";

import {
    click,
    loadDefaultConfig,
    start,
    setCookie,
} from "@im_livechat/../tests/helpers/new/test_utils";

import { nextTick } from "@web/../tests/helpers/utils";

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
    assert.containsOnce(root, ".o-mail-Message:contains(Old message in history)");
});

QUnit.test("previous operator used when available", async (assert) => {
    const pyEnv = await startServer();
    const channelId = await loadDefaultConfig();
    const [channel] = pyEnv["discuss.channel"].searchRead([["id", "=", channelId]]);
    setCookie("im_livechat_previous_operator_pid", JSON.stringify(channel.livechat_operator_id[0]));
    await start({
        mockRPC(route, args) {
            if (route === "/im_livechat/get_session") {
                assert.step("get_session");
                assert.strictEqual(
                    parseInt(args.previous_operator_id),
                    channel.livechat_operator_id[0]
                );
            }
        },
    });
    await click(".o-livechat-LivechatButton");
    await nextTick();
    assert.verifySteps(["get_session"]);
});
