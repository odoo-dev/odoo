/** @odoo-module **/

import { ActivityMenu } from "@mail/new/activity/activity_menu";
import { click, getFixture, mount } from "@web/../tests/helpers/utils";
import { makeTestEnv, TestServer } from "../helpers/helpers";

let target;

QUnit.module("activity menu", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test("activity menu: no activity", async (assert) => {
    const server = new TestServer();
    const env = makeTestEnv((route, params) => server.rpc(route, params));
    await mount(ActivityMenu, target, { env });
    await click(document.querySelector("i[aria-label='Activities']").closest(".dropdown-toggle"));
    assert.containsOnce(target, ".o-mail-no-activity");
});
