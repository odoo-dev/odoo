/** @odoo-module **/

import { Chatter } from "@mail/new/views/chatter";
import { patchUiSize, SIZES } from "@mail/../tests/helpers/patch_ui_size";
import { start, waitFormViewLoaded } from "@mail/../tests/helpers/test_utils";

import { click, editInput, nextTick, getFixture, mount } from "@web/../tests/helpers/utils";
import { makeTestEnv, TestServer } from "../helpers/helpers";
import { Component, useState, xml } from "@odoo/owl";

let target;

class ChatterParent extends Component {
    setup() {
        this.state = useState({ resId: this.props.resId });
    }
}

Object.assign(ChatterParent, {
    components: { Chatter },
    template: xml`<Chatter resId="state.resId" resModel="props.resModel" displayName="props.displayName" hasActivity="true"/>`,
});

QUnit.module("mail", (hooks) => {
    hooks.beforeEach(async () => {
        target = getFixture();
    });

    QUnit.module("chatter");

    QUnit.test("simple chatter on a record", async (assert) => {
        const server = new TestServer();
        const env = makeTestEnv((route, params) => {
            if (route.startsWith("/mail")) {
                assert.step(route);
            }
            return server.rpc(route, params);
        });
        await mount(Chatter, target, {
            env,
            props: { resId: 43, resModel: "somemodel", displayName: "", hasActivity: true },
        });

        assert.containsOnce(target, ".o-mail-chatter-topbar");
        assert.containsOnce(target, ".o-mail-thread");
        assert.verifySteps(["/mail/init_messaging", "/mail/thread/data", "/mail/thread/messages"]);
    });

    QUnit.test("simple chatter, with no record", async (assert) => {
        const server = new TestServer();
        const env = makeTestEnv((route, params) => {
            if (route.startsWith("/mail")) {
                assert.step(route);
            }
            return server.rpc(route, params);
        });
        await mount(Chatter, target, {
            env,
            props: { resId: false, resModel: "somemodel", displayName: "", hasActivity: true },
        });

        assert.containsOnce(target, ".o-mail-chatter-topbar");
        assert.containsOnce(target, ".o-mail-thread");
        assert.containsOnce(target, ".o-mail-message");
        assert.containsOnce(target, ".o-chatter-disabled");
        assert.containsN(target, "button:disabled", 5);
        assert.verifySteps(["/mail/init_messaging"]);
    });

    QUnit.test("composer is closed when creating record", async (assert) => {
        const server = new TestServer();
        const env = makeTestEnv((route, params) => server.rpc(route, params));
        const props = { resId: 43, resModel: "somemodel", displayName: "" };
        const parent = await mount(ChatterParent, target, { env, props });
        assert.containsNone(target, ".o-mail-composer");

        await click($(target).find("button:contains(Send message)")[0]);
        assert.containsOnce(target, ".o-mail-composer");

        parent.state.resId = false;
        await nextTick();
        assert.containsNone(target, ".o-mail-composer");
    });

    QUnit.test("composer has proper placeholder when sending message", async (assert) => {
        const server = new TestServer();
        const env = makeTestEnv((route, params) => server.rpc(route, params));
        await mount(Chatter, target, {
            env,
            props: { resId: 43, resModel: "somemodel", displayName: "", hasActivity: true },
        });
        assert.containsNone(target, ".o-mail-composer");

        await click($(target).find("button:contains(Send message)")[0]);
        assert.containsOnce(target, ".o-mail-composer");
        assert.strictEqual(
            target.querySelector("textarea").getAttribute("placeholder"),
            "Send a message to followers..."
        );
    });

    QUnit.test("composer has proper placeholder when logging note", async (assert) => {
        const server = new TestServer();
        const env = makeTestEnv((route, params) => server.rpc(route, params));
        await mount(Chatter, target, {
            env,
            props: { resId: 43, resModel: "somemodel", displayName: "", hasActivity: true },
        });
        assert.containsNone(target, ".o-mail-composer");

        await click($(target).find("button:contains(Log note)")[0]);
        assert.containsOnce(target, ".o-mail-composer");
        assert.strictEqual(
            target.querySelector("textarea").getAttribute("placeholder"),
            "Log an internal note..."
        );
    });

    QUnit.test("send/log buttons are properly styled", async (assert) => {
        const server = new TestServer();
        const env = makeTestEnv((route, params) => server.rpc(route, params));
        await mount(Chatter, target, {
            env,
            props: { resId: 43, resModel: "somemodel", displayName: "", hasActivity: true },
        });
        assert.containsNone(target, ".o-mail-composer");

        const sendMsgBtn = $(target).find("button:contains(Send message)")[0];
        const sendNoteBtn = $(target).find("button:contains(Log note)")[0];
        assert.ok(sendMsgBtn.classList.contains("btn-odoo"));
        assert.notOk(sendNoteBtn.classList.contains("btn-odoo"));

        await click(sendNoteBtn);
        assert.notOk(sendMsgBtn.classList.contains("btn-odoo"));
        assert.ok(sendNoteBtn.classList.contains("btn-odoo"));

        await click(sendMsgBtn);
        assert.ok(sendMsgBtn.classList.contains("btn-odoo"));
        assert.notOk(sendNoteBtn.classList.contains("btn-odoo"));
    });

    QUnit.test("composer is focused", async (assert) => {
        const server = new TestServer();
        const env = makeTestEnv((route, params) => server.rpc(route, params));
        await mount(Chatter, target, {
            env,
            props: { resId: 43, resModel: "somemodel", displayName: "", hasActivity: true },
        });
        assert.containsNone(target, ".o-mail-composer");

        const sendMsgBtn = $(target).find("button:contains(Send message)")[0];
        const sendNoteBtn = $(target).find("button:contains(Log note)")[0];

        await click(sendMsgBtn);
        const composer = target.querySelector(".o-mail-composer textarea");
        assert.strictEqual(document.activeElement, composer);

        // unfocus composer
        composer.blur();
        assert.notEqual(document.activeElement, composer);
        await click(sendNoteBtn);
        assert.strictEqual(document.activeElement, composer);

        // unfocus composer
        composer.blur();
        assert.notEqual(document.activeElement, composer);
        await click(sendMsgBtn);
        assert.strictEqual(document.activeElement, composer);
    });

    QUnit.test("displayname is used when sending a message", async (assert) => {
        const server = new TestServer();
        const env = makeTestEnv((route, params) => server.rpc(route, params));
        await mount(Chatter, target, {
            env,
            props: { resId: 43, resModel: "somemodel", displayName: "Gnargl", hasActivity: true },
        });
        await click($(target).find("button:contains(Send message)")[0]);
        const msg = $(target).find("small:contains(Gnargl)")[0];
        assert.ok(msg);
    });

    QUnit.test("can post a message on a record thread", async (assert) => {
        assert.expect(11);
        const server = new TestServer();
        const env = makeTestEnv((route, params) => {
            if (route.startsWith("/mail")) {
                assert.step(route);
            }
            if (route === "/mail/message/post") {
                const expected = {
                    post_data: {
                        body: "hey",
                        attachment_ids: [],
                        message_type: "comment",
                        partner_ids: [],
                        subtype_xmlid: "mail.mt_comment",
                    },
                    thread_id: 43,
                    thread_model: "somemodel",
                };
                assert.deepEqual(params, expected);
            }
            return server.rpc(route, params);
        });
        await mount(Chatter, target, {
            env,
            props: { resId: 43, resModel: "somemodel", displayName: "", hasActivity: true },
        });

        assert.containsNone(target, ".o-mail-composer");
        await click($(target).find("button:contains(Send message)")[0]);
        assert.containsOnce(target, ".o-mail-composer");

        await editInput(target, "textarea", "hey");

        assert.containsNone(target, ".o-mail-message");
        await click($(target).find(".o-mail-composer button:contains(Send)")[0]);
        assert.containsOnce(target, ".o-mail-message");

        assert.verifySteps([
            "/mail/init_messaging",
            "/mail/thread/data",
            "/mail/thread/messages",
            "/mail/message/post",
            "/mail/link_preview",
        ]);
    });

    QUnit.test("can post a note on a record thread", async (assert) => {
        assert.expect(11);
        const server = new TestServer();
        const env = makeTestEnv((route, params) => {
            if (route.startsWith("/mail")) {
                assert.step(route);
            }
            if (route === "/mail/message/post") {
                const expected = {
                    post_data: {
                        attachment_ids: [],
                        body: "hey",
                        message_type: "comment",
                        partner_ids: [],
                        subtype_xmlid: "mail.mt_note",
                    },
                    thread_id: 43,
                    thread_model: "somemodel",
                };
                assert.deepEqual(params, expected);
            }
            return server.rpc(route, params);
        });
        await mount(Chatter, target, {
            env,
            props: { resId: 43, resModel: "somemodel", displayName: "", hasActivity: true },
        });

        assert.containsNone(target, ".o-mail-composer");
        await click($(target).find("button:contains(Log note)")[0]);
        assert.containsOnce(target, ".o-mail-composer");

        await editInput(target, "textarea", "hey");

        assert.containsNone(target, ".o-mail-message");
        await click($(target).find(".o-mail-composer button:contains(Send)")[0]);
        assert.containsOnce(target, ".o-mail-message");

        assert.verifySteps([
            "/mail/init_messaging",
            "/mail/thread/data",
            "/mail/thread/messages",
            "/mail/message/post",
            "/mail/link_preview",
        ]);
    });

    QUnit.test("No attachment loading spinner when creating records", async (assert) => {
        assert.expect(2);

        const { openFormView } = await start();
        await openFormView({
            res_model: "res.partner",
        });
        assert.containsNone(
            target,
            ".o-mail-chatter-topbar-add-attachments .fa-spin",
            "Should not contain attachment spinner"
        );
        assert.containsOnce(
            target,
            ".o-mail-chatter-topbar-add-attachments:contains(0)",
            "Should show attachment count of 0"
        );
    });

    QUnit.test(
        "No attachment loading spinner when switching from loading record to creation of record",
        async (assert) => {
            assert.expect(2);

            const { click, openFormView, pyEnv } = await start({
                async mockRPC(route) {
                    if (route === "/mail/thread/data") {
                        await new Promise(() => {});
                    }
                },
            });
            const partnerId = pyEnv["res.partner"].create({ name: "John" });
            await openFormView(
                {
                    res_model: "res.partner",
                    res_id: partnerId,
                },
                { waitUntilDataLoaded: false }
            );
            assert.containsOnce(
                target,
                ".o-mail-chatter-topbar-add-attachments .fa-spin",
                "Should contain attachment loading spinner"
            );
            await click(".o_form_button_create");
            assert.containsNone(
                target,
                ".o-mail-chatter-topbar-add-attachments .fa-spin",
                "Should not contain attachment spinner"
            );
        }
    );

    QUnit.test(
        "Composer toggle state is kept when switching from aside to bottom",
        async function (assert) {
            patchUiSize({ size: SIZES.XXL });
            const { click, openFormView, pyEnv } = await start();
            const partnerId = pyEnv["res.partner"].create({ name: "John Doe" });
            await openFormView({
                res_model: "res.partner",
                res_id: partnerId,
            });
            await click(".o-mail-chatter-topbar-send-message-button");
            patchUiSize({ size: SIZES.LG });
            await waitFormViewLoaded(() => window.dispatchEvent(new Event("resize")), {
                resId: partnerId,
                resModel: "res.partner",
            });
            assert.containsOnce(target, ".o-mail-composer-textarea");
        }
    );

    QUnit.test(
        "Textarea content is kept when switching from aside to bottom",
        async function (assert) {
            patchUiSize({ size: SIZES.XXL });
            const { click, openFormView, pyEnv } = await start();
            const partnerId = pyEnv["res.partner"].create({ name: "John Doe" });
            await openFormView({
                res_model: "res.partner",
                res_id: partnerId,
            });
            await click(".o-mail-chatter-topbar-send-message-button");
            await editInput(target, ".o-mail-composer-textarea", "Hello world !");
            patchUiSize({ size: SIZES.LG });
            await waitFormViewLoaded(() => window.dispatchEvent(new Event("resize")), {
                resId: partnerId,
                resModel: "res.partner",
            });
            assert.strictEqual(
                target.querySelector(".o-mail-composer-textarea").value,
                "Hello world !"
            );
        }
    );

    QUnit.test(
        "Composer type is kept when switching from aside to bottom",
        async function (assert) {
            patchUiSize({ size: SIZES.XXL });
            const { click, openFormView, pyEnv } = await start();
            const partnerId = pyEnv["res.partner"].create({ name: "John Doe" });
            await openFormView({
                res_model: "res.partner",
                res_id: partnerId,
            });
            await click(".o-mail-chatter-topbar-log-note-button");
            patchUiSize({ size: SIZES.LG });
            await waitFormViewLoaded(() => window.dispatchEvent(new Event("resize")), {
                resId: partnerId,
                resModel: "res.partner",
            });
            assert.ok(
                target
                    .querySelector(".o-mail-chatter-topbar-log-note-button")
                    .classList.contains("btn-odoo"),
                "Active button should be the log note button"
            );
            assert.ok(
                !target
                    .querySelector(".o-mail-chatter-topbar-send-message-button")
                    .classList.contains("btn-odoo"),
                "Send message button should not be active"
            );
        }
    );
});
