/** @odoo-module **/

import { click, start, startServer } from "@mail/../tests/helpers/test_utils";
import { ActivityMenu } from "@mail/new/activity/activity_menu";
import { click as webClick, getFixture, mount } from "@web/../tests/helpers/utils";
import { makeTestEnv, TestServer } from "../helpers/helpers";

const ACTIVITY_MENU_SELECTOR = ".o_menu_systray .dropdown-toggle:has(i[aria-label='Activities'])";
const ACTIVITY_MENU_COUNTER_SELECTOR = `${ACTIVITY_MENU_SELECTOR} .badge`;

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
    await webClick(
        document.querySelector("i[aria-label='Activities']").closest(".dropdown-toggle")
    );
    assert.containsOnce(target, ".o-mail-no-activity");
});

QUnit.test("should update activities when opening the activity menu", async (assert) => {
    const pyEnv = await startServer();
    await start();
    assert.strictEqual($(target).find(ACTIVITY_MENU_COUNTER_SELECTOR).text(), "");
    const resPartnerId1 = pyEnv["res.partner"].create({});
    pyEnv["mail.activity"].create({
        res_id: resPartnerId1,
        res_model: "res.partner",
    });
    await click(ACTIVITY_MENU_SELECTOR);
    assert.strictEqual($(target).find(ACTIVITY_MENU_COUNTER_SELECTOR).text(), "1");
});
