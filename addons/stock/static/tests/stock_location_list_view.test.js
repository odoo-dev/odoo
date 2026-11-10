import { defineMailModels } from "@mail/../tests/mail_test_helpers";
import { expect, test } from "@odoo/hoot";
import { queryAllTexts } from "@odoo/hoot-dom";
import {
    contains,
    defineModels,
    fields,
    makeKwArgs,
    MockServer,
    models,
    mountView,
    onRpc,
} from "@web/../tests/web_test_helpers";

class StockWarehouse extends models.Model {
    _name = "stock.warehouse";

    name = fields.Char();

    _records = [
        { id: 1, name: "WH1" },
        { id: 2, name: "WH2" },
    ];
}

class StockLocation extends models.Model {
    _name = "stock.location";

    name = fields.Char();
    usage = fields.Selection({
        selection: [
            ["view", "Virtual"],
            ["internal", "Internal"],
            ["customer", "Customer"],
        ],
    });
    location_id = fields.Many2one({ relation: "stock.location" });
    child_ids = fields.One2many({ relation: "stock.location", relation_field: "location_id" });
    warehouse_id = fields.Many2one({ relation: "stock.warehouse" });
    active = fields.Boolean({ default: true });

    _records = [
        { id: 1, name: "WH1", usage: "view", warehouse_id: 1 },
        { id: 2, name: "WH1/Stock", usage: "internal", location_id: 1, warehouse_id: 1 },
        { id: 3, name: "WH1/Stock/Shelf 1", usage: "internal", location_id: 2, warehouse_id: 1 },
        { id: 4, name: "WH1/Stock/Shelf 2", usage: "internal", location_id: 2, warehouse_id: 1 },
        { id: 5, name: "WH1/Input", usage: "internal", location_id: 1, warehouse_id: 1 },
        { id: 6, name: "WH2", usage: "view", warehouse_id: 2 },
        { id: 7, name: "WH2/Stock", usage: "internal", location_id: 6, warehouse_id: 2 },
        { id: 8, name: "Partners", usage: "view" },
        { id: 9, name: "Partners/Customers", usage: "customer", location_id: 8 },
    ];
}

defineModels([StockWarehouse, StockLocation]);
defineMailModels();

/**
 * The mock server doesn't evaluate the "not any" operator, so we evaluate it
 * here by replacing it by a "not in" on the matching ids.
 */
function replaceNotAny(domain) {
    return domain.map((leaf) => {
        if (Array.isArray(leaf) && leaf[1] === "not any") {
            const ids = MockServer.env[StockLocation._name].search(leaf[2]);
            return [leaf[0], "not in", ids];
        }
        return leaf;
    });
}

onRpc("stock.location", "web_search_read", ({ kwargs }) =>
    MockServer.env["stock.location"].web_search_read(
        makeKwArgs({ ...kwargs, domain: replaceNotAny(kwargs.domain) })
    )
);

const arch = /* xml */ `
    <list js_class="stock_location_list_view" default_group_by="warehouse_id">
        <field name="name"/>
        <field name="usage"/>
    </list>
`;

test("locations grouped by warehouse are displayed as a hierarchy", async () => {
    await mountView({ type: "list", resModel: "stock.location", arch });
    expect(queryAllTexts(".o_group_header .o_group_name", { inline: true })).toEqual([
        "WH1 5 records",
        "WH2 2 records",
        "None 2 records",
    ]);

    // unfold a warehouse: only its top-level locations are displayed, as groups
    await contains(".o_group_header:eq(0)").click();
    expect(queryAllTexts(".o_group_header .o_group_name", { inline: true })).toEqual([
        "WH1 5 records",
        "WH1 2 records",
        "WH2 2 records",
        "None 2 records",
    ]);
    expect(".o_data_row").toHaveCount(0);

    // unfold a top-level location: its direct sub-locations are displayed
    await contains(".o_group_header:eq(1)").click();
    expect(queryAllTexts(".o_data_row .o_data_cell[name=name]")).toEqual([
        "WH1/Stock",
        "WH1/Input",
    ]);
});

test("top-level locations depend on the displayed locations", async () => {
    await mountView({
        type: "list",
        resModel: "stock.location",
        arch,
        domain: [["usage", "=", "internal"]],
    });
    await contains(".o_group_header:eq(0)").click();
    // WH1 isn't displayed, so WH1/Stock and WH1/Input are top-level locations
    expect(queryAllTexts(".o_group_header .o_group_name", { inline: true })).toEqual([
        "WH1 4 records",
        "WH1/Stock 2 records",
        "WH1/Input 0 record",
        "WH2 1 record",
    ]);

    await contains(".o_group_header:eq(1)").click();
    expect(queryAllTexts(".o_data_row .o_data_cell[name=name]")).toEqual([
        "WH1/Stock/Shelf 1",
        "WH1/Stock/Shelf 2",
    ]);
});

test("standard grouping when not grouped by warehouse only", async () => {
    await mountView({
        type: "list",
        resModel: "stock.location",
        arch,
        groupBy: ["usage"],
    });
    expect(".o_group_header").toHaveCount(3);
    await contains(".o_group_header:contains(Virtual)").click();
    expect(queryAllTexts(".o_data_row .o_data_cell[name=name]")).toEqual([
        "WH1",
        "WH2",
        "Partners",
    ]);
});
