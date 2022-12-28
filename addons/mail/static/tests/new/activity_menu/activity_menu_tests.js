/** @odoo-module **/

import { click, start, startServer } from "@mail/../tests/helpers/test_utils";
import { getFixture } from "@web/../tests/helpers/utils";

const ACTIVITY_MENU_SELECTOR = ".o_menu_systray .dropdown-toggle:has(i[aria-label='Activities'])";
const ACTIVITY_MENU_COUNTER_SELECTOR = `${ACTIVITY_MENU_SELECTOR} .badge`;
let target;

QUnit.module("activity menu", {
    async beforeEach() {
        target = getFixture();
    },
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
