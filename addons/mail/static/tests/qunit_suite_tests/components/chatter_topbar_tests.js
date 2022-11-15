/** @odoo-module **/

import {
    afterNextRender,
    nextAnimationFrame,
    start,
    startServer,
} from "@mail/../tests/helpers/test_utils";

import { makeTestPromise } from "web.test_utils";

QUnit.module("mail", {}, function () {
    QUnit.module("components", {}, function () {
        QUnit.module("chatter_topbar_tests.js");

        QUnit.skipRefactoring("base rendering", async function (assert) {
            assert.expect(7);

            const pyEnv = await startServer();
            const resPartnerId1 = pyEnv["res.partner"].create({});
            const { openView } = await start();
            await openView({
                res_id: resPartnerId1,
                res_model: "res.partner",
                views: [[false, "form"]],
            });

            assert.strictEqual(
                document.querySelectorAll(`.o_ChatterTopbar`).length,
                1,
                "should have a chatter topbar"
            );
            assert.strictEqual(
                document.querySelectorAll(`.o-mail-chatter-topbar-send-message-button`).length,
                1,
                "should have a send message button in chatter menu"
            );
            assert.strictEqual(
                document.querySelectorAll(`.o-mail-chatter-topbar-log-note-button`).length,
                1,
                "should have a log note button in chatter menu"
            );
            assert.strictEqual(
                document.querySelectorAll(`.o-mail-chatter-topbar-schedule-activity-button`).length,
                1,
                "should have a schedule activity button in chatter menu"
            );
            assert.strictEqual(
                document.querySelectorAll(`.o_ChatterTopbar_buttonAddAttachments`).length,
                1,
                "should have an attachments button in chatter menu"
            );
            assert.strictEqual(
                document.querySelectorAll(`.o_ChatterTopbar_buttonAttachmentsCountLoader`).length,
                0,
                "attachments button should not have a loader"
            );
            assert.strictEqual(
                document.querySelectorAll(`.o_ChatterTopbar_followerListMenu`).length,
                1,
                "should have a follower menu"
            );
        });

        QUnit.skipRefactoring("base disabled rendering", async function (assert) {
            assert.expect(6);

            const { openView } = await start();
            await openView({
                res_model: "res.partner",
                views: [[false, "form"]],
            });
            assert.strictEqual(
                document.querySelectorAll(`.o_ChatterTopbar`).length,
                1,
                "should have a chatter topbar"
            );
            assert.ok(
                document.querySelector(`.o-mail-chatter-topbar-send-message-button`).disabled,
                "send message button should be disabled"
            );
            assert.ok(
                document.querySelector(`.o-mail-chatter-topbar-log-note-button`).disabled,
                "log note button should be disabled"
            );
            assert.ok(
                document.querySelector(`.o-mail-chatter-topbar-schedule-activity-button`).disabled,
                "schedule activity should be disabled"
            );
            assert.ok(
                document.querySelector(`.o_ChatterTopbar_buttonAddAttachments`).disabled,
                "attachments button should be disabled"
            );
            assert.strictEqual(
                document.querySelectorAll(`.o_ChatterTopbar_buttonAttachmentsCountLoader`).length,
                0,
                "attachments button should not have a loader"
            );
        });

        QUnit.skipRefactoring("attachment loading is delayed", async function (assert) {
            assert.expect(4);

            const pyEnv = await startServer();
            const resPartnerId1 = pyEnv["res.partner"].create({});
            const { advanceTime, openView } = await start({
                hasTimeControl: true,
                loadingBaseDelayDuration: 100,
                async mockRPC(route) {
                    if (route.includes("/mail/thread/data")) {
                        await makeTestPromise(); // simulate long loading
                    }
                },
            });
            await openView({
                res_id: resPartnerId1,
                res_model: "res.partner",
                views: [[false, "form"]],
            });

            assert.strictEqual(
                document.querySelectorAll(`.o_ChatterTopbar`).length,
                1,
                "should have a chatter topbar"
            );
            assert.strictEqual(
                document.querySelectorAll(`.o_ChatterTopbar_buttonAddAttachments`).length,
                1,
                "should have an attachments button in chatter menu"
            );
            assert.strictEqual(
                document.querySelectorAll(`.o_ChatterTopbar_buttonAttachmentsCountLoader`).length,
                0,
                "attachments button should not have a loader yet"
            );

            await afterNextRender(async () => advanceTime(100));
            assert.strictEqual(
                document.querySelectorAll(`.o_ChatterTopbar_buttonAttachmentsCountLoader`).length,
                1,
                "attachments button should now have a loader"
            );
        });

        QUnit.skipRefactoring(
            "attachment counter while loading attachments",
            async function (assert) {
                assert.expect(4);

                const pyEnv = await startServer();
                const resPartnerId1 = pyEnv["res.partner"].create({});
                const { openView } = await start({
                    async mockRPC(route) {
                        if (route.includes("/mail/thread/data")) {
                            await makeTestPromise(); // simulate long loading
                        }
                    },
                });
                await openView({
                    res_id: resPartnerId1,
                    res_model: "res.partner",
                    views: [[false, "form"]],
                });

                assert.strictEqual(
                    document.querySelectorAll(`.o_ChatterTopbar`).length,
                    1,
                    "should have a chatter topbar"
                );
                assert.strictEqual(
                    document.querySelectorAll(`.o_ChatterTopbar_buttonAddAttachments`).length,
                    1,
                    "should have an attachments button in chatter menu"
                );
                assert.strictEqual(
                    document.querySelectorAll(`.o_ChatterTopbar_buttonAttachmentsCountLoader`)
                        .length,
                    1,
                    "attachments button should have a loader"
                );
                assert.strictEqual(
                    document.querySelectorAll(`.o_ChatterTopbar_buttonAttachmentsCount`).length,
                    0,
                    "attachments button should not have a counter"
                );
            }
        );

        QUnit.skipRefactoring(
            "attachment counter transition when attachments become loaded)",
            async function (assert) {
                assert.expect(6);

                const pyEnv = await startServer();
                const resPartnerId1 = pyEnv["res.partner"].create({});
                const attachmentPromise = makeTestPromise();
                const { openView } = await start({
                    async mockRPC(route) {
                        if (route.includes("/mail/thread/data")) {
                            await attachmentPromise;
                        }
                    },
                });
                await openView({
                    res_id: resPartnerId1,
                    res_model: "res.partner",
                    views: [[false, "form"]],
                });

                assert.strictEqual(
                    document.querySelectorAll(`.o_ChatterTopbar`).length,
                    1,
                    "should have a chatter topbar"
                );
                assert.strictEqual(
                    document.querySelectorAll(`.o_ChatterTopbar_buttonAddAttachments`).length,
                    1,
                    "should have an attachments button in chatter menu"
                );
                assert.strictEqual(
                    document.querySelectorAll(`.o_ChatterTopbar_buttonAttachmentsCountLoader`)
                        .length,
                    1,
                    "attachments button should have a loader"
                );
                assert.strictEqual(
                    document.querySelectorAll(`.o_ChatterTopbar_buttonAttachmentsCount`).length,
                    0,
                    "attachments button should not have a counter"
                );

                await afterNextRender(() => attachmentPromise.resolve());
                assert.strictEqual(
                    document.querySelectorAll(`.o_ChatterTopbar_buttonAddAttachments`).length,
                    1,
                    "should have an attachments button in chatter menu"
                );
                assert.strictEqual(
                    document.querySelectorAll(`.o_ChatterTopbar_buttonAttachmentsCountLoader`)
                        .length,
                    0,
                    "attachments button should not have a loader"
                );
            }
        );

        QUnit.skipRefactoring("attachment counter without attachments", async function (assert) {
            assert.expect(2);

            const pyEnv = await startServer();
            const resPartnerId1 = pyEnv["res.partner"].create({});
            const { openView } = await start();
            await openView({
                res_id: resPartnerId1,
                res_model: "res.partner",
                views: [[false, "form"]],
            });

            assert.strictEqual(
                document.querySelectorAll(`.o_ChatterTopbar`).length,
                1,
                "should have a chatter topbar"
            );
            assert.strictEqual(
                document.querySelectorAll(`.o_ChatterTopbar_buttonAddAttachments`).length,
                1,
                "should have an attachments button in chatter menu"
            );
        });

        QUnit.skipRefactoring("attachment counter with attachments", async function (assert) {
            assert.expect(4);

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

            assert.strictEqual(
                document.querySelectorAll(`.o_ChatterTopbar`).length,
                1,
                "should have a chatter topbar"
            );
            assert.strictEqual(
                document.querySelectorAll(`.o_ChatterTopbar_buttonToggleAttachments`).length,
                1,
                "should have an attachments button in chatter menu"
            );
            assert.strictEqual(
                document.querySelectorAll(`.o_ChatterTopbar_buttonAttachmentsCount`).length,
                1,
                "attachments button should have a counter"
            );
            assert.strictEqual(
                document.querySelector(`.o_ChatterTopbar_buttonAttachmentsCount`).textContent,
                "2",
                'attachment counter content should contain "2 files"'
            );
        });

        QUnit.skipRefactoring(
            "composer state conserved when clicking on another topbar button",
            async function (assert) {
                assert.expect(8);

                const pyEnv = await startServer();
                const resPartnerId1 = pyEnv["res.partner"].create({});
                const { click, openView } = await start();
                await openView({
                    res_id: resPartnerId1,
                    res_model: "res.partner",
                    views: [[false, "form"]],
                });

                assert.containsOnce(
                    document.body,
                    `.o_ChatterTopbar`,
                    "should have a chatter topbar"
                );
                assert.containsOnce(
                    document.body,
                    `.o-mail-chatter-topbar-send-message-button`,
                    "should have a send message button in chatter menu"
                );
                assert.containsOnce(
                    document.body,
                    `.o-mail-chatter-topbar-log-note-button`,
                    "should have a log note button in chatter menu"
                );
                assert.containsOnce(
                    document.body,
                    `.o_ChatterTopbar_buttonAddAttachments`,
                    "should have an attachments button in chatter menu"
                );

                await click(`.o-mail-chatter-topbar-log-note-button`);
                assert.containsOnce(
                    document.body,
                    `.o-mail-chatter-topbar-log-note-button.o-active`,
                    "log button should now be active"
                );
                assert.containsNone(
                    document.body,
                    `.o-mail-chatter-topbar-send-message-button.o-active`,
                    "send message button should not be active"
                );

                document.querySelector(`.o_ChatterTopbar_buttonAddAttachments`).click();
                await nextAnimationFrame();
                assert.containsOnce(
                    document.body,
                    `.o-mail-chatter-topbar-log-note-button.o-active`,
                    "log button should still be active"
                );
                assert.containsNone(
                    document.body,
                    `.o-mail-chatter-topbar-send-message-button.o-active`,
                    "send message button should still be not active"
                );
            }
        );

        QUnit.skipRefactoring("rendering with multiple partner followers", async function (assert) {
            assert.expect(7);

            const pyEnv = await startServer();
            const [resPartnerId1, resPartnerId2, resPartnerId3] = pyEnv["res.partner"].create([
                { name: "resPartner1" },
                { name: "resPartner2" },
                { message_follower_ids: [1, 2] },
            ]);
            pyEnv["mail.followers"].create([
                {
                    name: "Jean Michang",
                    partner_id: resPartnerId2,
                    res_id: resPartnerId3,
                    res_model: "res.partner",
                },
                {
                    name: "Eden Hazard",
                    partner_id: resPartnerId1,
                    res_id: resPartnerId3,
                    res_model: "res.partner",
                },
            ]);
            const { click, openView } = await start();
            await openView({
                res_id: resPartnerId3,
                res_model: "res.partner",
                views: [[false, "form"]],
            });

            assert.containsOnce(
                document.body,
                ".o_FollowerListMenuView",
                "should have followers menu component"
            );
            assert.containsOnce(
                document.body,
                ".o_FollowerListMenuView_buttonFollowers",
                "should have followers button"
            );

            await click(".o_FollowerListMenuView_buttonFollowers");
            assert.containsOnce(
                document.body,
                ".o_FollowerListMenuView_dropdown",
                "followers dropdown should be opened"
            );
            assert.containsN(
                document.body,
                ".o_FollowerView",
                2,
                "exactly two followers should be listed"
            );
            assert.containsN(
                document.body,
                ".o_FollowerView_name",
                2,
                "exactly two follower names should be listed"
            );
            assert.strictEqual(
                document.querySelectorAll(".o_FollowerView_name")[0].textContent.trim(),
                "Jean Michang",
                "first follower is 'Jean Michang'"
            );
            assert.strictEqual(
                document.querySelectorAll(".o_FollowerView_name")[1].textContent.trim(),
                "Eden Hazard",
                "second follower is 'Eden Hazard'"
            );
        });

        QUnit.skipRefactoring("log note/send message switching", async function (assert) {
            assert.expect(8);

            const pyEnv = await startServer();
            const resPartnerId1 = pyEnv["res.partner"].create({});
            const { click, openView } = await start();
            await openView({
                res_id: resPartnerId1,
                res_model: "res.partner",
                views: [[false, "form"]],
            });
            assert.containsOnce(
                document.body,
                ".o-mail-chatter-topbar-send-message-button",
                "should have a 'Send Message' button"
            );
            assert.doesNotHaveClass(
                document.querySelector(".o-mail-chatter-topbar-send-message-button"),
                "o-active",
                "'Send Message' button should not be active"
            );
            assert.containsOnce(
                document.body,
                ".o-mail-chatter-topbar-log-note-button",
                "should have a 'Log Note' button"
            );
            assert.doesNotHaveClass(
                document.querySelector(".o-mail-chatter-topbar-log-note-button"),
                "o-active",
                "'Log Note' button should not be active"
            );

            await click(`.o-mail-chatter-topbar-send-message-button`);
            assert.hasClass(
                document.querySelector(".o-mail-chatter-topbar-send-message-button"),
                "o-active",
                "'Send Message' button should be active"
            );
            assert.doesNotHaveClass(
                document.querySelector(".o-mail-chatter-topbar-log-note-button"),
                "o-active",
                "'Log Note' button should not be active"
            );

            await click(`.o-mail-chatter-topbar-log-note-button`);
            assert.doesNotHaveClass(
                document.querySelector(".o-mail-chatter-topbar-send-message-button"),
                "o-active",
                "'Send Message' button should not be active"
            );
            assert.hasClass(
                document.querySelector(".o-mail-chatter-topbar-log-note-button"),
                "o-active",
                "'Log Note' button should be active"
            );
        });

        QUnit.skipRefactoring("log note toggling", async function (assert) {
            assert.expect(4);

            const pyEnv = await startServer();
            const resPartnerId1 = pyEnv["res.partner"].create({});
            const { click, openView } = await start();
            await openView({
                res_id: resPartnerId1,
                res_model: "res.partner",
                views: [[false, "form"]],
            });
            assert.containsOnce(
                document.body,
                ".o-mail-chatter-topbar-log-note-button",
                "should have a 'Log Note' button"
            );
            assert.doesNotHaveClass(
                document.querySelector(".o-mail-chatter-topbar-log-note-button"),
                "o-active",
                "'Log Note' button should not be active"
            );

            await click(`.o-mail-chatter-topbar-log-note-button`);
            assert.hasClass(
                document.querySelector(".o-mail-chatter-topbar-log-note-button"),
                "o-active",
                "'Log Note' button should be active"
            );

            await click(`.o-mail-chatter-topbar-log-note-button`);
            assert.doesNotHaveClass(
                document.querySelector(".o-mail-chatter-topbar-log-note-button"),
                "o-active",
                "'Log Note' button should not be active"
            );
        });

        QUnit.skipRefactoring("send message toggling", async function (assert) {
            assert.expect(4);

            const pyEnv = await startServer();
            const resPartnerId1 = pyEnv["res.partner"].create({});
            const { click, openView } = await start();
            await openView({
                res_id: resPartnerId1,
                res_model: "res.partner",
                views: [[false, "form"]],
            });
            assert.containsOnce(
                document.body,
                ".o-mail-chatter-topbar-send-message-button",
                "should have a 'Send Message' button"
            );
            assert.doesNotHaveClass(
                document.querySelector(".o-mail-chatter-topbar-send-message-button"),
                "o-active",
                "'Send Message' button should not be active"
            );

            await click(`.o-mail-chatter-topbar-send-message-button`);
            assert.hasClass(
                document.querySelector(".o-mail-chatter-topbar-send-message-button"),
                "o-active",
                "'Send Message' button should be active"
            );

            await click(`.o-mail-chatter-topbar-send-message-button`);
            assert.doesNotHaveClass(
                document.querySelector(".o-mail-chatter-topbar-send-message-button"),
                "o-active",
                "'Send Message' button should not be active"
            );
        });
    });
});
