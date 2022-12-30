/** @odoo-module **/

import { Chatter } from "@mail/new/views/chatter";
import { patchUiSize, SIZES } from "@mail/../tests/helpers/patch_ui_size";
import {
    afterNextRender,
    click,
    dragenterFiles,
    dropFiles,
    insertText,
    isScrolledTo,
    start,
    startServer,
    waitFormViewLoaded,
} from "@mail/../tests/helpers/test_utils";

import {
    click as webClick,
    editInput,
    getFixture,
    mount,
    triggerHotkey,
} from "@web/../tests/helpers/utils";
import { makeTestEnv, TestServer } from "../helpers/helpers";
import { file } from "web.test_utils";

const { createFile } = file;

let target;

QUnit.module("chatter", {
    async beforeEach() {
        target = getFixture();
    },
});

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
    assert.verifySteps([
        "/mail/init_messaging",
        "/mail/thread/data",
        "/mail/load_message_failures",
        "/mail/thread/messages",
    ]);
});

QUnit.test("displayname is used when sending a message", async (assert) => {
    const server = new TestServer();
    const env = makeTestEnv((route, params) => server.rpc(route, params));
    await mount(Chatter, target, {
        env,
        props: { resId: 43, resModel: "somemodel", displayName: "Gnargl", hasActivity: true },
    });
    await webClick($(target).find("button:contains(Send message)")[0]);
    const msg = $(target).find("small:contains(Gnargl)")[0];
    assert.ok(msg);
});

QUnit.test("can post a message on a record thread", async (assert) => {
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
    await webClick($(target).find("button:contains(Send message)")[0]);
    assert.containsOnce(target, ".o-mail-composer");

    await editInput(target, "textarea", "hey");

    assert.containsNone(target, ".o-mail-message");
    await webClick($(target).find(".o-mail-composer button:contains(Send)")[0]);
    assert.containsOnce(target, ".o-mail-message");

    assert.verifySteps([
        "/mail/init_messaging",
        "/mail/thread/data",
        "/mail/load_message_failures",
        "/mail/thread/messages",
        "/mail/message/post",
        "/mail/link_preview",
    ]);
});

QUnit.test("can post a note on a record thread", async (assert) => {
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
    await webClick($(target).find("button:contains(Log note)")[0]);
    assert.containsOnce(target, ".o-mail-composer");

    await editInput(target, "textarea", "hey");

    assert.containsNone(target, ".o-mail-message");
    await webClick($(target).find(".o-mail-composer button:contains(Send)")[0]);
    assert.containsOnce(target, ".o-mail-message");

    assert.verifySteps([
        "/mail/init_messaging",
        "/mail/thread/data",
        "/mail/load_message_failures",
        "/mail/thread/messages",
        "/mail/message/post",
        "/mail/link_preview",
    ]);
});

QUnit.test("No attachment loading spinner when creating records", async (assert) => {
    const { openFormView } = await start();
    await openFormView({
        res_model: "res.partner",
    });
    assert.containsNone(target, ".o-mail-chatter-topbar-add-attachments .fa-spin");
    assert.containsOnce(
        target,
        ".o-mail-chatter-topbar-add-attachments:contains(0)",
        "Should show attachment count of 0"
    );
});

QUnit.test(
    "No attachment loading spinner when switching from loading record to creation of record",
    async (assert) => {
        const { openFormView, pyEnv } = await start({
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
        assert.containsOnce(target, ".o-mail-chatter-topbar-add-attachments .fa-spin");
        await click(".o_form_button_create");
        assert.containsNone(target, ".o-mail-chatter-topbar-add-attachments .fa-spin");
    }
);

QUnit.test(
    "Composer toggle state is kept when switching from aside to bottom",
    async function (assert) {
        patchUiSize({ size: SIZES.XXL });
        const { openFormView, pyEnv } = await start();
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

QUnit.test("Textarea content is kept when switching from aside to bottom", async function (assert) {
    patchUiSize({ size: SIZES.XXL });
    const { openFormView, pyEnv } = await start();
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
    assert.strictEqual(target.querySelector(".o-mail-composer-textarea").value, "Hello world !");
});

QUnit.test("Composer type is kept when switching from aside to bottom", async function (assert) {
    patchUiSize({ size: SIZES.XXL });
    const { openFormView, pyEnv } = await start();
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
    assert.hasClass(
        target.querySelector(".o-mail-chatter-topbar-log-note-button"),
        "btn-odoo",
        "Active button should be the log note button"
    );
    assert.doesNotHaveClass(
        target.querySelector(".o-mail-chatter-topbar-send-message-button"),
        "btn-odoo"
    );
});

QUnit.test("chatter: drop attachments", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    const { openView } = await start();
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    let files = [
        await createFile({
            content: "hello, world",
            contentType: "text/plain",
            name: "text.txt",
        }),
        await createFile({
            content: "hello, worlduh",
            contentType: "text/plain",
            name: "text2.txt",
        }),
    ];
    await afterNextRender(() => dragenterFiles(document.querySelector(".o-mail-chatter")));
    assert.containsOnce(target, ".o-dropzone");
    assert.containsNone(
        target,
        ".o-mail-attachment-image",
        "should have no attachment before files are dropped"
    );

    await afterNextRender(() => dropFiles(document.querySelector(".o-dropzone"), files));
    assert.containsN(target, ".o-mail-attachment-image", 2);

    await afterNextRender(() => dragenterFiles(document.querySelector(".o-mail-chatter")));
    files = [
        await createFile({
            content: "hello, world",
            contentType: "text/plain",
            name: "text3.txt",
        }),
    ];
    await afterNextRender(() => dropFiles(document.querySelector(".o-dropzone"), files));
    assert.containsN(target, ".o-mail-attachment-image", 3);
});

QUnit.test(
    "should display subject when subject is not the same as the thread name",
    async function (assert) {
        const pyEnv = await startServer();
        const resPartnerId1 = pyEnv["res.partner"].create({});
        pyEnv["mail.message"].create({
            body: "not empty",
            model: "res.partner",
            res_id: resPartnerId1,
            subject: "Salutations, voyageur",
        });
        const { openView } = await start();
        await openView({
            res_id: resPartnerId1,
            res_model: "res.partner",
            views: [[false, "form"]],
        });
        assert.containsOnce(target, ".o-mail-message-subject");
        assert.strictEqual(
            target.querySelector(".o-mail-message-subject").textContent,
            "Subject: Salutations, voyageur"
        );
    }
);

QUnit.test("should not display user notification messages in chatter", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    pyEnv["mail.message"].create({
        message_type: "user_notification",
        model: "res.partner",
        res_id: resPartnerId1,
    });
    const { openView } = await start();
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsNone(target, ".o-mail-message");
});

QUnit.test('post message with "CTRL-Enter" keyboard shortcut in chatter', async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    const { openView } = await start();
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsNone(target, ".o-mail-message");

    await click(".o-mail-chatter-topbar-send-message-button");
    await insertText(".o-mail-composer-textarea", "Test");
    await afterNextRender(() => triggerHotkey("control+Enter"));
    assert.containsOnce(target, ".o-mail-message");
});

QUnit.test("base rendering when chatter has no attachment", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    for (let i = 0; i < 60; i++) {
        pyEnv["mail.message"].create({
            body: "not empty",
            model: "res.partner",
            res_id: resPartnerId1,
        });
    }
    const { openView } = await start();
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-chatter");
    assert.containsOnce(target, ".o-mail-chatter-topbar");
    assert.containsNone(target, ".o-mail-attachment-box");
    assert.containsOnce(target, ".o-mail-chatter .o-mail-thread");
    assert.containsOnce(
        target,
        `.o-mail-chatter .o-mail-thread[data-thread-id="${resPartnerId1}"][data-thread-model="res.partner"]`
    );
    assert.containsN(target, ".o-mail-message", 30);
});

QUnit.test("base rendering when chatter has no record", async function (assert) {
    const { openView } = await start();
    await openView({
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-chatter");
    assert.containsOnce(target, ".o-mail-chatter-topbar");
    assert.containsNone(target, ".o-mail-attachment-box");
    assert.containsOnce(target, ".o-mail-chatter .o-mail-thread");
    assert.containsOnce(target, ".o-mail-message");
    assert.strictEqual($(target).find(".o-mail-message-body").text(), "Creating a new record...");
    assert.containsNone(target, "button:contains(Load More)");
    assert.containsOnce(target, ".o-mail-message-actions");
    assert.containsNone(target, ".o-mail-message-actions i");
});

QUnit.test("base rendering when chatter has attachments", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    pyEnv["ir.attachment"].create([
        {
            mimetype: "text/plain",
            name: "Blah.txt",
            res_id: resPartnerId1,
            res_model: "res.partner",
        },
        {
            mimetype: "text/plain",
            name: "Blu.txt",
            res_id: resPartnerId1,
            res_model: "res.partner",
        },
    ]);
    const { openView } = await start();
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-chatter");
    assert.containsOnce(target, ".o-mail-chatter-topbar");
    assert.containsNone(target, ".o-mail-attachment-box");
});

QUnit.test("show attachment box", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    pyEnv["ir.attachment"].create([
        {
            mimetype: "text/plain",
            name: "Blah.txt",
            res_id: resPartnerId1,
            res_model: "res.partner",
        },
        {
            mimetype: "text/plain",
            name: "Blu.txt",
            res_id: resPartnerId1,
            res_model: "res.partner",
        },
    ]);
    const { openView } = await start();
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-chatter");
    assert.containsOnce(target, ".o-mail-chatter-topbar");
    assert.containsOnce(target, ".o-mail-chatter-topbar-add-attachments");
    assert.containsOnce(target, ".o-mail-chatter-topbar-add-attachments:contains(2)");
    assert.containsNone(target, ".o-mail-attachment-box");

    await click(".o-mail-chatter-topbar-add-attachments");
    assert.containsOnce(target, ".o-mail-attachment-box");
});

QUnit.test("composer show/hide on log note/send message [REQUIRE FOCUS]", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    const { openView } = await start();
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-chatter-topbar-send-message-button");
    assert.containsOnce(target, ".o-mail-chatter-topbar-log-note-button");
    assert.containsNone(target, ".o-mail-chatter .o-mail-composer");

    await click(".o-mail-chatter-topbar-send-message-button");
    assert.containsOnce(target, ".o-mail-chatter .o-mail-composer");
    assert.strictEqual(
        document.activeElement,
        target.querySelector(".o-mail-chatter .o-mail-composer-textarea")
    );

    await click(".o-mail-chatter-topbar-log-note-button");
    assert.containsOnce(target, ".o-mail-chatter .o-mail-composer");
    assert.strictEqual(
        document.activeElement,
        target.querySelector(".o-mail-chatter .o-mail-composer-textarea")
    );

    await click(".o-mail-chatter-topbar-log-note-button");
    assert.containsNone(target, ".o-mail-chatter .o-mail-composer");

    await click(".o-mail-chatter-topbar-send-message-button");
    assert.containsOnce(target, ".o-mail-chatter .o-mail-composer");

    await click(".o-mail-chatter-topbar-send-message-button");
    assert.containsNone(target, ".o-mail-chatter .o-mail-composer");
});

QUnit.test('do not post message with "Enter" keyboard shortcut', async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    const { openView } = await start();
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsNone(target, ".o-mail-message");

    await click(".o-mail-chatter-topbar-send-message-button");
    await insertText(".o-mail-composer-textarea", "Test");
    await triggerHotkey("Enter");
    assert.containsNone(target, ".o-mail-message");
});

QUnit.test(
    "should not display subject when subject is the same as the thread name",
    async function (assert) {
        const pyEnv = await startServer();
        const resPartnerId1 = pyEnv["res.partner"].create({
            name: "Salutations, voyageur",
        });
        pyEnv["mail.message"].create({
            body: "not empty",
            model: "res.partner",
            res_id: resPartnerId1,
            subject: "Salutations, voyageur",
        });
        const { openView } = await start();
        await openView({
            res_id: resPartnerId1,
            res_model: "res.partner",
            views: [[false, "form"]],
        });

        assert.containsNone(target, ".o-mail-message-subject");
    }
);

QUnit.test(
    "scroll position is kept when navigating from one record to another",
    async function (assert) {
        patchUiSize({ size: SIZES.XXL });
        const pyEnv = await startServer();
        const partnerId_1 = pyEnv["res.partner"].create({ name: "Harry Potter" });
        const partnerId_2 = pyEnv["res.partner"].create({ name: "Ron Weasley" });
        // Fill both channels with random messages in order for the scrollbar to
        // appear.
        pyEnv["mail.message"].create(
            Array(40)
                .fill(0)
                .map((_, index) => ({
                    body: "Non Empty Body ".repeat(25),
                    model: "res.partner",
                    res_id: index & 1 ? partnerId_1 : partnerId_2,
                }))
        );
        const { openFormView } = await start();
        await openFormView({
            res_model: "res.partner",
            res_id: partnerId_1,
        });
        const scrolltop_1 = target.querySelector(".o-mail-chatter-scrollable").scrollHeight / 2;
        target.querySelector(".o-mail-chatter-scrollable").scrollTo({ top: scrolltop_1 });
        await openFormView({
            res_model: "res.partner",
            res_id: partnerId_2,
        });
        const scrolltop_2 = target.querySelector(".o-mail-chatter-scrollable").scrollHeight / 3;
        target.querySelector(".o-mail-chatter-scrollable").scrollTo({ top: scrolltop_2 });
        await openFormView({
            res_model: "res.partner",
            res_id: partnerId_1,
        });
        assert.ok(isScrolledTo(target.querySelector(".o-mail-chatter-scrollable"), scrolltop_1));

        await openFormView({
            res_model: "res.partner",
            res_id: partnerId_2,
        });
        assert.ok(isScrolledTo(target.querySelector(".o-mail-chatter-scrollable"), scrolltop_2));
    }
);
