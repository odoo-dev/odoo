/** @odoo-module **/

import {
    afterNextRender,
    nextAnimationFrame,
    start,
    startServer,
} from "@mail/../tests/helpers/test_utils";

import { patchWithCleanup } from "@web/../tests/helpers/utils";

QUnit.module("mail", {}, function () {
    QUnit.module("components", {}, function () {
        QUnit.module("message_tests.js");

        QUnit.skipRefactoring(
            "'channel_fetch' notification received is correctly handled",
            async function (assert) {
                assert.expect(3);

                const pyEnv = await startServer();
                const resPartnerId = pyEnv["res.partner"].create({});
                const mailChannelId = pyEnv["mail.channel"].create({
                    channel_member_ids: [
                        [0, 0, { partner_id: pyEnv.currentPartnerId }],
                        [0, 0, { partner_id: resPartnerId }],
                    ],
                    channel_type: "chat",
                });
                pyEnv["mail.message"].create({
                    author_id: pyEnv.currentPartnerId,
                    body: "<p>Test</p>",
                    model: "mail.channel",
                    res_id: mailChannelId,
                });
                const { openDiscuss } = await start({
                    discuss: {
                        params: {
                            default_active_id: `mail.channel_${mailChannelId}`,
                        },
                    },
                });
                await openDiscuss();

                assert.containsOnce(
                    document.body,
                    ".o-mail-message",
                    "should display a message component"
                );
                assert.containsNone(
                    document.body,
                    ".o_MessageSeenIndicatorView_icon",
                    "message component should not have any check (V) as message is not yet received"
                );

                const mailChannel1 = pyEnv["mail.channel"].searchRead([
                    ["id", "=", mailChannelId],
                ])[0];
                // Simulate received channel fetched notification
                await afterNextRender(() => {
                    pyEnv["bus.bus"]._sendone(mailChannel1, "mail.channel.member/fetched", {
                        channel_id: mailChannelId,
                        last_message_id: 100,
                        partner_id: resPartnerId,
                    });
                });

                assert.containsOnce(
                    document.body,
                    ".o_MessageSeenIndicatorView_icon",
                    "message seen indicator component should only contain one check (V) as message is just received"
                );
            }
        );

        QUnit.skipRefactoring(
            "'channel_seen' notification received is correctly handled",
            async function (assert) {
                assert.expect(3);

                const pyEnv = await startServer();
                const resPartnerId = pyEnv["res.partner"].create({});
                const mailChannelId = pyEnv["mail.channel"].create({
                    channel_member_ids: [
                        [0, 0, { partner_id: pyEnv.currentPartnerId }],
                        [0, 0, { partner_id: resPartnerId }],
                    ],
                    channel_type: "chat",
                });
                pyEnv["mail.message"].create({
                    author_id: pyEnv.currentPartnerId,
                    body: "<p>Test</p>",
                    model: "mail.channel",
                    res_id: mailChannelId,
                });
                const { openDiscuss } = await start({
                    discuss: {
                        params: {
                            default_active_id: `mail.channel_${mailChannelId}`,
                        },
                    },
                });
                await openDiscuss();

                assert.containsOnce(
                    document.body,
                    ".o-mail-message",
                    "should display a message component"
                );
                assert.containsNone(
                    document.body,
                    ".o_MessageSeenIndicatorView_icon",
                    "message component should not have any check (V) as message is not yet received"
                );

                const mailChannel1 = pyEnv["mail.channel"].searchRead([
                    ["id", "=", mailChannelId],
                ])[0];
                // Simulate received channel seen notification
                await afterNextRender(() => {
                    pyEnv["bus.bus"]._sendone(mailChannel1, "mail.channel.member/seen", {
                        channel_id: mailChannelId,
                        last_message_id: 100,
                        partner_id: resPartnerId,
                    });
                });
                assert.containsN(
                    document.body,
                    ".o_MessageSeenIndicatorView_icon",
                    2,
                    "message seen indicator component should contain two checks (V) as message is seen"
                );
            }
        );

        QUnit.skipRefactoring(
            "'channel_fetch' notification then 'channel_seen' received are correctly handled",
            async function (assert) {
                assert.expect(4);

                const pyEnv = await startServer();
                const resPartnerId = pyEnv["res.partner"].create({ display_name: "Recipient" });
                const mailChannelId = pyEnv["mail.channel"].create({
                    channel_member_ids: [
                        [0, 0, { partner_id: pyEnv.currentPartnerId }],
                        [0, 0, { partner_id: resPartnerId }],
                    ],
                    channel_type: "chat",
                });
                pyEnv["mail.message"].create({
                    author_id: pyEnv.currentPartnerId,
                    body: "<p>Test</p>",
                    model: "mail.channel",
                    res_id: mailChannelId,
                });
                const { openDiscuss } = await start({
                    discuss: {
                        params: {
                            default_active_id: `mail.channel_${mailChannelId}`,
                        },
                    },
                });
                await openDiscuss();

                assert.containsOnce(
                    document.body,
                    ".o-mail-message",
                    "should display a message component"
                );
                assert.containsNone(
                    document.body,
                    ".o_MessageSeenIndicatorView_icon",
                    "message component should not have any check (V) as message is not yet received"
                );

                const mailChannel1 = pyEnv["mail.channel"].searchRead([
                    ["id", "=", mailChannelId],
                ])[0];
                // Simulate received channel fetched notification
                await afterNextRender(() => {
                    pyEnv["bus.bus"]._sendone(mailChannel1, "mail.channel.member/fetched", {
                        channel_id: mailChannelId,
                        last_message_id: 100,
                        partner_id: resPartnerId,
                    });
                });
                assert.containsOnce(
                    document.body,
                    ".o_MessageSeenIndicatorView_icon",
                    "message seen indicator component should only contain one check (V) as message is just received"
                );

                // Simulate received channel seen notification
                await afterNextRender(() => {
                    pyEnv["bus.bus"]._sendone(mailChannel1, "mail.channel.member/seen", {
                        channel_id: mailChannelId,
                        last_message_id: 100,
                        partner_id: resPartnerId,
                    });
                });
                assert.containsN(
                    document.body,
                    ".o_MessageSeenIndicatorView_icon",
                    2,
                    "message seen indicator component should contain two checks (V) as message is now seen"
                );
            }
        );

        QUnit.skipRefactoring(
            "do not show message seen indicator on the last message seen by everyone when the current user is not author of the message",
            async function (assert) {
                assert.expect(2);

                const pyEnv = await startServer();
                const otherPartnerId = pyEnv["res.partner"].create({ name: "Demo User" });
                const mailChannelId = pyEnv["mail.channel"].create({
                    channel_type: "chat",
                    channel_member_ids: [
                        [0, 0, { partner_id: pyEnv.currentPartnerId }],
                        [0, 0, { partner_id: otherPartnerId }],
                    ],
                });
                const mailMessageId = pyEnv["mail.message"].create({
                    author_id: otherPartnerId,
                    body: "<p>Test</p>",
                    model: "mail.channel",
                    res_id: mailChannelId,
                });
                const memberIds = pyEnv["mail.channel.member"].search([
                    ["channel_id", "=", mailChannelId],
                ]);
                pyEnv["mail.channel.member"].write(memberIds, { seen_message_id: mailMessageId });
                const { openDiscuss } = await start({
                    discuss: {
                        params: {
                            default_active_id: `mail.channel_${mailChannelId}`,
                        },
                    },
                });
                await openDiscuss();

                assert.containsOnce(
                    document.body,
                    ".o-mail-message",
                    "should display a message component"
                );
                assert.containsNone(
                    document.body,
                    ".o_MessageView_seenIndicator",
                    "message component should not have any message seen indicator because the current user is not author"
                );
            }
        );

        QUnit.skipRefactoring(
            "do not show message seen indicator on all the messages of the current user that are older than the last message seen by everyone",
            async function (assert) {
                assert.expect(3);

                const pyEnv = await startServer();
                const otherPartnerId = pyEnv["res.partner"].create({ name: "Demo User" });
                const mailChannelId = pyEnv["mail.channel"].create({
                    channel_type: "chat",
                    channel_member_ids: [
                        [0, 0, { partner_id: pyEnv.currentPartnerId }],
                        [0, 0, { partner_id: otherPartnerId }],
                    ],
                });
                const [beforeLastMailMessageId, lastMailMessageId] = pyEnv["mail.message"].create([
                    {
                        author_id: pyEnv.currentPartnerId,
                        body: "<p>Message before last seen</p>",
                        model: "mail.channel",
                        res_id: mailChannelId,
                    },
                    {
                        author_id: pyEnv.currentPartnerId,
                        body: "<p>Last seen by everyone</p>",
                        model: "mail.channel",
                        res_id: mailChannelId,
                    },
                ]);
                const memberIds = pyEnv["mail.channel.member"].search([
                    ["channel_id", "=", mailChannelId],
                ]);
                pyEnv["mail.channel.member"].write(memberIds, {
                    seen_message_id: lastMailMessageId,
                });
                const { openDiscuss } = await start({
                    discuss: {
                        params: {
                            default_active_id: `mail.channel_${mailChannelId}`,
                        },
                    },
                });
                await openDiscuss();

                assert.containsOnce(
                    document.body,
                    `.o-mail-message[data-id=${beforeLastMailMessageId}]`,
                    "should display a message component"
                );
                assert.containsOnce(
                    document.body,
                    `.o-mail-message[data-id=${beforeLastMailMessageId}] .o_MessageView_seenIndicator`,
                    "message component should have a message seen indicator because the current user is author"
                );
                assert.containsNone(
                    document.body,
                    `.o-mail-message[data-id=${beforeLastMailMessageId}] .o_MessageSeenIndicatorView_icon`,
                    "message component should not have any check (V) because it is older than the last message seen by everyone"
                );
            }
        );

        QUnit.skipRefactoring(
            "only show messaging seen indicator if authored by me, after last seen by all message",
            async function (assert) {
                assert.expect(3);

                const pyEnv = await startServer();
                const otherPartnerId = pyEnv["res.partner"].create({ name: "Demo User" });
                const mailChannelId = pyEnv["mail.channel"].create({
                    channel_type: "chat",
                    channel_member_ids: [
                        [0, 0, { partner_id: pyEnv.currentPartnerId }],
                        [0, 0, { partner_id: otherPartnerId }],
                    ],
                });
                const mailMessageId = pyEnv["mail.message"].create({
                    author_id: pyEnv.currentPartnerId,
                    body: "<p>Test</p>",
                    res_id: mailChannelId,
                    model: "mail.channel",
                });
                const memberIds = pyEnv["mail.channel.member"].search([
                    ["channel_id", "=", mailChannelId],
                ]);
                pyEnv["mail.channel.member"].write(memberIds, {
                    fetched_message_id: mailMessageId,
                    seen_message_id: mailMessageId - 1,
                });
                const { openDiscuss } = await start({
                    discuss: {
                        params: {
                            default_active_id: `mail.channel_${mailChannelId}`,
                        },
                    },
                });
                await openDiscuss();

                assert.containsOnce(
                    document.body,
                    ".o-mail-message",
                    "should display a message component"
                );
                assert.containsOnce(
                    document.body,
                    ".o_MessageView_seenIndicator",
                    "message component should have a message seen indicator"
                );
                assert.containsN(
                    document.body,
                    ".o_MessageSeenIndicatorView_icon",
                    1,
                    "message component should have one check (V) because the message was fetched by everyone but no other member than author has seen the message"
                );
            }
        );

        QUnit.skipRefactoring(
            "allow attachment delete on authored message",
            async function (assert) {
                assert.expect(5);

                const pyEnv = await startServer();
                const mailChannelId = pyEnv["mail.channel"].create({});
                pyEnv["mail.message"].create({
                    attachment_ids: [
                        [
                            0,
                            0,
                            {
                                mimetype: "image/jpeg",
                                name: "BLAH",
                                res_id: mailChannelId,
                                res_model: "mail.channel",
                            },
                        ],
                    ],
                    author_id: pyEnv.currentPartnerId,
                    body: "<p>Test</p>",
                    model: "mail.channel",
                    res_id: mailChannelId,
                });
                const { click, openDiscuss } = await start({
                    discuss: {
                        params: {
                            default_active_id: `mail.channel_${mailChannelId}`,
                        },
                    },
                });
                await openDiscuss();

                assert.containsOnce(
                    document.body,
                    ".o_AttachmentImage",
                    "should have an attachment"
                );
                assert.containsOnce(
                    document.body,
                    ".o_AttachmentImage_actionUnlink",
                    "should have delete attachment button"
                );

                await click(".o_AttachmentImage_actionUnlink");
                assert.containsOnce(
                    document.body,
                    ".o_AttachmentDeleteConfirmView",
                    "An attachment delete confirmation dialog should have been opened"
                );
                assert.strictEqual(
                    document.querySelector(".o_AttachmentDeleteConfirmView_mainText").textContent,
                    `Do you really want to delete "BLAH"?`,
                    "Confirmation dialog should contain the attachment delete confirmation text"
                );

                await click(".o_AttachmentDeleteConfirmView_confirmButton");
                assert.containsNone(
                    document.body,
                    ".o_AttachmentCard",
                    "should no longer have an attachment"
                );
            }
        );

        QUnit.skipRefactoring(
            "prevent attachment delete on non-authored message in channels",
            async function (assert) {
                assert.expect(2);

                const pyEnv = await startServer();
                const partnerId = pyEnv["res.partner"].create({});
                const mailChannelId = pyEnv["mail.channel"].create({});
                pyEnv["mail.message"].create({
                    attachment_ids: [
                        [
                            0,
                            0,
                            {
                                mimetype: "image/jpeg",
                                name: "BLAH",
                                res_id: mailChannelId,
                                res_model: "mail.channel",
                            },
                        ],
                    ],
                    author_id: partnerId,
                    body: "<p>Test</p>",
                    model: "mail.channel",
                    res_id: mailChannelId,
                });
                const { openDiscuss } = await start({
                    discuss: {
                        params: {
                            default_active_id: `mail.channel_${mailChannelId}`,
                        },
                    },
                });
                await openDiscuss();

                assert.containsOnce(
                    document.body,
                    ".o_AttachmentImage",
                    "should have an attachment"
                );
                assert.containsNone(
                    document.body,
                    ".o_AttachmentImage_actionUnlink",
                    "delete attachment button should not be printed"
                );
            }
        );

        QUnit.skipRefactoring(
            "allow attachment image download on message",
            async function (assert) {
                assert.expect(1);

                const pyEnv = await startServer();
                const mailChannelId1 = pyEnv["mail.channel"].create({});
                const irAttachmentId1 = pyEnv["ir.attachment"].create({
                    name: "Blah.jpg",
                    mimetype: "image/jpeg",
                });
                pyEnv["mail.message"].create({
                    attachment_ids: [irAttachmentId1],
                    body: "<p>Test</p>",
                    model: "mail.channel",
                    res_id: mailChannelId1,
                });
                const { openDiscuss } = await start({
                    discuss: {
                        context: {
                            active_id: mailChannelId1,
                        },
                    },
                });
                await openDiscuss();
                assert.containsOnce(
                    document.body,
                    ".o_AttachmentImage_actionDownload",
                    "should have download attachment button"
                );
            }
        );

        QUnit.skipRefactoring(
            "subtype description should be displayed if it is different than body",
            async function (assert) {
                assert.expect(2);

                const pyEnv = await startServer();
                const threadId = pyEnv["res.partner"].create({});
                const subtypeId = pyEnv["mail.message.subtype"].create({ description: "Bonjour" });
                pyEnv["mail.message"].create({
                    body: "<p>Hello</p>",
                    model: "res.partner",
                    res_id: threadId,
                    subtype_id: subtypeId,
                });
                const { openView } = await start();
                await openView({
                    res_id: threadId,
                    res_model: "res.partner",
                    views: [[false, "form"]],
                });
                assert.containsOnce(
                    document.body,
                    ".o-mail-message-body",
                    "message should have content"
                );
                assert.strictEqual(
                    document.querySelector(`.o-mail-message-body`).textContent,
                    "HelloBonjour",
                    "message content should display both body and subtype description when they are different"
                );
            }
        );

        QUnit.skipRefactoring(
            "subtype description should not be displayed if it is similar to body",
            async function (assert) {
                assert.expect(2);

                const pyEnv = await startServer();
                const threadId = pyEnv["res.partner"].create({});
                const subtypeId = pyEnv["mail.message.subtype"].create({ description: "hello" });
                pyEnv["mail.message"].create({
                    body: "<p>Hello</p>",
                    model: "res.partner",
                    res_id: threadId,
                    subtype_id: subtypeId,
                });
                const { openView } = await start();
                await openView({
                    res_id: threadId,
                    res_model: "res.partner",
                    views: [[false, "form"]],
                });
                assert.containsOnce(
                    document.body,
                    ".o-mail-message-body",
                    "message should have content"
                );
                assert.strictEqual(
                    document.querySelector(`.o-mail-message-body`).textContent,
                    "Hello",
                    "message content should display only body when subtype description is similar"
                );
            }
        );

        QUnit.skipRefactoring(
            "data-oe-id & data-oe-model link redirection on click",
            async function (assert) {
                assert.expect(7);

                const pyEnv = await startServer();
                const threadId = pyEnv["res.partner"].create({});
                pyEnv["mail.message"].create({
                    body: `<p><a href="#" data-oe-id="250" data-oe-model="some.model">some.model_250</a></p>`,
                    model: "res.partner",
                    res_id: threadId,
                });
                const { env, openView } = await start();
                await openView({
                    res_id: threadId,
                    res_model: "res.partner",
                    views: [[false, "form"]],
                });
                patchWithCleanup(env.services.action, {
                    doAction(action) {
                        assert.strictEqual(
                            action.type,
                            "ir.actions.act_window",
                            "action should open view"
                        );
                        assert.strictEqual(
                            action.res_model,
                            "some.model",
                            "action should open view on 'some.model' model"
                        );
                        assert.strictEqual(action.res_id, 250, "action should open view on 250");
                        assert.step("do-action:openFormView_some.model_250");
                    },
                });
                assert.containsOnce(
                    document.body,
                    ".o-mail-message-body",
                    "message should have content"
                );
                assert.containsOnce(
                    document.querySelector(".o-mail-message-body"),
                    "a",
                    "message content should have a link"
                );

                document.querySelector(`.o-mail-message-body a`).click();
                assert.verifySteps(
                    ["do-action:openFormView_some.model_250"],
                    "should have open form view on related record after click on link"
                );
            }
        );

        QUnit.skipRefactoring(
            "chat with author should be opened after clicking on their avatar",
            async function (assert) {
                assert.expect(4);

                const pyEnv = await startServer();
                const [threadId, resPartnerId] = pyEnv["res.partner"].create([{}, {}]);
                pyEnv["res.users"].create({ partner_id: resPartnerId });
                pyEnv["mail.message"].create({
                    author_id: resPartnerId,
                    body: "not empty",
                    model: "res.partner",
                    res_id: threadId,
                });
                const { click, openView } = await start();
                await openView({
                    res_id: threadId,
                    res_model: "res.partner",
                    views: [[false, "form"]],
                });
                assert.containsOnce(
                    document.body,
                    ".o_MessageView_authorAvatar",
                    "message should have the author avatar"
                );
                assert.hasClass(
                    document.querySelector(".o_MessageView_authorAvatar"),
                    "o_redirect",
                    "author avatar should have the redirect style"
                );

                await click(".o_MessageView_authorAvatar");
                assert.containsOnce(
                    document.body,
                    ".o_ChatWindow_thread",
                    "chat window with thread should be opened after clicking on author avatar"
                );
                assert.strictEqual(
                    document.querySelector(".o_ChatWindow_thread").dataset.correspondentId,
                    resPartnerId.toString(),
                    "chat with author should be opened after clicking on their avatar"
                );
            }
        );

        QUnit.skipRefactoring(
            "chat with author should be opened after clicking on their name",
            async function (assert) {
                assert.expect(4);

                const pyEnv = await startServer();
                const resPartnerId = pyEnv["res.partner"].create({});
                pyEnv["res.users"].create({ partner_id: resPartnerId });
                pyEnv["mail.message"].create({
                    author_id: resPartnerId,
                    body: "not empty",
                    model: "res.partner",
                    res_id: resPartnerId,
                });
                const { click, openFormView } = await start();
                await openFormView({
                    res_model: "res.partner",
                    res_id: resPartnerId,
                });
                assert.containsOnce(
                    document.body,
                    ".o_MessageView_authorName",
                    "message should have the author name"
                );
                assert.hasClass(
                    document.querySelector(".o_MessageView_authorName"),
                    "o_redirect",
                    "author name should have the redirect style"
                );

                await click(".o_MessageView_authorName");
                assert.containsOnce(
                    document.body,
                    ".o_ChatWindow_thread",
                    "chat window with thread should be opened after clicking on author name"
                );
                assert.strictEqual(
                    document.querySelector(".o_ChatWindow_thread").dataset.correspondentId,
                    resPartnerId.toString(),
                    "chat with author should be opened after clicking on their name"
                );
            }
        );

        QUnit.skipRefactoring(
            "chat with author should be opened after clicking on their im status icon",
            async function (assert) {
                assert.expect(4);

                const pyEnv = await startServer();
                const [threadId, resPartnerId] = pyEnv["res.partner"].create([
                    {},
                    { im_status: "online" },
                ]);
                pyEnv["res.users"].create({
                    im_status: "online",
                    partner_id: resPartnerId,
                });
                pyEnv["mail.message"].create({
                    author_id: resPartnerId,
                    body: "not empty",
                    model: "res.partner",
                    res_id: threadId,
                });
                const { advanceTime, click, openView } = await start({
                    hasTimeControl: true,
                });
                await openView({
                    res_id: threadId,
                    res_model: "res.partner",
                    views: [[false, "form"]],
                });
                await afterNextRender(() => advanceTime(50 * 1000)); // next fetch of im_status
                assert.containsOnce(
                    document.body,
                    ".o_MessageView_personaImStatusIcon",
                    "message should have the author im status icon"
                );
                assert.hasClass(
                    document.querySelector(".o_MessageView_personaImStatusIcon"),
                    "o-has-open-chat",
                    "author im status icon should have the open chat style"
                );

                await click(".o_MessageView_personaImStatusIcon");
                assert.containsOnce(
                    document.body,
                    ".o_ChatWindow_thread",
                    "chat window with thread should be opened after clicking on author im status icon"
                );
                assert.strictEqual(
                    document.querySelector(".o_ChatWindow_thread").dataset.correspondentId,
                    resPartnerId.toString(),
                    "chat with author should be opened after clicking on their im status icon"
                );
            }
        );

        QUnit.skipRefactoring(
            "open chat with author on avatar click should be disabled when currently chatting with the author",
            async function (assert) {
                assert.expect(3);

                const pyEnv = await startServer();
                const resPartnerId = pyEnv["res.partner"].create({});
                pyEnv["res.users"].create({ partner_id: resPartnerId });
                const mailChannelId = pyEnv["mail.channel"].create({
                    channel_member_ids: [
                        [0, 0, { partner_id: pyEnv.currentPartnerId }],
                        [0, 0, { partner_id: resPartnerId }],
                    ],
                    channel_type: "chat",
                });
                pyEnv["mail.message"].create({
                    author_id: resPartnerId,
                    body: "not empty",
                    model: "mail.channel",
                    res_id: mailChannelId,
                });
                const { openDiscuss } = await start({
                    discuss: {
                        params: {
                            default_active_id: `mail.channel_${mailChannelId}`,
                        },
                    },
                });
                await openDiscuss();
                assert.containsOnce(
                    document.body,
                    ".o_MessageView_authorAvatar",
                    "message should have the author avatar"
                );
                assert.doesNotHaveClass(
                    document.querySelector(".o_MessageView_authorAvatar"),
                    "o_redirect",
                    "author avatar should not have the redirect style"
                );

                document.querySelector(".o_MessageView_authorAvatar").click();
                await nextAnimationFrame();
                assert.containsNone(
                    document.body,
                    ".o-mail-chat-window",
                    "should have no thread opened after clicking on author avatar when currently chatting with the author"
                );
            }
        );

        QUnit.skipRefactoring(
            "Chat with partner should be opened after clicking on their mention",
            async function (assert) {
                assert.expect(2);

                const pyEnv = await startServer();
                const resPartnerId = pyEnv["res.partner"].create({
                    name: "Test Partner",
                    email: "testpartner@odoo.com",
                });
                pyEnv["res.users"].create({ partner_id: resPartnerId });
                const { click, insertText, openFormView } = await start();
                await openFormView({
                    res_model: "res.partner",
                    res_id: resPartnerId,
                });

                await click(".o-mail-chatter-topbar-send-message-button");
                await insertText(".o-mail-composer-textarea", "@Te");
                await click(".o_ComposerSuggestionView");
                await click(".o-mail-composer-send-button");
                await click(".o_mail_redirect");
                assert.containsOnce(
                    document.body,
                    ".o_ChatWindow_thread",
                    "chat window with thread should be opened after clicking on partner mention"
                );
                assert.strictEqual(
                    document.querySelector(".o_ChatWindow_thread").dataset.correspondentId,
                    resPartnerId.toString(),
                    "chat with partner should be opened after clicking on their mention"
                );
            }
        );

        QUnit.skipRefactoring(
            "Channel should be opened after clicking on its mention",
            async function (assert) {
                assert.expect(1);

                const pyEnv = await startServer();
                const resPartnerId = pyEnv["res.partner"].create({});
                pyEnv["mail.channel"].create({ name: "my-channel" });
                const { click, insertText, openFormView } = await start();
                await openFormView({
                    res_model: "res.partner",
                    res_id: resPartnerId,
                });

                await click(".o-mail-chatter-topbar-send-message-button");
                await insertText(".o-mail-composer-textarea", "#my-channel");
                await click(".o_ComposerSuggestionView");
                await click(".o-mail-composer-send-button");
                await click(".o_channel_redirect");
                assert.containsOnce(
                    document.body,
                    ".o_ChatWindow_thread",
                    "chat window with thread should be opened after clicking on channel mention"
                );
            }
        );

        QUnit.skipRefactoring(
            'message should not be considered as "clicked" after clicking on its author avatar',
            async function (assert) {
                assert.expect(1);

                const pyEnv = await startServer();
                const [threadId, partnerId] = pyEnv["res.partner"].create([{}, {}]);
                pyEnv["mail.message"].create({
                    author_id: partnerId,
                    body: "<p>Test</p>",
                    model: "res.partner",
                    res_id: threadId,
                });
                const { openView } = await start();
                await openView({
                    res_id: threadId,
                    res_model: "res.partner",
                    views: [[false, "form"]],
                });
                document.querySelector(`.o_MessageView_authorAvatar`).click();
                await nextAnimationFrame();
                assert.doesNotHaveClass(
                    document.querySelector(`.o-mail-message`),
                    "o-clicked",
                    "message should not be considered as 'clicked' after clicking on its author avatar"
                );
            }
        );

        QUnit.skipRefactoring(
            'message should not be considered as "clicked" after clicking on notification failure icon',
            async function (assert) {
                assert.expect(1);

                const pyEnv = await startServer();
                const threadId = pyEnv["res.partner"].create({});
                const mailMessageId = pyEnv["mail.message"].create({
                    body: "not empty",
                    model: "res.partner",
                    res_id: threadId,
                });
                pyEnv["mail.notification"].create({
                    mail_message_id: mailMessageId,
                    notification_status: "exception",
                    notification_type: "email",
                });
                const { env, openView } = await start();
                await openView({
                    res_id: threadId,
                    res_model: "res.partner",
                    views: [[false, "form"]],
                });
                patchWithCleanup(env.services.action, {
                    // intercept the action: this action is not relevant in the context of this test.
                    doAction() {},
                });
                document
                    .querySelector(".o-mail-message-notification-icon-clickable.o-error")
                    .click();
                await nextAnimationFrame();
                assert.doesNotHaveClass(
                    document.querySelector(`.o-mail-message`),
                    "o-clicked",
                    "message should not be considered as 'clicked' after clicking on notification failure icon"
                );
            }
        );
    });
});
