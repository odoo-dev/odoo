/* @odoo-module */

import { startServer } from "@bus/../tests/helpers/mock_python_environment";

import { start, loadDefaultConfig } from "@im_livechat/../tests/helpers/new/test_utils";

import { session } from "@web/session";
import { patchWithCleanup } from "@web/../tests/helpers/utils";

QUnit.module("chat request");

QUnit.test("chat request opens chat window", async (assert) => {
    const pyEnv = await startServer();
    const channelId = await loadDefaultConfig();
    const [channel] = pyEnv["im_livechat.channel"].searchRead([["id", "=", channelId]]);
    patchWithCleanup(session.livechatData, {
        options: {
            ...session.livechatData.options,
            chat_request_session: {
                folded: false,
                id: channel.id,
                operator_pid: [pyEnv.currentPartnerId, pyEnv.currentPartner.name],
                name: channel.name,
                uuid: channel.uuid,
                isChatRequest: true,
            },
        },
    });
    const { root } = await start();
    assert.containsOnce(root, ".o-mail-ChatWindow");
});
