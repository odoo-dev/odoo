import { expect, test } from "@odoo/hoot";
import {
    contains,
    defineModels,
    fields,
    models,
    mountView,
    onRpc,
} from "@web/../tests/web_test_helpers";

class AccountMove extends models.Model {
    _name = "account.move";

    country_code = fields.Char({ default: "IN" });
    state = fields.Char({ default: "draft" });
    move_type = fields.Char({ default: "out_invoice" });
    invoice_line_ids = fields.One2many({ relation: "account.move.line", relation_field: "move_id" });

    _records = [{ id: 1, invoice_line_ids: [1, 2, 3, 4] }];
}

class AccountMoveLine extends models.Model {
    _name = "account.move.line";

    move_id = fields.Many2one({ relation: "account.move" });
    name = fields.Char();
    display_type = fields.Char({ default: "product" });
    tax_ids = fields.Many2many({ relation: "account.tax" });

    _records = [
        { id: 1, move_id: 1, name: "First", tax_ids: [1, 2] },
        { id: 2, move_id: 1, name: "Second", tax_ids: [1, 3] },
        { id: 3, move_id: 1, name: "Third", tax_ids: [1] },
        { id: 4, move_id: 1, name: "Note", display_type: "line_note" },
    ];
}

class AccountTax extends models.Model {
    _name = "account.tax";

    name = fields.Char();
    l10n_in_tax_type = fields.Selection({
        selection: [
            ["gst", "GST"],
            ["tcs", "TCS"],
            ["tds", "TDS"],
        ],
    });

    _records = [
        { id: 1, name: "GST", l10n_in_tax_type: "gst" },
        { id: 2, name: "TCS 1%", l10n_in_tax_type: "tcs" },
        { id: 3, name: "TDS", l10n_in_tax_type: "tds" },
        { id: 4, name: "TCS 2%", l10n_in_tax_type: "tcs" },
    ];
}

defineModels([AccountMove, AccountMoveLine, AccountTax]);

async function openInvoice({ resId = 1, limit = 80 } = {}) {
    return mountView({
        type: "form",
        resModel: "account.move",
        resId,
        arch: `<form>
            <field name="country_code" invisible="1"/>
            <field name="state" invisible="1"/>
            <field name="move_type" invisible="1"/>
            <field name="invoice_line_ids">
                <list editable="bottom" limit="${limit}">
                    <field name="name"/>
                    <field name="display_type" column_invisible="1"/>
                    <field name="tax_ids" widget="l10n_in_tcs_tax_tags" options="{'no_create': True}"/>
                </list>
            </field>
        </form>`,
    });
}

function taxIds(view, index) {
    return view.model.root.data.invoice_line_ids.records[index].data.tax_ids.currentIds;
}

async function addTax(name) {
    await contains(".o_data_row:first-child .o_field_many2many_tags").click();
    await contains(".o_data_row:first-child .o_field_many2many_tags input").click();
    await contains(`.o-autocomplete--dropdown-item:contains(${name})`).click();
}

async function removeTcs() {
    await contains(".o_data_row:first-child .o_field_many2many_tags").click();
    await contains(".o_data_row:first-child .o_tag:contains(TCS 1%) .o_delete").click();
}

test("Adding TCS propagates only that tax and preserves other taxes", async () => {
    const view = await openInvoice();
    await addTax("TCS 2%");
    expect(".modal-title").toHaveText("Update TCS Taxes");
    await contains(".modal-footer .btn-primary").click();
    expect(taxIds(view, 0)).toEqual([1, 2, 4]);
    expect(taxIds(view, 1)).toEqual([1, 3, 4]);
    expect(taxIds(view, 2)).toEqual([1, 4]);
    expect(taxIds(view, 3)).toEqual([]);
    expect(".modal").toHaveCount(0);
});

test("Removing TCS removes the same tax, not other TCS or TDS taxes", async () => {
    AccountMoveLine._records[1].tax_ids = [1, 2, 3, 4];
    const view = await openInvoice();
    await removeTcs();
    await contains(".modal-footer .btn-primary").click();
    expect(taxIds(view, 0)).toEqual([1]);
    expect(taxIds(view, 1)).toEqual([1, 3, 4]);
    expect(taxIds(view, 2)).toEqual([1]);
});

test("Declining keeps the TCS change on the edited line only", async () => {
    const view = await openInvoice();
    await addTax("TCS 2%");
    await contains(".modal-footer .btn-secondary").click();
    expect(taxIds(view, 0)).toEqual([1, 2, 4]);
    expect(taxIds(view, 1)).toEqual([1, 3]);
    expect(taxIds(view, 2)).toEqual([1]);
});

test("Non-TCS changes and non-Indian invoices do not ask to propagate taxes", async () => {
    const view = await openInvoice();
    await addTax("TDS");
    expect(taxIds(view, 0)).toEqual([1, 2, 3]);
    expect(".modal").toHaveCount(0);
    await view.model.root.update({ country_code: "US" });
    await addTax("TCS 2%");
    expect(taxIds(view, 0)).toEqual([1, 2, 3, 4]);
    expect(".modal").toHaveCount(0);
    expect(taxIds(view, 1)).toEqual([1, 3]);
});

test("Confirmed TCS changes reach other pages and persist on save", async () => {
    await openInvoice({ limit: 1 });
    await addTax("TCS 2%");
    await contains(".modal-footer .btn-primary").click();
    onRpc("account.move", "web_save", ({ args }) => {
        const commands = args[1].invoice_line_ids;
        expect(commands.find((command) => command[1] === 2)[2].tax_ids).toEqual([[4, 4]]);
        expect(commands.find((command) => command[1] === 3)[2].tax_ids).toEqual([[4, 4]]);
        expect.step("saved");
    });
    await contains(".o_form_button_save").click();
    expect.verifySteps(["saved"]);
});

test("TCS propagation works on unsaved invoice lines", async () => {
    const view = await openInvoice();
    await contains(".o_field_x2many_list_row_add a").click();
    await contains(".o_data_row:last-child [name='name'] input").edit("New line");
    await contains(".o_data_row:first-child [name='name']").click();
    await addTax("TCS 2%");
    await contains(".modal-footer .btn-primary").click();
    expect(taxIds(view, 4)).toEqual([4]);
});
