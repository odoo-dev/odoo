/** @odoo-module */

import {
    click,
    start,
    insertText,
    triggerHotkey,
    loadDefaultConfig,
} from "@im_livechat/../tests/helpers/new/test_utils";
import { afterNextRender } from "@mail/../tests/helpers/test_utils";
import { startServer } from "@bus/../tests/helpers/mock_python_environment";

QUnit.test("open/close temporary channel", async (assert) => {
    await startServer();
    await loadDefaultConfig();
    const { root } = await start();
    assert.containsOnce(root, ".o-livechat-LivechatButton");
    await click(".o-livechat-LivechatButton");
    assert.containsOnce(root, ".o-mail-ChatWindow");
    assert.containsNone(root, ".o-livechat-LivechatButton");
    await click(".o-mail-ChatWindow-command[title='Close chat window']");
    assert.containsNone(root, ".o-mail-ChatWindow");
    assert.containsOnce(root, ".o-livechat-LivechatButton");
});

QUnit.test("open/close persisted channel", async (assert) => {
    await startServer();
    await loadDefaultConfig();
    const { root } = await start();
    assert.containsOnce(root, ".o-livechat-LivechatButton");
    await click(".o-livechat-LivechatButton");
    await insertText(".o-mail-Composer-input", "Hello");
    await afterNextRender(() => triggerHotkey("Enter"));
    await click(".o-mail-ChatWindow-command[title='Close chat window']");
    await click(".o-mail-ChatWindow-command[title='Close chat window']");
    assert.containsNone(root, ".o-mail-ChatWindow");
    assert.containsNone(root, ".o-livechat-LivechatButton");
});

QUnit.test("livechat not available", async (assert) => {
    await startServer();
    await loadDefaultConfig();
    const { root } = await start({
        mockRPC(route) {
            if (route === "/im_livechat/init") {
                return { available_for_me: false };
            }
        },
    });
    assert.containsNone(root, ".o-livechat-LivechatButton");
});
