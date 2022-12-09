/** @odoo-module **/

import { Sidebar } from "@mail/new/discuss/sidebar";
import { click, getFixture, mount, patchWithCleanup } from "@web/../tests/helpers/utils";
import { browser } from "@web/core/browser/browser";
import { makeTestEnv, TestServer } from "../helpers/helpers";

let target;

QUnit.module("discuss sidebar", {
    async beforeEach() {
        target = getFixture();
        // for autocomplete stuff
        patchWithCleanup(browser, {
            setTimeout: (fn) => fn(),
        });
    },
});

QUnit.test("toggling category button hide category items", async (assert) => {
    const server = new TestServer();
    server.addChannel(43, "abc");
    const env = makeTestEnv((route, params) => server.rpc(route, params));
    await mount(Sidebar, target, { env });

    assert.containsOnce(target, "button.o-active:contains('Inbox')");
    assert.containsN(target, ".o-mail-category-item", 1);
    await click(target.querySelector(".o-mail-category-icon"));
    assert.containsNone(target, ".o-mail-category-item");
});

QUnit.test("toggling category button does not hide active category items", async (assert) => {
    const server = new TestServer();
    server.addChannel(43, "abc");
    server.addChannel(46, "def");
    const env = makeTestEnv((route, params) => server.rpc(route, params));
    env.services["mail.messaging"].state.discuss.threadId = 43; // #abc is active

    await mount(Sidebar, target, { env });
    assert.containsN(target, ".o-mail-category-item", 2);
    assert.containsOnce(target, ".o-mail-category-item.o-active");
    await click(target.querySelector(".o-mail-category-icon"));
    assert.containsOnce(target, ".o-mail-category-item");
    assert.containsOnce(target, ".o-mail-category-item.o-active");
});
