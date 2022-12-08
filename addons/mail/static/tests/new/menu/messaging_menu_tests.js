/** @odoo-module **/

import { start } from "@mail/../tests/helpers/test_utils";

import { getFixture } from "@web/../tests/helpers/utils";

let target;

QUnit.module("mail", (hooks) => {
    hooks.beforeEach(async () => {
        target = getFixture();
    });

    QUnit.module("components", {}, function () {
        QUnit.module("messaging_menu_tests.js");

        QUnit.test("should have messaging menu button in systray", async (assert) => {
            await start();
            assert.containsOnce(target, ".o_menu_systray i[aria-label='Messages']");
            assert.containsNone(
                target,
                ".o-mail-messaging-menu",
                "messaging menu closed by default"
            );
            assert.hasClass(
                target.querySelector(".o_menu_systray i[aria-label='Messages']"),
                "fa-comments",
                "should have 'comments' icon on clickable element in messaging menu"
            );
        });

        QUnit.test("messaging menu should have topbar buttons", async function (assert) {
            const { click } = await start();
            await click(".o_menu_systray i[aria-label='Messages']");
            assert.containsOnce(target, ".o-mail-messaging-menu");
            assert.containsN(
                target,
                ".o-mail-messaging-menu-topbar button",
                3,
                "should have 3 tab buttons to filter items in the header"
            );
            assert.containsOnce(target, ".o-mail-messaging-menu-topbar button:contains(All)");
            assert.containsOnce(target, ".o-mail-messaging-menu-topbar button:contains(Chat)");
            assert.containsOnce(target, ".o-mail-messaging-menu-topbar button:contains(Channels)");
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
    });
});
