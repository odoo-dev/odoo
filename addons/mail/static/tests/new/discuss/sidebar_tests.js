/** @odoo-module **/

import { start, startServer } from "@mail/../tests/helpers/test_utils";
import { Sidebar } from "@mail/new/discuss/sidebar";
import { click, getFixture, mount } from "@web/../tests/helpers/utils";
import { makeTestEnv, TestServer } from "../helpers/helpers";

let target;

QUnit.module("discuss sidebar", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test("toggling category button hide category items", async (assert) => {
    const server = new TestServer();
    server.addChannel(43, "abc");
    const env = makeTestEnv((route, params) => server.rpc(route, params));
    await mount(Sidebar, target, { env });

    assert.containsOnce(target, "button.o-active:contains('Inbox')");
    assert.containsN(target, ".o-mail-category-item", 1);
    await click(target.querySelector(".o-mail-category-icon"));
    assert.containsNone(target, ".o-mail-category-item");
});

QUnit.test("toggling category button does not hide active category items", async (assert) => {
    const server = new TestServer();
    server.addChannel(43, "abc");
    server.addChannel(46, "def");
    const env = makeTestEnv((route, params) => server.rpc(route, params));
    env.services["mail.messaging"].state.discuss.threadId = 43; // #abc is active

    await mount(Sidebar, target, { env });
    assert.containsN(target, ".o-mail-category-item", 2);
    assert.containsOnce(target, ".o-mail-category-item.o-active");
    await click(target.querySelector(".o-mail-category-icon"));
    assert.containsOnce(target, ".o-mail-category-item");
    assert.containsOnce(target, ".o-mail-category-item.o-active");
});

QUnit.test(
    "channel - command: should have view command when category is unfolded",
    async function (assert) {
        const { openDiscuss } = await start();
        await openDiscuss();
        assert.containsOnce(
            document.body,
            ".o-mail-category-channel i[title='View or join channels']"
        );
    }
);

QUnit.test(
    "channel - command: should have view command when category is folded",
    async function (assert) {
        const pyEnv = await startServer();
        pyEnv["res.users.settings"].create({
            user_id: pyEnv.currentUserId,
            is_discuss_sidebar_category_channel_open: false,
        });
        const { click, openDiscuss } = await start();
        await openDiscuss();
        await click(".o-mail-category-channel span:contains(Channels)");
        assert.containsOnce(
            document.body,
            ".o-mail-category-channel i[title='View or join channels']"
        );
    }
);

QUnit.test(
    "channel - command: should have add command when category is unfolded",
    async function (assert) {
        const { openDiscuss } = await start();
        await openDiscuss();
        assert.containsOnce(
            document.body,
            ".o-mail-category-channel i[title='Add or join a channel']"
        );
    }
);

QUnit.test(
    "channel - command: should not have add command when category is folded",
    async function (assert) {
        assert.expect(1);

        const pyEnv = await startServer();
        pyEnv["res.users.settings"].create({
            user_id: pyEnv.currentUserId,
            is_discuss_sidebar_category_channel_open: false,
        });
        const { openDiscuss } = await start();
        await openDiscuss();
        assert.containsNone(
            document.body,
            ".o-mail-category-channel i[title='Add or join a channel']"
        );
    }
);

QUnit.test("channel - states: close manually by clicking the title", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({ name: "general" });
    pyEnv["res.users.settings"].create({
        user_id: pyEnv.currentUserId,
        is_discuss_sidebar_category_channel_open: true,
    });
    const { click, openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(document.body, ".o-mail-category-item:contains(general)");
    await click(".o-mail-category-channel span:contains(Channels)");
    assert.containsNone(document.body, ".o-mail-category-item:contains(general)");
});

QUnit.test("channel - states: open manually by clicking the title", async function (assert) {
    const pyEnv = await startServer();
    pyEnv["mail.channel"].create({ name: "general" });
    pyEnv["res.users.settings"].create({
        user_id: pyEnv.currentUserId,
        is_discuss_sidebar_category_channel_open: false,
    });
    const { click, openDiscuss } = await start();
    await openDiscuss();
    assert.containsNone(document.body, ".o-mail-category-item:contains(general)");
    await click(".o-mail-category-channel span:contains(Channels)");
    assert.containsOnce(document.body, ".o-mail-category-item:contains(general)");
});
