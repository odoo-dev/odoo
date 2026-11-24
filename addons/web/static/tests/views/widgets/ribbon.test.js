import { expect, queryOne, test } from "@odoo/hoot";
import { defineModels, fields, models, mountView } from "@web/../tests/web_test_helpers";

class Partner extends models.Model {
    name = fields.Char();
    active = fields.Boolean({ default: true });
    _records = [
        { id: 1, name: "first", active: false },
        { id: 2, name: "second", active: true },
    ];
}

/** Kanban asks the server for user groups. */
class User extends models.Model {
    _name = "res.users";
    has_group() {
        return true;
    }
}

defineModels([Partner, User]);

function mountForm(widget) {
    return mountView({
        type: "form",
        resModel: "partner",
        resId: 1,
        arch: `<form><sheet>${widget}<field name="name"/></sheet></form>`,
    });
}

test("renders title, tooltip and background classes", async () => {
    await mountForm(
        `<widget name="web_ribbon" title="Archived" tooltip="Gone" bg_color="text-bg-danger"/>`
    );
    expect(".o_widget_web_ribbon .ribbon span").toHaveText("Archived");
    expect(".ribbon span").toHaveAttribute("title", "Gone");
    expect(".ribbon span").toHaveClass("text-bg-danger");
});

test("defaults to text-bg-success", async () => {
    await mountForm(`<widget name="web_ribbon" title="Won"/>`);
    expect(".ribbon span").toHaveClass("text-bg-success");
});

test("bg_color classes are used as given", async () => {
    await mountForm(`<widget name="web_ribbon" title="Won" bg_color="bg-success text-warning"/>`);
    expect(".ribbon span").toHaveClass(["bg-success", "text-warning"]);
    expect(".ribbon span").not.toHaveClass("text-bg-success");
});

test("only a ribbon with a tooltip receives the pointer", async () => {
    await mountForm(`
        <widget name="web_ribbon" title="Plain"/>
        <widget name="web_ribbon" title="Hint" tooltip="Explained"/>
    `);
    expect(".ribbon span:eq(0)").toHaveStyle({ "pointer-events": "none" });
    expect(".ribbon span:eq(1)").toHaveStyle({ "pointer-events": "auto" });
});

test("text works as an alias of title", async () => {
    await mountForm(`<widget name="web_ribbon" text="Archived"/>`);
    expect(".ribbon span").toHaveText("Archived");
});

test("title wins over text", async () => {
    await mountForm(`<widget name="web_ribbon" title="New" text="Old"/>`);
    expect(".ribbon span").toHaveText("New");
});

test("long labels are shown in full", async () => {
    await mountForm(`<widget name="web_ribbon" title="Invoicing App Legacy"/>`);
    const label = queryOne(".ribbon span");
    expect(label).toHaveText("Invoicing App Legacy");
    expect(label.scrollWidth).toBe(label.clientWidth);
});

test("invisible modifier hides the ribbon", async () => {
    await mountForm(`
        <field name="active" invisible="1"/>
        <widget name="web_ribbon" title="Archived" invisible="not active"/>
        <widget name="web_ribbon" title="Active" invisible="active"/>
    `);
    expect(".ribbon").toHaveCount(1);
    expect(".ribbon span").toHaveText("Active");
});

test("renders in a kanban card", async () => {
    await mountView({
        type: "kanban",
        resModel: "partner",
        arch: `
            <kanban>
                <templates>
                    <t t-name="card">
                        <widget name="web_ribbon" title="Archived" bg_color="text-bg-danger"/>
                        <field name="name"/>
                    </t>
                </templates>
            </kanban>`,
    });
    expect(".o_kanban_record .ribbon span").toHaveClass("text-bg-danger");
});
