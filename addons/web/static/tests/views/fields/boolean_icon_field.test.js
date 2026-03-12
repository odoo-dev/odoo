import { expect, test } from "@odoo/hoot";
import { click } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
import { defineModels, fields, models, mountView } from "@web/../tests/web_test_helpers";

class Partner extends models.Model {
    bar = fields.Boolean({ string: "Bar field" });
    foo = fields.Boolean();

    _records = [{ id: 1, bar: true, foo: false }];
}

defineModels([Partner]);

test("BooleanIcon field in form view", async () => {
    await mountView({
        resModel: "partner",
        resId: 1,
        type: "form",
        arch: `
            <form>
                <field name="bar" widget="boolean_icon" options="{'icon': 'recycling'}" />
                <field name="foo" widget="boolean_icon" options="{'icon': 'delete'}" />
            </form>`,
    });
    expect(".o_field_boolean_icon button").toHaveCount(2);
    expect("[name='bar'] button").toHaveAttribute("data-tooltip", "Bar field");
    expect("[name='bar'] button").toHaveClass("btn-primary");
    expect("[name='bar'] button").toHaveAttribute("data-icon", "recycling");
    expect("[name='foo'] button").toHaveClass("btn-outline-secondary");
    expect("[name='foo'] button").toHaveAttribute("data-icon", "delete");

    await click("[name='bar'] button");
    await animationFrame();
    expect("[name='bar'] button").toHaveClass("btn-outline-secondary");
    expect("[name='bar'] button").toHaveAttribute("data-icon", "recycling");
});
