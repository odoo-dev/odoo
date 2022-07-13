/** @odoo-module */
import { registry } from "@web/core/registry";
import { getFixture } from "../../helpers/utils";
import { makeView, setupViewRegistries } from "../helpers";

QUnit.module("field.js interface tests", (hooks) => {
    let serverData;
    let target;

    hooks.beforeEach(() => {
        target = getFixture();
        serverData = {
            models: {
                partner: {
                    fields: {
                        bar: { string: "Bar", type: "boolean" },
                    },
                    records: [{ id: 1, bar: true }],
                },
            },
        };

        setupViewRegistries();
    });

    QUnit.test("class reflect both widget and field type", async (assert) => {
        class MyBoolean extends owl.Component {}
        MyBoolean.template = owl.xml`<div t-esc="this.value" />`;

        registry.category("fields").add("my_little_boolean", MyBoolean);

        await makeView({
            type: "form",
            resModel: "partner",
            resId: 1,
            arch: `<form><field name="bar" widget="my_little_boolean"/></form>`,
            serverData,
        });

        assert.containsOnce(target, ".o_field_widget.o_field_boolean.o_field_my_little_boolean");
    });
});
