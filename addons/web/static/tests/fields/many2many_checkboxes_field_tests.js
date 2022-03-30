/** @odoo-module **/

import { click, triggerEvent } from "../helpers/utils";
import { makeView, setupViewRegistries } from "../views/helpers";

let serverData;

QUnit.module("Fields", (hooks) => {
    hooks.beforeEach(() => {
        serverData = {
            models: {
                partner: {
                    fields: {
                        display_name: { string: "Displayed name", type: "char" },
                        int_field: { string: "int_field", type: "integer", sortable: true },
                        timmy: { string: "pokemon", type: "many2many", relation: "partner_type" },
                    },
                    records: [
                        {
                            id: 1,
                            display_name: "first record",
                            int_field: 10,
                        },
                    ],
                    onchanges: {},
                },
                partner_type: {
                    fields: {
                        name: { string: "Partner Type", type: "char" },
                        color: { string: "Color index", type: "integer" },
                    },
                    records: [
                        { id: 12, display_name: "gold", color: 2 },
                        { id: 14, display_name: "silver", color: 5 },
                    ],
                },
            },
        };

        setupViewRegistries();
    });

    QUnit.module("Many2ManyCheckBoxesField");

    QUnit.test("Many2ManyCheckBoxesField", async function (assert) {
        assert.expect(10);

        serverData.models.partner.records[0].timmy = [12];
        const form = await makeView({
            type: "form",
            resModel: "partner",
            resId: 1,
            serverData,
            arch: `
                <form>
                    <group>
                        <field name="timmy" widget="many2many_checkboxes" />
                    </group>
                </form>
            `,
        });

        assert.containsN(
            form.el,
            "div.o_field_widget div.custom-checkbox",
            2,
            "should have fetched and displayed the 2 values of the many2many"
        );

        let checkboxes = form.el.querySelectorAll("div.o_field_widget div.custom-checkbox input");
        assert.ok(checkboxes[0].checked, "first checkbox should be checked");
        assert.notOk(checkboxes[1].checked, "second checkbox should not be checked");

        assert.containsN(
            form.el,
            "div.o_field_widget div.custom-checkbox input:disabled",
            2,
            "the checkboxes should not be disabled"
        );

        await click(form.el, ".o_form_button_edit");

        assert.containsNone(
            form.el,
            "div.o_field_widget div.custom-checkbox input:disabled",
            "the checkboxes should not be disabled"
        );

        // add a m2m value by clicking on input
        checkboxes = form.el.querySelectorAll("div.o_field_widget div.custom-checkbox input");
        await click(checkboxes[1]);
        await click(form.el, ".o_form_button_save");
        assert.deepEqual(
            serverData.models.partner.records[0].timmy,
            [12, 14],
            "should have added the second element to the many2many"
        );
        assert.containsN(form, "input:checked", 2, "both checkboxes should be checked");

        // remove a m2m value by clinking on label
        await click(form.el, ".o_form_button_edit");
        await click(form.el.querySelector("div.o_field_widget div.custom-checkbox > label"));
        await click(form.el, ".o_form_button_save");
        assert.deepEqual(
            serverData.models.partner.records[0].timmy,
            [14],
            "should have removed the first element to the many2many"
        );
        checkboxes = form.el.querySelectorAll("div.o_field_widget div.custom-checkbox input");
        assert.notOk(checkboxes[0].checked, "first checkbox should be checked");
        assert.ok(checkboxes[1].checked, "second checkbox should not be checked");
    });

    QUnit.test("Many2ManyCheckBoxesField (readonly)", async function (assert) {
        assert.expect(7);

        serverData.models.partner.records[0].timmy = [12];
        const form = await makeView({
            type: "form",
            resModel: "partner",
            resId: 1,
            serverData,
            arch: `
                <form>
                    <group>
                        <field name="timmy" widget="many2many_checkboxes" attrs="{'readonly': true}" />
                    </group>
                </form>
            `,
        });

        assert.containsN(
            form.el,
            "div.o_field_widget div.custom-checkbox",
            2,
            "should have fetched and displayed the 2 values of the many2many"
        );

        assert.ok(
            form.el.querySelector("div.o_field_widget div.custom-checkbox input").checked,
            "first checkbox should be checked"
        );
        assert.notOk(
            form.el.querySelectorAll("div.o_field_widget div.custom-checkbox input")[1].checked,
            "second checkbox should not be checked"
        );

        assert.containsN(
            form.el,
            "div.o_field_widget div.custom-checkbox input:disabled",
            2,
            "the checkboxes should be disabled"
        );

        await click(form.el, ".o_form_button_edit");

        assert.containsN(
            form.el,
            "div.o_field_widget div.custom-checkbox input:disabled",
            2,
            "the checkboxes should be disabled"
        );

        await click(form.el.querySelectorAll("div.o_field_widget div.custom-checkbox > label")[1]);

        assert.ok(
            form.el.querySelector("div.o_field_widget div.custom-checkbox input").checked,
            "first checkbox should be checked"
        );
        assert.notOk(
            form.el.querySelectorAll("div.o_field_widget div.custom-checkbox input")[1].checked,
            "second checkbox should not be checked"
        );
    });

    QUnit.test(
        "Many2ManyCheckBoxesField: start non empty, then remove twice",
        async function (assert) {
            assert.expect(2);

            serverData.models.partner.records[0].timmy = [12, 14];
            const form = await makeView({
                type: "form",
                resModel: "partner",
                resId: 1,
                serverData,
                arch: `
                    <form>
                        <group>
                            <field name="timmy" widget="many2many_checkboxes" />
                        </group>
                    </form>
                `,
            });

            await click(form.el, ".o_form_button_edit");

            await click(
                form.el.querySelectorAll("div.o_field_widget div.custom-checkbox input")[0]
            );
            await click(
                form.el.querySelectorAll("div.o_field_widget div.custom-checkbox input")[1]
            );
            await click(form.el, ".o_form_button_save");
            assert.notOk(
                form.el.querySelectorAll("div.o_field_widget div.custom-checkbox input")[0].checked,
                "first checkbox should not be checked"
            );
            assert.notOk(
                form.el.querySelectorAll("div.o_field_widget div.custom-checkbox input")[1].checked,
                "second checkbox should not be checked"
            );
        }
    );

    QUnit.test(
        "Many2ManyCheckBoxesField: values are updated when domain changes",
        async function (assert) {
            assert.expect(5);

            const form = await makeView({
                type: "form",
                resModel: "partner",
                resId: 1,
                serverData,
                arch: `
                    <form>
                        <field name="int_field" />
                        <field name="timmy" widget="many2many_checkboxes" domain="[['id', '>', int_field]]" />
                    </form>
                `,
            });

            await click(form.el, ".o_form_button_edit");

            assert.strictEqual(
                form.el.querySelector(".o_field_widget[name='int_field'] input").value,
                "10"
            );
            assert.containsN(form.el, ".o_field_widget[name='timmy'] .custom-checkbox", 2);
            assert.strictEqual(
                form.el.querySelector(".o_field_widget[name='timmy']").textContent,
                "goldsilver"
            );

            const input = form.el.querySelector(".o_field_widget[name='int_field'] input");
            input.value = 13;
            await triggerEvent(input, null, "change");

            assert.containsOnce(form.el, ".o_field_widget[name='timmy'] .custom-checkbox");
            assert.strictEqual(
                form.el.querySelector(".o_field_widget[name='timmy']").textContent,
                "silver"
            );
        }
    );

    QUnit.test("Many2ManyCheckBoxesField with 40+ values", async function (assert) {
        // 40 is the default limit for x2many fields. However, the many2many_checkboxes is a
        // special field that fetches its data through the fetchSpecialData mechanism, and it
        // uses the name_search server-side limit of 100. This test comes with a fix for a bug
        // that occurred when the user (un)selected a checkbox that wasn't in the 40 first checkboxes,
        // because the piece of data corresponding to that checkbox hadn't been processed by the
        // BasicModel, whereas the code handling the change assumed it had.
        assert.expect(3);

        const records = [];
        for (let id = 1; id <= 90; id++) {
            records.push({
                id,
                display_name: `type ${id}`,
                color: id % 7,
            });
        }
        serverData.models.partner_type.records = records;
        serverData.models.partner.records[0].timmy = records.map((r) => r.id);

        const form = await makeView({
            type: "form",
            resModel: "partner",
            resId: 1,
            serverData,
            arch: `
                <form>
                    <field name="timmy" widget="many2many_checkboxes" />
                </form>
            `,
            mockRPC(route, { args, method }) {
                if (method === "write") {
                    const expectedIds = records.map((r) => r.id);
                    expectedIds.pop();
                    assert.deepEqual(args[1].timmy, [[6, false, expectedIds]]);
                }
            },
        });

        await click(form.el, ".o_form_button_edit");

        assert.containsN(form, ".o_field_widget[name='timmy'] input[type='checkbox']:checked", 90);

        // toggle the last value
        let checkboxes = form.el.querySelectorAll(
            ".o_field_widget[name='timmy'] input[type='checkbox']"
        );
        await click(checkboxes[checkboxes.length - 1]);

        await click(form.el, ".o_form_button_save");
        checkboxes = form.el.querySelectorAll(
            ".o_field_widget[name='timmy'] input[type='checkbox']"
        );
        assert.notOk(checkboxes[checkboxes.length - 1].checked);
    });

    QUnit.test("Many2ManyCheckBoxesField with 100+ values", async function (assert) {
        // The many2many_checkboxes widget limits the displayed values to 100 (this is the
        // server-side name_search limit). This test encodes a scenario where there are more than
        // 100 records in the co-model, and all values in the many2many relationship aren't
        // displayed in the widget (due to the limit). If the user (un)selects a checkbox, we don't
        // want to remove all values that aren't displayed from the relation.
        assert.expect(5);

        const records = [];
        for (let id = 1; id < 150; id++) {
            records.push({
                id,
                display_name: `type ${id}`,
                color: id % 7,
            });
        }
        serverData.models.partner_type.records = records;
        serverData.models.partner.records[0].timmy = records.map((r) => r.id);

        const form = await makeView({
            type: "form",
            resModel: "partner",
            resId: 1,
            serverData,
            arch: `
                <form>
                    <field name="timmy" widget="many2many_checkboxes" />
                </form>
            `,
            async mockRPC(route, { args, method }, performRPC) {
                if (method === "write") {
                    const expectedIds = records.map((r) => r.id);
                    expectedIds.shift();
                    assert.deepEqual(args[1].timmy, [[6, false, expectedIds]]);
                }
                const result = await performRPC(...arguments);
                if (method === "name_search") {
                    assert.strictEqual(
                        result.length,
                        100,
                        "sanity check: name_search automatically sets the limit to 100"
                    );
                }
                return result;
            },
        });

        await click(form.el, ".o_form_button_edit");

        assert.containsN(
            form.el,
            ".o_field_widget[name='timmy'] input[type='checkbox']",
            100,
            "should only display 100 checkboxes"
        );
        assert.ok(
            form.el.querySelector(".o_field_widget[name='timmy'] input[type='checkbox']").checked
        );

        // toggle the first value
        await click(form.el.querySelector(".o_field_widget[name='timmy'] input[type='checkbox']"));

        await click(form.el, ".o_form_button_save");
        assert.notOk(
            form.el.querySelector(".o_field_widget[name='timmy'] input[type='checkbox']").checked
        );
    });
});
