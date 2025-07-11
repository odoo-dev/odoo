import { test, describe, expect } from "@odoo/hoot";
import { getRelatedModelsInstance } from "../data/get_model_definitions";
import { makeMockServer } from "@web/../tests/web_test_helpers";
import * as baseData from "../data/base_data";

function getTaxTotalsOfLinesData(otherData = {}) {
    // Default data structure for "getTaxTotalsOfLines" tests
    return {
        ...baseData.configData,
        "account.tax": [
            {
                id: 1,
                name: "10% - Percentage",
                price_include: true,
                include_base_amount: true,
                is_base_affected: true,
                has_negative_factor: false,
                amount_type: "percent",
                amount: 10.0,
                formula_decoded_info: false,
            },
        ],
        "product.template": [
            {
                id: 1,
                name: "Test Product Template",
                type: "consu",
                list_price: 100.0,
                tax_ids: [1],
            },
        ],
        "product.product": [
            {
                id: 1,
                product_tmpl_id: 1,
                name: "Test Product Variant",
                lst_price: 100.0,
            },
        ],
        "pos.order": [
            {
                id: 1,
                name: "Test Order",
            },
        ],
        "pos.order.line": [
            {
                id: 1,
                order_id: 1,
                product_id: 1,
                price_unit: 100.0,
                qty: 2,
                tax_ids: [1],
            },
        ],
        ...otherData,
    };
}

describe("class pos.order", () => {
    test("Base test getTaxTotalsOfLines", async () => {
        await makeMockServer();
        const models = getRelatedModelsInstance();
        const data = models.loadConnectedData(getTaxTotalsOfLinesData());
        const posOrder = data["pos.order"][0];
        data["pos.config"][0].currency_id = 1;
        //TODO-manv : why does `posOrder.lines` is empty?
        const orderTotalTaxes = data["pos.order"][0].getTaxTotalsOfLines(posOrder.lines);
        /*
        TODO-manv: we don't have access to "_()" in hoot tests?
        Error
            translation error @1,193ms
            Source:
            Error: translation error
            at LazyTranslatedString.valueOf (http://localhost:8069/web/assets/debug/web.assets_unit_tests_setup.js:53093:19)
            at LazyTranslatedString.toString (http://localhost:8069/web/assets/debug/web.assets_unit_tests_setup.js:53097:21)
            at Object.get_tax_totals_summary (http://localhost:8069/web/assets/debug/web.assets_unit_tests_setup.js:228449:54)
            at Proxy.getTaxTotalsOfLines (http://localhost:8069/web/assets/debug/web.assets_unit_tests.js:307725:45)
            at http://localhost:8069/web/assets/debug/web.assets_unit_tests.js:313441:54
            at async Runner.start (http://localhost:8069/web/assets/debug/web.assets_unit_tests_setup.js:10985:13)
            at async runTests (http://localhost:8069/web/assets/debug/web.assets_unit_tests.js:7979:25)
        */
        expect(orderTotalTaxes.tax).toBe(20.0);
    });
});
