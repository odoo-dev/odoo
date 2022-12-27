/** @odoo-module **/

import { click, start, startServer } from "@mail/../tests/helpers/test_utils";
import { getFixture, patchWithCleanup } from "@web/../tests/helpers/utils";
import { browser } from "@web/core/browser/browser";

let target;

QUnit.module("messaging menu", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test("should have messaging menu button in systray", async (assert) => {
    await start();
    assert.containsOnce(target, ".o_menu_systray i[aria-label='Messages']");
    assert.containsNone(target, ".o-mail-messaging-menu", "messaging menu closed by default");
    assert.hasClass(
        target.querySelector(".o_menu_systray i[aria-label='Messages']"),
        "fa-comments"
    );
});

QUnit.test("messaging menu should have topbar buttons", async function (assert) {
    await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    assert.containsOnce(target, ".o-mail-messaging-menu");
    assert.containsN(target, ".o-mail-messaging-menu-topbar button", 4);
    assert.containsOnce(target, ".o-mail-messaging-menu-topbar button:contains(All)");
    assert.containsOnce(target, ".o-mail-messaging-menu-topbar button:contains(Chat)");
    assert.containsOnce(target, ".o-mail-messaging-menu-topbar button:contains(Channels)");
    assert.containsOnce(target, ".o-mail-messaging-menu-topbar button:contains(New Message)");
    assert.hasClass(
        $(target).find(".o-mail-messaging-menu-topbar button:contains(All)"),
        "fw-bolder",
        "'all' tab button should be active"
    );
    assert.doesNotHaveClass(
        $(target).find(".o-mail-messaging-menu-topbar button:contains(Chat)"),
        "fw-bolder"
    );
    assert.doesNotHaveClass(
        $(target).find(".o-mail-messaging-menu-topbar button:contains(Channels)"),
        "fw-bolder"
    );
});

QUnit.test("counter is taking into account failure notification", async function (assert) {
    patchWithCleanup(browser, {
        Notification: {
            ...browser.Notification,
            permission: "denied",
        },
    });
    const pyEnv = await startServer();
    const mailChannelId1 = pyEnv["mail.channel"].create({});
    const mailMessageId1 = pyEnv["mail.message"].create({
        model: "mail.channel",
        res_id: mailChannelId1,
    });
    const [mailChannelMemberId] = pyEnv["mail.channel.member"].search([
        ["channel_id", "=", mailChannelId1],
        ["partner_id", "=", pyEnv.currentPartnerId],
    ]);
    pyEnv["mail.channel.member"].write([mailChannelMemberId], {
        seen_message_id: mailMessageId1,
    });
    pyEnv["mail.notification"].create({
        mail_message_id: mailMessageId1,
        notification_status: "exception",
        notification_type: "email",
    });
    await start();
    assert.containsOnce(target, ".o-mail-messaging-menu-counter");
    assert.strictEqual($(target).find(".o-mail-messaging-menu-counter.badge").text(), "1");
});

QUnit.test("rendering with OdooBot has a request (default)", async function (assert) {
    patchWithCleanup(browser, {
        Notification: {
            ...browser.Notification,
            permission: "default",
        },
    });
    await start();
    assert.containsOnce(target, ".o-mail-messaging-menu-counter");
    assert.strictEqual($(target).find(".o-mail-messaging-menu-counter").text(), "1");
});

QUnit.test("rendering without OdooBot has a request (denied)", async function (assert) {
    patchWithCleanup(browser, {
        Notification: {
            permission: "denied",
        },
    });
    await start();
    assert.strictEqual($(target).find(".o-mail-messaging-menu-counter").text(), "0");
});

QUnit.test("rendering without OdooBot has a request (accepted)", async function (assert) {
    patchWithCleanup(browser, {
        Notification: {
            permission: "granted",
        },
    });
    await start();
    assert.strictEqual($(target).find(".o-mail-messaging-menu-counter").text(), "0");
});

QUnit.test("Is closed after clicking on new message", async function (assert) {
    await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    await click(".o-mail-messaging-menu-new-message");
    assert.containsNone(target, ".o-mail-messaging-menu");
});

QUnit.test("no 'New Message' button when discuss is open", async function (assert) {
    const { openDiscuss, openView } = await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    assert.containsOnce(target, ".o-mail-messaging-menu-topbar button:contains(New Message)");

    await openDiscuss();
    assert.containsNone(target, ".o-mail-messaging-menu-topbar button:contains(New Message)");

    await openView({
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-messaging-menu-topbar button:contains(New Message)");

    await openDiscuss();
    assert.containsNone(target, ".o-mail-messaging-menu-topbar button:contains(New Message)");
});
