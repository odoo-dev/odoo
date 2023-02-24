/** @odoo-module **/

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

import { editInput, getFixture, triggerHotkey } from "@web/../tests/helpers/utils";
import { file } from "web.test_utils";

const { createFile } = file;

let target;

QUnit.module("chatter", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test("simple chatter on a record", async (assert) => {
    const { openFormView, pyEnv } = await start({
        mockRPC(route, args) {
            if (route.startsWith("/mail")) {
                assert.step(route);
            }
        },
    });
    const partnerId = pyEnv["res.partner"].create({ name: "John Doe" });
    await openFormView("res.partner", partnerId);
    assert.containsOnce(target, ".o-mail-chatter-topbar");
    assert.containsOnce(target, ".o-mail-thread");
    assert.verifySteps([
        "/mail/init_messaging",
        "/mail/load_message_failures",
        "/mail/thread/data",
        "/mail/thread/messages",
    ]);
});

QUnit.test("displayname is used when sending a message", async (assert) => {
    const { openFormView, pyEnv } = await start();
    const partnerId = pyEnv["res.partner"].create({ name: "John Doe" });
    await openFormView("res.partner", partnerId);
    await click("button:contains(Send message)");
    assert.containsOnce(target, '.o-mail-chatter:contains(To followers of:  "John Doe")');
});

QUnit.test("can post a message on a record thread", async (assert) => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ name: "John Doe" });
    const { openFormView } = await start({
        mockRPC(route, args) {
            if (route === "/mail/message/post") {
                assert.step(route);
                const expected = {
                    post_data: {
                        body: "hey",
                        attachment_ids: [],
                        message_type: "comment",
                        partner_ids: [],
                        subtype_xmlid: "mail.mt_comment",
                    },
                    thread_id: partnerId,
                    thread_model: "res.partner",
                };
                assert.deepEqual(args, expected);
            }
        },
    });
    await openFormView("res.partner", partnerId);
    assert.containsNone(target, ".o-mail-composer");

    await click("button:contains(Send message)");
    assert.containsOnce(target, ".o-mail-composer");

    await editInput(target, "textarea", "hey");
    assert.containsNone(target, ".o-mail-message");

    await click(".o-mail-composer button:contains(Send)");
    assert.containsOnce(target, ".o-mail-message");
    assert.verifySteps(["/mail/message/post"]);
});

QUnit.test("can post a note on a record thread", async (assert) => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ name: "John Doe" });
    const { openFormView } = await start({
        mockRPC(route, args) {
            if (route === "/mail/message/post") {
                assert.step(route);
                const expected = {
                    post_data: {
                        attachment_ids: [],
                        body: "hey",
                        message_type: "comment",
                        partner_ids: [],
                        subtype_xmlid: "mail.mt_note",
                    },
                    thread_id: partnerId,
                    thread_model: "res.partner",
                };
                assert.deepEqual(args, expected);
            }
        },
    });
    await openFormView("res.partner", partnerId);
    assert.containsNone(target, ".o-mail-composer");

    await click("button:contains(Log note)");
    assert.containsOnce(target, ".o-mail-composer");

    await editInput(target, "textarea", "hey");
    assert.containsNone(target, ".o-mail-message");

    await click(".o-mail-composer button:contains(Send)");
    assert.containsOnce(target, ".o-mail-message");
    assert.verifySteps(["/mail/message/post"]);
});

QUnit.test("No attachment loading spinner when creating records", async (assert) => {
    const { openFormView } = await start();
    await openFormView("res.partner");
    assert.containsOnce(target, "button[aria-label='Attach files']");
    assert.containsNone(target, "button[aria-label='Attach files'] .fa-spin");
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
        await openFormView("res.partner", partnerId, { waitUntilDataLoaded: false });
        assert.containsOnce(target, "button[aria-label='Attach files'] .fa-spin");
        await click(".o_form_button_create");
        assert.containsNone(target, "button[aria-label='Attach files'] .fa-spin");
    }
);

QUnit.test(
    "Composer toggle state is kept when switching from aside to bottom",
    async function (assert) {
        patchUiSize({ size: SIZES.XXL });
        const { openFormView, pyEnv } = await start();
        const partnerId = pyEnv["res.partner"].create({ name: "John Doe" });
        await openFormView("res.partner", partnerId);
        await click("button:contains(Send message)");
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
    await openFormView("res.partner", partnerId);
    await click("button:contains(Send message)");
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
    await openFormView("res.partner", partnerId);
    await click("button:contains(Log note)");
    patchUiSize({ size: SIZES.LG });
    await waitFormViewLoaded(() => window.dispatchEvent(new Event("resize")), {
        resId: partnerId,
        resModel: "res.partner",
    });
    assert.hasClass(
        $(target).find("button:contains(Log note)"),
        "btn-odoo",
        "Active button should be the log note button"
    );
    assert.doesNotHaveClass($(target).find("button:contains(Send message)"), "btn-odoo");
});

QUnit.test("chatter: drop attachments", async function (assert) {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    const { openView } = await start();
    await openView({
        res_id: partnerId,
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
    assert.containsNone(target, ".o-mail-attachment-card");

    await afterNextRender(() => dropFiles(document.querySelector(".o-dropzone"), files));
    assert.containsN(target, ".o-mail-attachment-card", 2);

    await afterNextRender(() => dragenterFiles(document.querySelector(".o-mail-chatter")));
    files = [
        await createFile({
            content: "hello, world",
            contentType: "text/plain",
            name: "text3.txt",
        }),
    ];
    await afterNextRender(() => dropFiles(document.querySelector(".o-dropzone"), files));
    assert.containsN(target, ".o-mail-attachment-card", 3);
});

QUnit.test(
    "should display subject when subject isn't infered from the record",
    async function (assert) {
        const pyEnv = await startServer();
        const partnerId = pyEnv["res.partner"].create({});
        pyEnv["mail.message"].create({
            body: "not empty",
            model: "res.partner",
            res_id: partnerId,
            subject: "Salutations, voyageur",
        });
        const { openView } = await start();
        await openView({
            res_id: partnerId,
            res_model: "res.partner",
            views: [[false, "form"]],
        });
        assert.containsOnce(target, ".o-mail-message:contains(Subject: Salutations, voyageur)");
    }
);

QUnit.test("should not display user notification messages in chatter", async function (assert) {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    pyEnv["mail.message"].create({
        message_type: "user_notification",
        model: "res.partner",
        res_id: partnerId,
    });
    const { openView } = await start();
    await openView({
        res_id: partnerId,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsNone(target, ".o-mail-message");
});

QUnit.test('post message with "CTRL-Enter" keyboard shortcut in chatter', async function (assert) {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    const { openView } = await start();
    await openView({
        res_id: partnerId,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsNone(target, ".o-mail-message");

    await click("button:contains(Send message)");
    await insertText(".o-mail-composer-textarea", "Test");
    await afterNextRender(() => triggerHotkey("control+Enter"));
    assert.containsOnce(target, ".o-mail-message");
});

QUnit.test("base rendering when chatter has no attachment", async function (assert) {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    for (let i = 0; i < 60; i++) {
        pyEnv["mail.message"].create({
            body: "not empty",
            model: "res.partner",
            res_id: partnerId,
        });
    }
    const { openView } = await start();
    await openView({
        res_id: partnerId,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-chatter");
    assert.containsOnce(target, ".o-mail-chatter-topbar");
    assert.containsNone(target, ".o-mail-attachment-box");
    assert.containsOnce(target, ".o-mail-thread");
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
    const partnerId = pyEnv["res.partner"].create({});
    pyEnv["ir.attachment"].create([
        {
            mimetype: "text/plain",
            name: "Blah.txt",
            res_id: partnerId,
            res_model: "res.partner",
        },
        {
            mimetype: "text/plain",
            name: "Blu.txt",
            res_id: partnerId,
            res_model: "res.partner",
        },
    ]);
    const { openView } = await start();
    await openView({
        res_id: partnerId,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-chatter");
    assert.containsOnce(target, ".o-mail-chatter-topbar");
    assert.containsNone(target, ".o-mail-attachment-box");
});

QUnit.test("show attachment box", async function (assert) {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    pyEnv["ir.attachment"].create([
        {
            mimetype: "text/plain",
            name: "Blah.txt",
            res_id: partnerId,
            res_model: "res.partner",
        },
        {
            mimetype: "text/plain",
            name: "Blu.txt",
            res_id: partnerId,
            res_model: "res.partner",
        },
    ]);
    const { openView } = await start();
    await openView({
        res_id: partnerId,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-chatter");
    assert.containsOnce(target, ".o-mail-chatter-topbar");
    assert.containsOnce(target, "button[aria-label='Attach files']");
    assert.containsOnce(target, "button[aria-label='Attach files']:contains(2)");
    assert.containsNone(target, ".o-mail-attachment-box");

    await click("button[aria-label='Attach files']");
    assert.containsOnce(target, ".o-mail-attachment-box");
});

QUnit.test("composer show/hide on log note/send message [REQUIRE FOCUS]", async function (assert) {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    const { openView } = await start();
    await openView({
        res_id: partnerId,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, "button:contains(Send message)");
    assert.containsOnce(target, "button:contains(Log note)");
    assert.containsNone(target, ".o-mail-composer");

    await click("button:contains(Send message)");
    assert.containsOnce(target, ".o-mail-composer");
    assert.strictEqual(document.activeElement, target.querySelector(".o-mail-composer-textarea"));

    await click("button:contains(Log note)");
    assert.containsOnce(target, ".o-mail-composer");
    assert.strictEqual(document.activeElement, target.querySelector(".o-mail-composer-textarea"));

    await click("button:contains(Log note)");
    assert.containsNone(target, ".o-mail-composer");

    await click("button:contains(Send message)");
    assert.containsOnce(target, ".o-mail-composer");

    await click("button:contains(Send message)");
    assert.containsNone(target, ".o-mail-composer");
});

QUnit.test('do not post message with "Enter" keyboard shortcut', async function (assert) {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    const { openView } = await start();
    await openView({
        res_id: partnerId,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsNone(target, ".o-mail-message");

    await click("button:contains(Send message)");
    await insertText(".o-mail-composer-textarea", "Test");
    await triggerHotkey("Enter");
    assert.containsNone(target, ".o-mail-message");
});

QUnit.test(
    "should not display subject when subject is the same as the thread name",
    async function (assert) {
        const pyEnv = await startServer();
        const partnerId = pyEnv["res.partner"].create({
            name: "Salutations, voyageur",
        });
        pyEnv["mail.message"].create({
            body: "not empty",
            model: "res.partner",
            res_id: partnerId,
            subject: "Salutations, voyageur",
        });
        const { openView } = await start();
        await openView({
            res_id: partnerId,
            res_model: "res.partner",
            views: [[false, "form"]],
        });
        assert.containsNone(target, ".o-mail-message:contains(Salutations, voyageur)");
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
        await openFormView("res.partner", partnerId_1);
        const scrolltop_1 = target.querySelector(".o-mail-chatter-scrollable").scrollHeight / 2;
        target.querySelector(".o-mail-chatter-scrollable").scrollTo({ top: scrolltop_1 });
        await openFormView("res.partner", partnerId_2);
        const scrolltop_2 = target.querySelector(".o-mail-chatter-scrollable").scrollHeight / 3;
        target.querySelector(".o-mail-chatter-scrollable").scrollTo({ top: scrolltop_2 });
        await openFormView("res.partner", partnerId_1);
        assert.ok(isScrolledTo(target.querySelector(".o-mail-chatter-scrollable"), scrolltop_1));

        await openFormView("res.partner", partnerId_2);
        assert.ok(isScrolledTo(target.querySelector(".o-mail-chatter-scrollable"), scrolltop_2));
    }
);

QUnit.test("basic chatter rendering", async function (assert) {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ display_name: "second partner" });
    const views = {
        "res.partner,false,form": `
            <form string="Partners">
                <sheet>
                    <field name="name"/>
                </sheet>
                <div class="oe_chatter"></div>
            </form>`,
    };
    const { openView } = await start({ serverData: { views } });
    await openView({
        res_model: "res.partner",
        res_id: partnerId,
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-chatter");
});

QUnit.test("basic chatter rendering without activities", async function (assert) {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ display_name: "second partner" });
    const views = {
        "res.partner,false,form": `
            <form string="Partners">
                <sheet>
                    <field name="name"/>
                </sheet>
                <div class="oe_chatter">
                    <field name="message_follower_ids"/>
                    <field name="message_ids"/>
                </div>
            </form>`,
    };
    const { openView } = await start({ serverData: { views } });
    await openView({
        res_model: "res.partner",
        res_id: partnerId,
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-chatter");
    assert.containsOnce(target, ".o-mail-chatter-topbar");
    assert.containsOnce(target, "button[aria-label='Attach files']");
    assert.containsNone(target, "button:contains(Activities)");
    assert.containsOnce(target, ".o-mail-chatter-topbar-follower-list");
    assert.containsOnce(target, ".o-mail-thread");
});

QUnit.test(
    'chatter just contains "creating a new record" message during the creation of a new record after having displayed a chatter for an existing record',
    async function (assert) {
        const pyEnv = await startServer();
        const partnerId = pyEnv["res.partner"].create({});
        const views = {
            "res.partner,false,form": `
                <form string="Partners">
                    <sheet>
                        <field name="name"/>
                    </sheet>
                    <div class="oe_chatter">
                        <field name="message_ids"/>
                    </div>
                </form>`,
        };
        const { openView } = await start({ serverData: { views } });
        await openView({
            res_model: "res.partner",
            res_id: partnerId,
            views: [[false, "form"]],
        });
        await click(".o_form_button_create");
        assert.containsOnce(target, ".o-mail-message");
        assert.containsOnce(target, ".o-mail-message-body:contains(Creating a new record...)");
    }
);

QUnit.test(
    "should not display subject when subject is the same as the default subject",
    async function (assert) {
        const pyEnv = await startServer();
        const fakeId = pyEnv["res.fake"].create({ name: "Salutations, voyageur" });
        pyEnv["mail.message"].create({
            body: "not empty",
            model: "res.fake",
            res_id: fakeId,
            subject: "Custom Default Subject", // default subject for res.fake, set on the model
        });
        const { openFormView } = await start();
        await openFormView("res.fake", fakeId);
        assert.containsNone(target, ".o-mail-message:contains(Custom Default Subject)");
    }
);

QUnit.test(
    "should not display subject when subject is the same as the thread name with custom default subject",
    async function (assert) {
        const pyEnv = await startServer();
        const fakeId = pyEnv["res.fake"].create({ name: "Salutations, voyageur" });
        pyEnv["mail.message"].create({
            body: "not empty",
            model: "res.fake",
            res_id: fakeId,
            subject: "Salutations, voyageur",
        });
        const { openFormView } = await start();
        await openFormView("res.fake", fakeId);
        assert.containsNone(target, ".o-mail-message:contains(Custom Default Subject)");
    }
);

QUnit.test("basic chatter rendering without followers", async function (assert) {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ display_name: "second partner" });
    const views = {
        "res.partner,false,form": `<form string="Partners">
        <sheet>
            <field name="name"/>
        </sheet>
        <div class="oe_chatter">
            <field name="activity_ids"/>
            <field name="message_ids"/>
        </div>
    </form>`,
    };
    const { openView } = await start({ serverData: { views } });
    await openView({
        res_model: "res.partner",
        res_id: partnerId,
        views: [[false, "form"]],
    });
    assert.containsOnce(document.body, ".o-mail-chatter");
    assert.containsOnce(document.body, ".o-mail-chatter-topbar");
    assert.containsOnce(document.body, "button[aria-label='Attach files']");
    assert.containsOnce(document.body, "button:contains(Activities)");
    assert.containsNone(
        document.body,
        ".o-mail-chatter-topbar-follower-list",
        "there should be no followers menu because the 'message_follower_ids' field is not present in 'oe_chatter'"
    );
    assert.containsOnce(document.body, ".o-mail-chatter .o-mail-thread");
});

QUnit.test("basic chatter rendering without messages", async function (assert) {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ display_name: "second partner" });
    const views = {
        "res.partner,false,form": `<form string="Partners">
        <sheet>
            <field name="name"/>
        </sheet>
        <div class="oe_chatter">
            <field name="message_follower_ids"/>
            <field name="activity_ids"/>
        </div>
    </form>`,
    };
    const { openView } = await start({ serverData: { views } });
    await openView({
        res_model: "res.partner",
        res_id: partnerId,
        views: [[false, "form"]],
    });
    assert.containsOnce(document.body, ".o-mail-chatter");
    assert.containsOnce(document.body, ".o-mail-chatter-topbar");
    assert.containsOnce(document.body, "button[aria-label='Attach files']");
    assert.containsOnce(document.body, "button:contains(Activities)");
    assert.containsOnce(document.body, ".o-mail-chatter-topbar-follower-list");
    assert.containsNone(
        document.body,
        ".o-mail-chatter .o-mail-thread",
        "there should be no thread because the 'message_ids' field is not present in 'oe_chatter'"
    );
});
