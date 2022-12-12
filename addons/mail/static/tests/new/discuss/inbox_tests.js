/** @odoo-module **/

import { nextAnimationFrame, start, startServer } from "@mail/../tests/helpers/test_utils";

import { getFixture } from "@web/../tests/helpers/utils";

let target;

QUnit.module("discuss inbox", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test("reply: discard on reply button toggle", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    const mailMessageId1 = pyEnv["mail.message"].create({
        body: "not empty",
        model: "res.partner",
        needaction: true,
        needaction_partner_ids: [pyEnv.currentPartnerId],
        res_id: resPartnerId1,
    });
    pyEnv["mail.notification"].create({
        mail_message_id: mailMessageId1,
        notification_status: "sent",
        notification_type: "inbox",
        res_partner_id: pyEnv.currentPartnerId,
    });
    const { click, openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-message");

    await click("i[aria-label='Reply']");
    assert.containsOnce(target, ".o-mail-composer");
    await click("i[aria-label='Reply']");
    assert.containsNone(target, ".o-mail-composer");
});

QUnit.test("reply: discard on click away", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    const mailMessageId1 = pyEnv["mail.message"].create({
        body: "not empty",
        model: "res.partner",
        needaction: true,
        needaction_partner_ids: [pyEnv.currentPartnerId],
        res_id: resPartnerId1,
    });
    pyEnv["mail.notification"].create({
        mail_message_id: mailMessageId1,
        notification_status: "sent",
        notification_type: "inbox",
        res_partner_id: pyEnv.currentPartnerId,
    });
    const { click, openDiscuss } = await start();
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-message");

    await click("i[aria-label='Reply']");
    assert.containsOnce(target, ".o-mail-composer");

    document.querySelector(".o-mail-composer-textarea").click();
    await nextAnimationFrame(); // wait just in case, but nothing is supposed to happen
    assert.containsOnce(
        target,
        ".o-mail-composer",
        "reply composer should still be there after clicking inside itself"
    );

    await click("i[aria-label='Emojis']");
    assert.containsOnce(target, ".o-mail-emoji-picker");

    await click(".o-mail-emoji-picker-content .o-emoji");
    assert.containsNone(target, ".o-mail-emoji-picker");
    assert.containsOnce(
        target,
        ".o-mail-composer",
        "reply composer should still be there after selecting an emoji (even though it is technically a click away, it should be considered inside)"
    );

    await click(".o-mail-message");
    assert.containsNone(target, ".o-mail-composer");
});

QUnit.test(
    '"reply to" composer should log note if message replied to is a note',
    async function (assert) {
        const pyEnv = await startServer();
        const resPartnerId1 = pyEnv["res.partner"].create({});
        const mailMessageId1 = pyEnv["mail.message"].create({
            body: "not empty",
            is_note: true,
            model: "res.partner",
            needaction: true,
            needaction_partner_ids: [pyEnv.currentPartnerId],
            res_id: resPartnerId1,
        });
        pyEnv["mail.notification"].create({
            mail_message_id: mailMessageId1,
            notification_status: "sent",
            notification_type: "inbox",
            res_partner_id: pyEnv.currentPartnerId,
        });
        const { click, insertText, openDiscuss } = await start({
            async mockRPC(route, args) {
                if (route === "/mail/message/post") {
                    assert.step("/mail/message/post");
                    assert.strictEqual(args.post_data.message_type, "comment");
                    assert.strictEqual(args.post_data.subtype_xmlid, "mail.mt_note");
                }
            },
        });
        await openDiscuss();
        assert.containsOnce(target, ".o-mail-message");

        await click("i[aria-label='Reply']");
        await insertText(".o-mail-composer-textarea", "Test");
        await click(".o-mail-composer-send-button");
        assert.verifySteps(["/mail/message/post"]);
    }
);

QUnit.test(
    '"reply to" composer should send message if message replied to is not a note',
    async function (assert) {
        const pyEnv = await startServer();
        const resPartnerId1 = pyEnv["res.partner"].create({});
        const mailMessageId1 = pyEnv["mail.message"].create({
            body: "not empty",
            is_discussion: true,
            model: "res.partner",
            needaction: true,
            needaction_partner_ids: [pyEnv.currentPartnerId],
            res_id: resPartnerId1,
        });
        pyEnv["mail.notification"].create({
            mail_message_id: mailMessageId1,
            notification_status: "sent",
            notification_type: "inbox",
            res_partner_id: pyEnv.currentPartnerId,
        });
        const { click, insertText, openDiscuss } = await start({
            async mockRPC(route, args) {
                if (route === "/mail/message/post") {
                    assert.step("/mail/message/post");
                    assert.strictEqual(args.post_data.message_type, "comment");
                    assert.strictEqual(args.post_data.subtype_xmlid, "mail.mt_comment");
                }
            },
        });
        await openDiscuss();
        assert.containsOnce(target, ".o-mail-message");

        await click("i[aria-label='Reply']");
        assert.strictEqual(
            document.querySelector(".o-mail-composer-send-button").textContent.trim(),
            "Send"
        );

        await insertText(".o-mail-composer-textarea", "Test");
        await click(".o-mail-composer-send-button");
        assert.verifySteps(["/mail/message/post"]);
    }
);

QUnit.test("show subject of message in Inbox", async function (assert) {
    const pyEnv = await startServer();
    const mailMessageId1 = pyEnv["mail.message"].create({
        body: "not empty",
        model: "mail.channel",
        needaction: true,
        needaction_partner_ids: [pyEnv.currentPartnerId], // not needed, for consistency
        subject: "Salutations, voyageur",
    });
    pyEnv["mail.notification"].create({
        mail_message_id: mailMessageId1,
        notification_status: "sent",
        notification_type: "inbox",
        res_partner_id: pyEnv.currentPartnerId,
    });
    const { openDiscuss } = await start({
        discuss: {
            default_active_id: "inbox",
        },
    });
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-message");
    assert.containsOnce(target, ".o-mail-message-subject");
    assert.strictEqual(
        target.querySelector(".o-mail-message-subject").textContent,
        "Subject: Salutations, voyageur"
    );
});

QUnit.test("show subject of message in history", async function (assert) {
    const pyEnv = await startServer();
    const mailMessageId1 = pyEnv["mail.message"].create({
        body: "not empty",
        history_partner_ids: [3], // not needed, for consistency
        model: "mail.channel",
        subject: "Salutations, voyageur",
    });
    pyEnv["mail.notification"].create({
        is_read: true,
        mail_message_id: mailMessageId1,
        notification_status: "sent",
        notification_type: "inbox",
        res_partner_id: pyEnv.currentPartnerId,
    });
    const { openDiscuss } = await start({
        discuss: {
            params: {
                default_active_id: "mail.box_history",
            },
        },
    });
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-message");
    assert.containsOnce(target, ".o-mail-message-subject");
    assert.strictEqual(
        target.querySelector(".o-mail-message-subject").textContent,
        "Subject: Salutations, voyageur"
    );
});

QUnit.test(
    "subject should not be shown when subject is the same as the thread name",
    async function (assert) {
        const pyEnv = await startServer();
        const mailChannelId1 = pyEnv["mail.channel"].create({
            name: "Salutations, voyageur",
        });
        const mailMessageId1 = pyEnv["mail.message"].create({
            body: "not empty",
            model: "mail.channel",
            res_id: mailChannelId1,
            needaction: true,
            subject: "Salutations, voyageur",
        });
        pyEnv["mail.notification"].create({
            mail_message_id: mailMessageId1,
            notification_status: "sent",
            notification_type: "inbox",
            res_partner_id: pyEnv.currentPartnerId,
        });
        const { openDiscuss } = await start({
            discuss: {
                default_active_id: "mail.box_inbox",
            },
        });
        await openDiscuss();
        assert.containsNone(target, ".o-mail-message-subject");
    }
);

QUnit.test(
    "subject should not be shown when subject is the same as the thread name and both have the same prefix",
    async function (assert) {
        const pyEnv = await startServer();
        const mailChannelId1 = pyEnv["mail.channel"].create({
            name: "Re: Salutations, voyageur",
        });
        const mailMessageId1 = pyEnv["mail.message"].create({
            body: "not empty",
            model: "mail.channel",
            res_id: mailChannelId1,
            needaction: true,
            subject: "Re: Salutations, voyageur",
        });
        pyEnv["mail.notification"].create({
            mail_message_id: mailMessageId1,
            notification_status: "sent",
            notification_type: "inbox",
            res_partner_id: pyEnv.currentPartnerId,
        });
        const { openDiscuss } = await start({
            discuss: {
                default_active_id: "mail.box_inbox",
            },
        });
        await openDiscuss();
        assert.containsNone(target, ".o-mail-message-subject");
    }
);

QUnit.test(
    'subject should not be shown when subject differs from thread name only by the "Re:" prefix',
    async function (assert) {
        const pyEnv = await startServer();
        const mailChannelId1 = pyEnv["mail.channel"].create({
            name: "Salutations, voyageur",
        });
        const mailMessageId1 = pyEnv["mail.message"].create({
            body: "not empty",
            model: "mail.channel",
            res_id: mailChannelId1,
            needaction: true,
            subject: "Re: Salutations, voyageur",
        });
        pyEnv["mail.notification"].create({
            mail_message_id: mailMessageId1,
            notification_status: "sent",
            notification_type: "inbox",
            res_partner_id: pyEnv.currentPartnerId,
        });
        const { openDiscuss } = await start({
            discuss: {
                default_active_id: "mail.box_inbox",
            },
        });
        await openDiscuss();
        assert.containsNone(target, ".o-mail-message-subject");
    }
);

QUnit.test(
    'subject should not be shown when subject differs from thread name only by the "Fw:" and "Re:" prefix',
    async function (assert) {
        const pyEnv = await startServer();
        const mailChannelId1 = pyEnv["mail.channel"].create({
            name: "Salutations, voyageur",
        });
        const mailMessageId1 = pyEnv["mail.message"].create({
            body: "not empty",
            model: "mail.channel",
            res_id: mailChannelId1,
            needaction: true,
            subject: "Fw: Re: Salutations, voyageur",
        });
        pyEnv["mail.notification"].create({
            mail_message_id: mailMessageId1,
            notification_status: "sent",
            notification_type: "inbox",
            res_partner_id: pyEnv.currentPartnerId,
        });
        const { openDiscuss } = await start({
            discuss: {
                default_active_id: "mail.box_inbox",
            },
        });
        await openDiscuss();
        assert.containsNone(target, ".o-mail-message-subject");
    }
);

QUnit.test(
    "subject should be shown when the thread name has an extra prefix compared to subject",
    async function (assert) {
        const pyEnv = await startServer();
        const mailChannelId1 = pyEnv["mail.channel"].create({
            name: "Re: Salutations, voyageur",
        });
        const mailMessageId1 = pyEnv["mail.message"].create({
            body: "not empty",
            model: "mail.channel",
            res_id: mailChannelId1,
            needaction: true,
            subject: "Salutations, voyageur",
        });
        pyEnv["mail.notification"].create({
            mail_message_id: mailMessageId1,
            notification_status: "sent",
            notification_type: "inbox",
            res_partner_id: pyEnv.currentPartnerId,
        });
        const { openDiscuss } = await start({
            discuss: {
                default_active_id: "mail.box_inbox",
            },
        });
        await openDiscuss();
        assert.containsOnce(target, ".o-mail-message-subject");
    }
);

QUnit.test(
    'subject should not be shown when subject differs from thread name only by the "fw:" prefix and both contain another common prefix',
    async function (assert) {
        const pyEnv = await startServer();
        const mailChannelId1 = pyEnv["mail.channel"].create({
            name: "Re: Salutations, voyageur",
        });
        const mailMessageId1 = pyEnv["mail.message"].create({
            body: "not empty",
            model: "mail.channel",
            res_id: mailChannelId1,
            needaction: true,
            subject: "fw: re: Salutations, voyageur",
        });
        pyEnv["mail.notification"].create({
            mail_message_id: mailMessageId1,
            notification_status: "sent",
            notification_type: "inbox",
            res_partner_id: pyEnv.currentPartnerId,
        });
        const { openDiscuss } = await start({
            discuss: {
                default_active_id: "mail.box_inbox",
            },
        });
        await openDiscuss();
        assert.containsNone(target, ".o-mail-message-subject");
    }
);

QUnit.test(
    'subject should not be shown when subject differs from thread name only by the "Re: Re:" prefix',
    async function (assert) {
        const pyEnv = await startServer();
        const mailChannelId1 = pyEnv["mail.channel"].create({
            name: "Salutations, voyageur",
        });
        const mailMessageId1 = pyEnv["mail.message"].create({
            body: "not empty",
            model: "mail.channel",
            res_id: mailChannelId1,
            needaction: true,
            subject: "Re: Re: Salutations, voyageur",
        });
        pyEnv["mail.notification"].create({
            mail_message_id: mailMessageId1,
            notification_status: "sent",
            notification_type: "inbox",
            res_partner_id: pyEnv.currentPartnerId,
        });
        const { openDiscuss } = await start({
            discuss: {
                default_active_id: "mail.box_inbox",
            },
        });
        await openDiscuss();
        assert.containsNone(target, ".o-mail-message-subject");
    }
);
