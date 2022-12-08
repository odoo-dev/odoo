/** @odoo-module **/

import { afterNextRender, start, startServer } from "@mail/../tests/helpers/test_utils";

import { click, getFixture, nextTick, patchWithCleanup } from "@web/../tests/helpers/utils";
import { Composer } from "@mail/new/composer/composer";

let target;

QUnit.module("mail", (hooks) => {
    hooks.beforeEach(async () => {
        target = getFixture();
        // Simulate real user interactions
        patchWithCleanup(Composer.prototype, {
            isEventTrusted() {
                return true;
            },
        });
    });
    QUnit.module("components", {}, function () {
        QUnit.module("composer_tests.js");

        QUnit.test(
            "composer text input: basic rendering when posting a message",
            async function (assert) {
                assert.expect(3);

                const pyEnv = await startServer();
                const { click, openFormView } = await start();
                await openFormView({
                    res_id: pyEnv.currentPartnerId,
                    res_model: "res.partner",
                });
                await click(".o-mail-chatter-topbar-send-message-button");

                assert.containsOnce(target, ".o-mail-composer");
                assert.containsOnce(target, "textarea.o-mail-composer-textarea");
                assert.hasAttrValue(
                    target.querySelector(".o-mail-composer-textarea"),
                    "placeholder",
                    "Send a message to followers..."
                );
            }
        );

        QUnit.test(
            "composer text input: basic rendering when logging note",
            async function (assert) {
                assert.expect(3);

                const pyEnv = await startServer();
                const { click, openFormView } = await start();
                await openFormView({
                    res_id: pyEnv.currentPartnerId,
                    res_model: "res.partner",
                });
                await click(".o-mail-chatter-topbar-log-note-button");

                assert.containsOnce(target, ".o-mail-composer");
                assert.containsOnce(target, "textarea.o-mail-composer-textarea");
                assert.hasAttrValue(
                    target.querySelector(".o-mail-composer-textarea"),
                    "placeholder",
                    "Log an internal note..."
                );
            }
        );

        QUnit.test(
            "composer text input: basic rendering when linked thread is a mail.channel",
            async function (assert) {
                assert.expect(2);

                const pyEnv = await startServer();
                const mailChanelId1 = pyEnv["mail.channel"].create({ name: "dofus-disco" });
                const { openDiscuss } = await start({
                    discuss: {
                        context: { active_id: mailChanelId1 },
                    },
                });
                await openDiscuss();
                assert.containsOnce(target, ".o-mail-composer");
                assert.containsOnce(target, "textarea.o-mail-composer-textarea");
            }
        );

        QUnit.test(
            "composer text input placeholder should contain channel name when thread does not have specific correspondent",
            async function (assert) {
                assert.expect(1);

                const pyEnv = await startServer();
                const mailChannelId1 = pyEnv["mail.channel"].create({
                    channel_type: "channel",
                    name: "General",
                });
                const { openDiscuss } = await start({
                    discuss: {
                        context: { active_id: mailChannelId1 },
                    },
                });
                await openDiscuss();
                assert.hasAttrValue(
                    target.querySelector(".o-mail-composer-textarea"),
                    "placeholder",
                    "Message #General…"
                );
            }
        );

        QUnit.test("add an emoji", async function (assert) {
            assert.expect(1);

            const pyEnv = await startServer();
            const mailChanelId1 = pyEnv["mail.channel"].create({ name: "swamp-safari" });
            const { click, openDiscuss } = await start({
                discuss: {
                    context: { active_id: mailChanelId1 },
                },
            });
            await openDiscuss();
            await click("i[aria-label='Emojis']");
            await click(".o-emoji[data-codepoints='😤']");
            assert.strictEqual(
                target.querySelector(".o-mail-composer-textarea").value,
                "😤",
                "emoji should be inserted in the composer text input"
            );
        });

        QUnit.test("add an emoji after some text", async function (assert) {
            assert.expect(2);

            const pyEnv = await startServer();
            const mailChanelId1 = pyEnv["mail.channel"].create({ name: "beyblade-room" });
            const { click, insertText, openDiscuss } = await start({
                discuss: {
                    context: { active_id: mailChanelId1 },
                },
            });
            await openDiscuss();
            await insertText(".o-mail-composer-textarea", "Blabla");
            assert.strictEqual(
                target.querySelector(".o-mail-composer-textarea").value,
                "Blabla",
                "composer text input should have text only initially"
            );

            await click("i[aria-label='Emojis']");
            await click(".o-emoji[data-codepoints='🤑']");
            assert.strictEqual(
                target.querySelector(".o-mail-composer-textarea").value,
                "Blabla🤑",
                "emoji should be inserted after the text"
            );
        });

        QUnit.test("add emoji replaces (keyboard) text selection", async function (assert) {
            assert.expect(2);

            const pyEnv = await startServer();
            const mailChanelId1 = pyEnv["mail.channel"].create({ name: "pétanque-tournament-14" });
            const { click, insertText, openDiscuss } = await start({
                discuss: {
                    context: { active_id: mailChanelId1 },
                },
            });
            await openDiscuss();
            const composerTextInputTextArea = document.querySelector(".o-mail-composer-textarea");
            await insertText(".o-mail-composer-textarea", "Blabla");
            assert.strictEqual(
                composerTextInputTextArea.value,
                "Blabla",
                "composer text input should have text only initially"
            );

            // simulate selection of all the content by keyboard
            composerTextInputTextArea.setSelectionRange(0, composerTextInputTextArea.value.length);
            await click("i[aria-label='Emojis']");
            await click('.o-emoji[data-codepoints="🤠"]');
            assert.strictEqual(
                document.querySelector(".o-mail-composer-textarea").value,
                "🤠",
                "whole text selection should have been replaced by emoji"
            );
        });

        QUnit.test(
            "selected text is not replaced after cancelling the selection",
            async function (assert) {
                assert.expect(2);

                const pyEnv = await startServer();
                const mailChanelId1 = pyEnv["mail.channel"].create({
                    name: "pétanque-tournament-14",
                });
                const { click, insertText, openDiscuss } = await start({
                    discuss: {
                        context: { active_id: mailChanelId1 },
                    },
                });
                await openDiscuss();
                const composerTextInputTextArea = document.querySelector(
                    ".o-mail-composer-textarea"
                );
                await insertText(".o-mail-composer-textarea", "Blabla");
                assert.strictEqual(
                    composerTextInputTextArea.value,
                    "Blabla",
                    "composer text input should have text only initially"
                );

                // simulate selection of all the content by keyboard
                composerTextInputTextArea.setSelectionRange(
                    0,
                    composerTextInputTextArea.value.length
                );
                document.querySelector(".o-mail-discuss-content").click();
                await nextTick();
                await click("i[aria-label='Emojis']");
                await click('.o-emoji[data-codepoints="🤠"]');
                assert.strictEqual(
                    document.querySelector(".o-mail-composer-textarea").value,
                    "Blabla🤠",
                    "whole text selection should have been replaced by emoji"
                );
            }
        );

        QUnit.test(
            "Selection is kept when changing channel and going back to original channel",
            async (assert) => {
                assert.expect(1);

                const pyEnv = await startServer();
                const firstChannelId = pyEnv["mail.channel"].create([
                    { name: "firstChannel" },
                    { name: "secondChannel" },
                ]);
                const { insertText, openDiscuss } = await start({
                    discuss: {
                        params: {
                            default_active_id: `mail.channel_${firstChannelId}`,
                        },
                    },
                });
                await openDiscuss();
                await insertText(".o-mail-composer-textarea", "Foo");
                // simulate selection of all the content by keyboard
                const composerTextArea = document.querySelector(".o-mail-composer-textarea");
                composerTextArea.setSelectionRange(0, composerTextArea.value.length);
                await nextTick();
                const [firstChannelBtn, secondChannelBtn] =
                    document.querySelectorAll(".o-mail-category-item");
                await afterNextRender(() => secondChannelBtn.click());
                await afterNextRender(() => firstChannelBtn.click());
                assert.ok(
                    composerTextArea.selectionStart === 0 &&
                        composerTextArea.selectionEnd === composerTextArea.value.length,
                    "Content of the text area should still be selected after switching channels"
                );
            }
        );

        QUnit.test(
            "click on emoji button, select emoji, then re-click on button should show emoji picker",
            async function (assert) {
                assert.expect(1);
                const pyEnv = await startServer();
                const mailChanelId1 = pyEnv["mail.channel"].create({
                    name: "roblox-skateboarding",
                });
                const { click, openDiscuss } = await start({
                    discuss: {
                        context: { active_id: mailChanelId1 },
                    },
                });
                await openDiscuss();
                await click("i[aria-label='Emojis']");
                await click(".o-emoji[data-codepoints='👺']");
                await click("i[aria-label='Emojis']");
                assert.containsOnce(target, ".o-mail-emoji-picker");
            }
        );

        QUnit.test(
            'do not send typing notification on typing "/" command',
            async function (assert) {
                assert.expect(1);

                const pyEnv = await startServer();
                const mailChannelId1 = pyEnv["mail.channel"].create({ name: "channel" });
                const { insertText, openDiscuss } = await start({
                    discuss: {
                        params: {
                            default_active_id: `mail.channel_${mailChannelId1}`,
                        },
                    },
                    async mockRPC(route, args) {
                        if (route === "/mail/channel/notify_typing") {
                            assert.step(`notify_typing:${args.is_typing}`);
                        }
                    },
                });
                await openDiscuss();

                await insertText(".o-mail-composer-textarea", "/");
                assert.verifySteps([], "No rpc done");
            }
        );

        QUnit.test('display partner mention suggestions on typing "@"', async function (assert) {
            const pyEnv = await startServer();

            const resPartnerId1 = pyEnv["res.partner"].create({
                email: "testpartner@odoo.com",
                name: "TestPartner",
            });
            const resPartnerId2 = pyEnv["res.partner"].create({
                email: "testpartner2@odoo.com",
                name: "TestPartner2",
            });
            pyEnv["res.users"].create({ partner_id: resPartnerId1 });
            const mailChannelId1 = pyEnv["mail.channel"].create({
                name: "general",
                channel_member_ids: [
                    [0, 0, { partner_id: pyEnv.currentPartnerId }],
                    [0, 0, { partner_id: resPartnerId1 }],
                    [0, 0, { partner_id: resPartnerId2 }],
                ],
            });
            const { insertText, openDiscuss } = await start({
                discuss: {
                    context: { active_id: mailChannelId1 },
                },
            });
            await openDiscuss();
            assert.containsNone(target, ".o-navigable-list--dropdown-item");

            await insertText(".o-mail-composer-textarea", "@");
            assert.containsOnce(target, ".o-navigable-list--dropdown-item");
        });

        QUnit.test("show other channel member in @ mention", async function (assert) {
            const pyEnv = await startServer();
            const resPartnerId = pyEnv["res.partner"].create({
                email: "testpartner@odoo.com",
                name: "TestPartner",
            });
            const mailChannelId1 = pyEnv["mail.channel"].create({
                name: "general",
                channel_member_ids: [
                    [0, 0, { partner_id: pyEnv.currentPartnerId }],
                    [0, 0, { partner_id: resPartnerId }],
                ],
            });
            const { click, insertText, openDiscuss } = await start({
                discuss: {
                    context: { active_id: mailChannelId1 },
                },
            });
            await openDiscuss();
            await click(`.o-mail-discuss-actions button[title="Show Member List"]`); // FIXME: load channel members
            await insertText(".o-mail-composer-textarea", "@");
            assert.containsOnce(target, ".o-navigable-list--dropdown-item:contains(TestPartner)");
        });

        QUnit.test("select @ mention insert mention text in composer", async function (assert) {
            const pyEnv = await startServer();
            const resPartnerId = pyEnv["res.partner"].create({
                email: "testpartner@odoo.com",
                name: "TestPartner",
            });
            const mailChannelId1 = pyEnv["mail.channel"].create({
                name: "general",
                channel_member_ids: [
                    [0, 0, { partner_id: pyEnv.currentPartnerId }],
                    [0, 0, { partner_id: resPartnerId }],
                ],
            });
            const { click, insertText, openDiscuss } = await start({
                discuss: {
                    context: { active_id: mailChannelId1 },
                },
            });
            await openDiscuss();
            await click(`.o-mail-discuss-actions button[title="Show Member List"]`); // FIXME: load channel members
            await insertText(".o-mail-composer-textarea", "@");
            await afterNextRender(() =>
                $(target).find(".o-navigable-list--dropdown-item:contains(TestPartner)").click()
            );
            assert.strictEqual(
                $(target).find(".o-mail-composer-textarea").val().trim(),
                "@TestPartner"
            );
        });

        QUnit.test("composer text input cleared on message post", async function (assert) {
            assert.expect(4);

            const pyEnv = await startServer();
            const mailChannelId1 = pyEnv["mail.channel"].create({ name: "au-secours-aidez-moi" });
            const { click, insertText, openDiscuss } = await start({
                discuss: {
                    context: { active_id: mailChannelId1 },
                },
                async mockRPC(route, args) {
                    if (route === "/mail/message/post") {
                        assert.step("message_post");
                    }
                },
            });
            await openDiscuss();
            // Type message
            await insertText(".o-mail-composer-textarea", "test message");
            assert.strictEqual(
                document.querySelector(`.o-mail-composer-textarea`).value,
                "test message",
                "should have inserted text content in editable"
            );

            // Send message
            await click(".o-mail-composer-send-button");
            assert.verifySteps(["message_post"]);
            assert.strictEqual(
                document.querySelector(`.o-mail-composer-textarea`).value,
                "",
                "should have no content in composer input after posting message"
            );
        });

        QUnit.test(
            "send message only once when button send is clicked twice quickly",
            async function (assert) {
                assert.expect(2);

                const pyEnv = await startServer();
                const mailChannelId1 = pyEnv["mail.channel"].create({ name: "nether-picnic" });
                const { insertText, openDiscuss } = await start({
                    discuss: {
                        context: { active_id: mailChannelId1 },
                    },
                    async mockRPC(route, args) {
                        if (route === "/mail/message/post") {
                            assert.step("message_post");
                        }
                    },
                });
                await openDiscuss();
                // Type message
                await insertText(".o-mail-composer-textarea", "test message");

                await afterNextRender(() => {
                    target.querySelector(".o-mail-composer-send-button").click();
                    target.querySelector(".o-mail-composer-send-button").click();
                });
                assert.verifySteps(["message_post"], "The message has been posted only once");
            }
        );

        QUnit.test(
            'send button on mail.channel should have "Send" as label',
            async function (assert) {
                assert.expect(1);

                const pyEnv = await startServer();
                const mailChannelId1 = pyEnv["mail.channel"].create({ name: "minecraft-wii-u" });
                const { openDiscuss } = await start({
                    discuss: {
                        context: { active_id: mailChannelId1 },
                    },
                });
                await openDiscuss();
                assert.strictEqual(
                    target.querySelector(".o-mail-composer-send-button").textContent.trim(),
                    "Send",
                    "Send button of mail.channel composer should have 'Send' as label"
                );
            }
        );

        QUnit.test(
            "composer textarea content is retained when changing channel then going back",
            async function (assert) {
                assert.expect(1);

                const pyEnv = await startServer();
                const [mailChannelId1] = pyEnv["mail.channel"].create([
                    { name: "minigolf-galaxy-iv" },
                    { name: "epic-shrek-lovers" },
                ]);
                const { insertText, openDiscuss } = await start({
                    discuss: {
                        context: { active_id: mailChannelId1 },
                    },
                });
                await openDiscuss();
                await insertText(
                    ".o-mail-composer-textarea",
                    "According to all known laws of aviation,"
                );

                await click($(target).find("span:contains('epic-shrek-lovers')")[0]);
                await click($(target).find("span:contains('minigolf-galaxy-iv')")[0]);
                assert.strictEqual(
                    target.querySelector(".o-mail-composer-textarea").value,
                    "According to all known laws of aviation,"
                );
            }
        );
    });
});
