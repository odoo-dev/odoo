/* @odoo-module */

import { click, start, startServer } from "@mail/../tests/helpers/test_utils";
import { patchUiSize, SIZES } from "@mail/../tests/helpers/patch_ui_size";
import { getFixture } from "@web/../tests/helpers/utils";

let target;
QUnit.module("Form renderer", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test(
    "schedule activities on draft record should prompt with scheduling an activity (proceed with action)",
    async function (assert) {
        const pyEnv = await startServer();
        const partnerId = pyEnv["res.partner"].create({});
        const views = {
            "res.partner,false,form": `
                <form string="Partners">
                    <sheet>
                        <field name="name"/>
                    </sheet>
                    <div class="oe_chatter">
                        <field name="activity_ids"/>
                    </div>
                </form>`,
        };
        const { openView } = await start({ serverData: { views } });
        await openView({
            res_id: partnerId,
            res_model: "res.partner",
            views: [[false, "form"]],
        });
        await click("button:contains(Activities)");
        assert.containsOnce(target, ".o_dialog:contains(Schedule Activity)");
    }
);

QUnit.test("Form view not scrolled when switching record", async function (assert) {
    const pyEnv = await startServer();
    const [partnerId_1, partnerId_2] = pyEnv["res.partner"].create([
        {
            description: [...Array(60).keys()].join("\n"),
            display_name: "Partner 1",
        },
        { display_name: "Partner 2" },
    ]);
    const messages = [...Array(60).keys()].map((id) => {
        return {
            model: "res.partner",
            res_id: id % 2 ? partnerId_1 : partnerId_2,
        };
    });
    pyEnv["mail.message"].create(messages);
    const views = {
        "res.partner,false,form": `
            <form string="Partners">
                <sheet>
                    <field name="name"/>
                    <field name="description"/>
                </sheet>
                <div class="oe_chatter">
                    <field name="message_ids"/>
                </div>
            </form>`,
    };
    patchUiSize({ size: SIZES.LG });
    const { openView } = await start({ serverData: { views } });
    await openView(
        {
            res_model: "res.partner",
            res_id: partnerId_1,
            views: [[false, "form"]],
        },
        { resIds: [partnerId_1, partnerId_2] }
    );
    const controllerContentEl = target.querySelector(".o_content");
    assert.strictEqual(target.querySelector(".breadcrumb-item.active").textContent, "Partner 1");
    assert.strictEqual(controllerContentEl.scrollTop, 0);
    controllerContentEl.scrollTop = 150;

    await click(".o_pager_next");
    assert.strictEqual(target.querySelector(".breadcrumb-item.active").textContent, "Partner 2");
    assert.strictEqual(controllerContentEl.scrollTop, 0);

    await click(".o_pager_previous");
    assert.strictEqual(controllerContentEl.scrollTop, 0);
});

QUnit.test(
    "Attachments that have been unlinked from server should be visually unlinked from record",
    async function (assert) {
        // Attachments that have been fetched from a record at certain time and then
        // removed from the server should be reflected on the UI when the current
        // partner accesses this record again.
        const pyEnv = await startServer();
        const [partnerId_1, partnerId_2] = pyEnv["res.partner"].create([
            { display_name: "Partner1" },
            { display_name: "Partner2" },
        ]);
        const [attachmentId_1] = pyEnv["ir.attachment"].create([
            {
                mimetype: "text.txt",
                res_id: partnerId_1,
                res_model: "res.partner",
            },
            {
                mimetype: "text.txt",
                res_id: partnerId_1,
                res_model: "res.partner",
            },
        ]);
        const views = {
            "res.partner,false,form": `
                <form string="Partners">
                    <sheet>
                        <field name="name"/>
                    </sheet>
                    <div class="oe_chatter">
                        <field name="message_ids"/>
                    </div>
                </form>`,
        };
        const { openView } = await start({ serverData: { views } });
        await openView(
            {
                res_model: "res.partner",
                res_id: partnerId_1,
                views: [[false, "form"]],
            },
            {
                resId: partnerId_1,
                resIds: [partnerId_1, partnerId_2],
            }
        );
        assert.containsOnce(target, ".o-mail-chatter button:contains(2)");

        // The attachment links are updated on (re)load,
        // so using pager is a way to reload the record "Partner1".
        await click(".o_pager_next");
        // Simulate unlinking attachment 1 from Partner 1.
        pyEnv["ir.attachment"].write([attachmentId_1], { res_id: 0 });
        await click(".o_pager_previous");
        assert.containsOnce(target, ".o-mail-chatter button:contains(1)");
    }
);
