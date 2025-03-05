import { expect, test } from "@odoo/hoot";
import { press, runAllTimers } from "@odoo/hoot-dom";
import {
    clickSave,
    Command,
    contains,
    defineModels,
    fields,
    makeMockServer,
    models,
    mountView,
    onRpc,
    serverState,
} from "@web/../tests/web_test_helpers";
import { saleModels } from "./sale_test_helpers";

class SaleOrder extends models.Model {
    _name = "sale.order";

    name = fields.Char();
    order_line = fields.One2many({
        relation: "sale.order.line",
        relation_field: "order_id",
    });
    company_id = fields.Many2one({
        string: 'company',
        relation: "res.company",
    });

    _records = [
        {
            id: 1,
            name: "first record",
            order_line: [],
            company_id: 1,
        },
    ];
}

class SaleOrderLine extends saleModels.SaleOrderLine {

    _name = "sale.order.line";

    order_id = fields.Many2one({
        string: "Order Reference",
        relation: "sale.order",
        relation_field: "order_line",
    });
    product_template_id = fields.Many2one({
        string: "Product",
        relation: "product.template",
    });
    product_id = fields.Many2one({
        string: "Product",
        relation: "product.product",
    });
    name = fields.Char();
    product_type = fields.Selection({
        selection: [],
    });
    service_tracking = fields.Selection({
        selection: [],
    });
    is_configurable_product = fields.Boolean({
        string: "Is product configurable",
    });
    product_template_attribute_value_ids = fields.Many2many({
        string: "Product template attributes values",
        relation: "product.template.attribute.value",
    });
}

class ProductTemplateAttributeValue extends models.Model {
    _name = "product.template.attribute.value";

    name = fields.Char();

    _records = [{ id: 14, name: "desk" }];
}

defineModels({ ...saleModels, SaleOrderLine, ProductTemplateAttributeValue });

saleModels.SaleOrder._views.form = /* xml */ `
    <form>
        <field name="order_line" widget="sol_o2m" mode="list">
            <list editable="bottom">
                <field name="product_id" widget="sol_product_many2one"/>
                <field name="product_template_id" widget="sol_product_many2one"/>
                <field name="name" widget="sol_text"/>
            </list>
        </field>
    </form>
`;

class Company extends models.Model {
    _name = "res.company";

    name = fields.Char();

    _records = [{ id: 1, name: "test company" }];
}

defineModels([Company, SaleOrder, SaleOrderLine, ProductTemplate, ProductTemplateAttributeValue, Product]);
defineMailModels();

test.tags`desktop`;
test("pressing tab with incomplete text will create a product", async () => {
    onRpc(({ method }) => {
        expect.step(method);
    });
    onRpc('/sale/product/get_values', ()=>{
        return {dialog: 'false'}
    })
    await mountView({
        type: "form",
        resModel: "sale.order",
        arch: `
                <form>
                    <sheet>
                        <field name="company_id"/>
                        <field name="order_line">
                            <list editable="bottom">
                                <field name="product_template_id" widget="sol_product_many2one"/>
                                <field name="product_id" optional="hide"/>
                                <field name="name" optional="show"/>
                            </list>
                        </field>
                    </sheet>
                </form>`,
    });

    // add a line and enter new product name
    await contains(".o_field_x2many_list .o_field_x2many_list_row_add a").click();
    await contains("[name='product_template_id'] input").edit("new product");
    await press("tab");
    await runAllTimers();
    expect.verifySteps([
        "get_views",
        "onchange",
        "onchange",
        "web_name_search",
        "name_create",
    ]);
});

test("Hide product name if its not translated", async () => {
    const { env } = await makeMockServer();
    const product = env["product.product"][0];
    const soId = env["sale.order"].create({
        partner_id: serverState.partnerId,
        order_line: [
            Command.create({
                product_id: product.id,
                name: [product.name, "A description"].join("\n"),
                translated_product_name: "Produit de test",
            }),
        ],
    });
    await mountView({
        type: "form",
        resModel: "sale.order",
        resId: soId,
    });

    expect(".o_field_product_label_section_and_note_cell textarea").toHaveValue("A description");
});

test("If translated product name already in the SOL name, should not hide the translated product name", async () => {
    const { env } = await makeMockServer();
    const translatedProductName = "Produit de test";
    const product = env["product.product"][0];
    const soId = env["sale.order"].create({
        partner_id: serverState.partnerId,
        order_line: [
            Command.create({
                product_id: product.id,
                name: [product.name, translatedProductName, "A description"].join("\n"),
                translated_product_name: translatedProductName,
            }),
        ],
    });
    await mountView({
        type: "form",
        resModel: "sale.order",
        resId: soId,
    });

    expect(".o_field_product_label_section_and_note_cell textarea").toHaveValue(
        [translatedProductName, "A description"].join("\n")
    );
});

test("Editing the description shouldn't show the translated product name", async () => {
    const { env } = await makeMockServer();
    const translatedProductName = "Produit de test";
    const product = env["product.product"][0];
    const soId = env["sale.order"].create({
        partner_id: serverState.partnerId,
        order_line: [
            Command.create({
                product_id: product.id,
                name: [product.name, "something wrong"].join("\n"),
                translated_product_name: translatedProductName,
            }),
        ],
    });
    const [so] = env["sale.order"].browse(soId);
    const [sol] = env["sale.order.line"].browse(so.order_line);
    await mountView({
        type: "form",
        resModel: "sale.order",
        resId: soId,
    });

    await contains(".o_field_product_label_section_and_note_cell textarea").edit("A description");
    await clickSave();

    expect(".o_field_product_label_section_and_note_cell textarea").toHaveValue("A description");
    expect(sol.name).toBe([translatedProductName, "A description"].join("\n"));
});

test("No description should be shown if there does not exist one apart from the product name", async () => {
    const { env } = await makeMockServer();
    const translatedProductName = "Produit de test";
    const product = env["product.product"][0];
    const soId = env["sale.order"].create({
        partner_id: serverState.partnerId,
        order_line: [
            Command.create({
                product_id: product.id,
                name: product.name,
                translated_product_name: translatedProductName,
            }),
        ],
    });
    await mountView({
        type: "form",
        resModel: "sale.order",
        resId: soId,
    });

    expect(".o_field_product_label_section_and_note_cell textarea").not.toBeVisible();
});

test("No description should be shown if there does not exist one apart from the translated product name", async () => {
    const { env } = await makeMockServer();
    const translatedProductName = "Produit de test";
    const product = env["product.product"][0];
    const soId = env["sale.order"].create({
        partner_id: serverState.partnerId,
        order_line: [
            Command.create({
                product_id: product.id,
                name: translatedProductName,
                translated_product_name: translatedProductName,
            }),
        ],
    });
    await mountView({
        type: "form",
        resModel: "sale.order",
        resId: soId,
    });

    expect(".o_field_product_label_section_and_note_cell textarea").not.toBeVisible();
});
