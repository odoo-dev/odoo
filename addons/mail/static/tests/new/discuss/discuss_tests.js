/** @odoo-module **/

import { Discuss } from "@mail/new/discuss/discuss";
import {
    click,
    editInput,
    getFixture,
    mount,
    nextTick,
    patchWithCleanup,
    triggerEvent,
} from "@web/../tests/helpers/utils";
import { insertText, makeTestEnv, TestServer } from "../helpers/helpers";
import { browser } from "@web/core/browser/browser";
import { loadEmoji } from "@mail/new/composer/emoji_picker";

let target;

QUnit.module("mail", (hooks) => {
    hooks.beforeEach(async () => {
        target = getFixture();
        // for autocomplete stuff
        patchWithCleanup(browser, {
            setTimeout: (fn) => fn(),
        });
    });

    QUnit.module("discuss");

    QUnit.test("sanity check", async (assert) => {
        const server = new TestServer();
        const env = makeTestEnv((route, params) => {
            if (route.startsWith("/mail")) {
                assert.step(route);
            }
            return server.rpc(route, params);
        });

        await mount(Discuss, target, { env });
        assert.containsOnce(target, ".o-mail-discuss-sidebar");
        assert.containsOnce(
            target,
            ".o-mail-discuss-content h4:contains(Congratulations, your inbox is empty)"
        );

        assert.verifySteps(["/mail/init_messaging", "/mail/inbox/messages"]);
    });

    QUnit.test("can open #general", async (assert) => {
        const server = new TestServer();
        server.addChannel(1, "general", "General announcements...");
        const env = makeTestEnv((route, params) => {
            if (route === "/mail/channel/messages") {
                assert.strictEqual(route, "/mail/channel/messages");
                assert.strictEqual(params.channel_id, 1);
                assert.strictEqual(params.limit, 30);
            }
            return server.rpc(route, params);
        });

        await mount(Discuss, target, { env });
        assert.containsOnce(target, ".o-mail-category-item");
        assert.containsNone(target, ".o-mail-category-item.o-active");
        await click(target, ".o-mail-category-item");
        assert.containsOnce(target, ".o-mail-category-item.o-active");
        assert.containsNone(target, ".o-mail-discuss-content .o-mail-message");
        assert.strictEqual(
            target.querySelector(".o-mail-composer-textarea"),
            document.activeElement
        );
    });

    QUnit.test("can change the thread name of #general", async (assert) => {
        const server = new TestServer();
        server.addChannel(1, "general", "General announcements...");
        const env = makeTestEnv((route, params) => {
            if (route === "/web/dataset/call_kw/mail.channel/channel_rename") {
                assert.step(route);
            }
            return server.rpc(route, params);
        });
        await mount(Discuss, target, { env });
        env.services["mail.messaging"].setDiscussThread(1);

        assert.containsOnce(target, ".o-mail-discuss-thread-name");
        const threadNameElement = target.querySelector(
            ".o-mail-discuss-thread-name .o-mail-autogrow-input"
        );

        await click(threadNameElement);
        assert.strictEqual(threadNameElement.value, "general");
        await editInput(target, ".o-mail-discuss-thread-name .o-mail-autogrow-input", "special");
        await triggerEvent(
            target,
            ".o-mail-discuss-thread-name .o-mail-autogrow-input",
            "keydown",
            {
                key: "Enter",
            }
        );
        assert.strictEqual(threadNameElement.value, "special");

        assert.verifySteps(["/web/dataset/call_kw/mail.channel/channel_rename"]);
    });

    QUnit.test("can post a message", async (assert) => {
        const server = new TestServer();
        server.addChannel(1, "general", "General announcements...");
        const env = makeTestEnv((route, params) => {
            if (route.startsWith("/mail")) {
                assert.step(route);
            }
            return server.rpc(route, params);
        });
        env.services["mail.messaging"].setDiscussThread(1);

        await mount(Discuss, target, { env });
        assert.containsNone(target, ".o-mail-message");
        await insertText(".o-mail-composer-textarea", "abc");
        await click(target, ".o-mail-composer-send-button");
        await loadEmoji(); // wait for emoji being loaded (required for rendering)
        await nextTick(); // wait for following rendering
        assert.containsOnce(target, ".o-mail-message");
        assert.verifySteps([
            "/mail/init_messaging",
            "/mail/channel/messages",
            "/mail/message/post",
        ]);
    });

    QUnit.test("can create a new channel", async (assert) => {
        const server = new TestServer();
        const env = makeTestEnv((route, params) => {
            if (
                route.startsWith("/mail") ||
                [
                    "/web/dataset/call_kw/mail.channel/search_read",
                    "/web/dataset/call_kw/mail.channel/channel_create",
                ].includes(route)
            ) {
                assert.step(route);
            }
            return server.rpc(route, params);
        });
        await mount(Discuss, target, { env });
        assert.containsNone(target, ".o-mail-category-item");
        await click(target, ".o-mail-discuss-sidebar i[title='Add or join a channel']");
        await editInput(target, ".o-autocomplete--input", "abc");
        await click(target, ".o-mail-discuss-sidebar .o-autocomplete--dropdown-item");
        assert.containsN(target, ".o-mail-category-item", 1);
        assert.containsN(target, ".o-mail-discuss-content .o-mail-message", 0);
        assert.verifySteps([
            "/mail/init_messaging",
            "/mail/inbox/messages",
            "/web/dataset/call_kw/mail.channel/search_read",
            "/web/dataset/call_kw/mail.channel/channel_create",
            "/mail/channel/messages",
        ]);
    });

    QUnit.test("can join a chat conversation", async (assert) => {
        const server = new TestServer();
        server.addPartner(43, "abc");
        const env = makeTestEnv((route, params) => {
            if (
                route.startsWith("/mail") ||
                [
                    "/web/dataset/call_kw/res.partner/im_search",
                    "/web/dataset/call_kw/mail.channel/channel_get",
                ].includes(route)
            ) {
                assert.step(route);
            }
            if (route === "/web/dataset/call_kw/mail.channel/channel_get") {
                assert.equal(params.kwargs.partners_to[0], 43);
            }
            return server.rpc(route, params);
        });

        await mount(Discuss, target, { env });
        assert.containsNone(target, ".o-mail-category-item");
        await click(target, ".o-mail-discuss-sidebar i[title='Start a conversation']");
        await editInput(target, ".o-autocomplete--input", "abc");
        await click(target, ".o-mail-discuss-sidebar .o-autocomplete--dropdown-item");
        assert.containsN(target, ".o-mail-category-item", 1);
        assert.containsNone(target, ".o-mail-discuss-content .o-mail-message");
        assert.verifySteps([
            "/mail/init_messaging",
            "/mail/inbox/messages",
            "/web/dataset/call_kw/res.partner/im_search",
            "/web/dataset/call_kw/mail.channel/channel_get",
            "/mail/channel/messages",
        ]);
    });

    QUnit.test("focus is set on composer when switching channel", async (assert) => {
        const server = new TestServer();
        server.addChannel(1, "general", "General announcements...");
        server.addChannel(2, "other", "info");
        const env = makeTestEnv((route, params) => server.rpc(route, params));

        await mount(Discuss, target, { env });
        assert.containsNone(target, ".o-mail-composer-textarea");
        assert.containsN(target, ".o-mail-category-item", 2);

        // switch to first channel and check focus is correct
        await click(target.querySelectorAll(".o-mail-category-item")[0]);
        assert.containsOnce(target, ".o-mail-composer-textarea");
        assert.strictEqual(
            document.activeElement,
            target.querySelector(".o-mail-composer-textarea")
        );

        // unfocus composer, then switch on second channel and see if focus is correct
        target.querySelector(".o-mail-composer-textarea").blur();
        assert.strictEqual(document.activeElement, document.body);
        await click(target.querySelectorAll(".o-mail-category-item")[1]);
        assert.containsOnce(target, ".o-mail-composer-textarea");
        assert.strictEqual(
            document.activeElement,
            target.querySelector(".o-mail-composer-textarea")
        );
    });

    QUnit.test("Message following a notification should not be squashed", async (assert) => {
        const server = new TestServer();
        server.addChannel(1, "general", "General announcements...");
        server.addMessage(
            "notification",
            1,
            1,
            "mail.channel",
            3,
            '<div class="o_mail_notification">created <a href="#" class="o_channel_redirect">#general</a></div>'
        );
        server.addMessage("comment", 2, 1, "mail.channel", 3, "Hello world !");
        const env = makeTestEnv((route, params) => server.rpc(route, params));
        await env.services["mail.messaging"].isReady;
        env.services["mail.messaging"].setDiscussThread(1);
        await mount(Discuss, target, { env });

        assert.containsOnce(target, ".o-mail-message-sidebar .o-mail-avatar-container");
    });

    QUnit.test("Posting message should transform links.", async (assert) => {
        const server = new TestServer();
        server.addChannel(1, "general", "General announcements...");
        const env = makeTestEnv((route, params) => server.rpc(route, params));
        env.services["mail.messaging"].setDiscussThread(1);
        await mount(Discuss, target, { env });
        await insertText(".o-mail-composer-textarea", "test https://www.odoo.com/");
        await click(target, ".o-mail-composer-send-button");
        await loadEmoji(); // wait for emoji being loaded (required for rendering)
        await nextTick(); // wait for following rendering
        assert.containsOnce(
            target,
            "a[href='https://www.odoo.com/']",
            "Message should have a link"
        );
    });

    QUnit.test("Posting message should transform relevant data to emoji.", async (assert) => {
        const server = new TestServer();
        server.addChannel(1, "general", "General announcements...");
        const env = makeTestEnv((route, params) => server.rpc(route, params));
        env.services["mail.messaging"].setDiscussThread(1);
        await mount(Discuss, target, { env });
        await insertText(".o-mail-composer-textarea", "test :P :laughing:");
        await click(target, ".o-mail-composer-send-button");
        await loadEmoji(); // wait for emoji being loaded (required for rendering)
        await nextTick(); // wait for following rendering
        assert.equal(target.querySelector(".o-mail-message-body").textContent, "test 😛 😆");
    });

    QUnit.test(
        "posting a message immediately after another one is displayed in 'simple' mode (squashed)",
        async (assert) => {
            let flag = false;
            const server = new TestServer();
            server.addChannel(1, "general", "General announcements...");
            const env = makeTestEnv(async (route, params) => {
                if (flag && route === "/mail/message/post") {
                    await new Promise(() => {});
                }
                return server.rpc(route, params);
            });
            env.services["mail.messaging"].setDiscussThread(1);

            await mount(Discuss, target, { env });
            // write 1 message
            await editInput(target, ".o-mail-composer-textarea", "abc");
            await click(target, ".o-mail-composer button[data-action='send']");

            // write another message, but /mail/message/post is delayed by promise
            flag = true;
            await editInput(target, ".o-mail-composer-textarea", "def");
            await click(target, ".o-mail-composer button[data-action='send']");
            assert.containsN(target, ".o-mail-message", 2);
            assert.containsN(target, ".o-mail-msg-header", 1); // just 1, because 2nd message is squashed
        }
    );
});
