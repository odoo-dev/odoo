import { test, describe, expect } from "@odoo/hoot";
import { getRelatedModelsInstance } from "../data/get_model_definitions";
import { makeMockServer } from "@web/../tests/web_test_helpers";
import * as baseData from "../data/base_data";

function getAllPricesData(otherData = {}) {
    // Default data structure for "getAllPrices" tests
    return {
        ...baseData.configData,
        ...baseData.basicProductData,
        // ...baseData.basicProductWithAttribute, //TODO-manv: error when trying to load 'basicProductWithAttribute'
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

describe("class pos.order.line", () => {
    test("[getAllPrices()] Base test", async () => {
        await makeMockServer();
        const models = getRelatedModelsInstance();
        const data = models.loadConnectedData(getAllPricesData());

        const lineTax = data["pos.order.line"][0].getAllPrices();
        expect(lineTax.priceWithTax).toBe(200.0);
        expect(lineTax.priceWithoutTax).toBe(182.0);
        expect(lineTax.taxesData[0].tax).toBe(models["account.tax"].getFirst());
        expect(lineTax.taxDetails[1].base).toBe(182.0);
        expect(lineTax.taxDetails[1].amount).toBe(18.0);

        // Test with line qty = 0
        data["pos.order.line"][0].qty = 0;
        const zeroQtyLineTax = data["pos.order.line"][0].getAllPrices();
        expect(zeroQtyLineTax.priceWithTax).toBe(0.0);
        expect(zeroQtyLineTax.priceWithoutTax).toBe(0.0);
        expect(zeroQtyLineTax.tax).toBe(0.0);
        expect(Object.keys(zeroQtyLineTax.taxDetails).length).toBe(1);

        // Test with negative line qty (refund)
        data["pos.order.line"][0].qty = -2;
        const negativeLineTax = data["pos.order.line"][0].getAllPrices();
        expect(negativeLineTax.priceWithTax).toBe(-200.0);
        expect(negativeLineTax.priceWithoutTax).toBe(-182.0);
        expect(negativeLineTax.tax).toBe(-18.0);
        expect(negativeLineTax.taxDetails[1].amount).toBe(-18.0);
    });

    test("[getAllPrices()] with discount applied", async () => {
        await makeMockServer();
        const models = getRelatedModelsInstance();
        const data = models.loadConnectedData(getAllPricesData());
        data["account.tax"][0].amount = 20.0;
        data["account.tax"][0].price_include = false;
        data["pos.order.line"][0].discount = 10.0;

        const lineTax = data["pos.order.line"][0].getAllPrices();
        // Price without tax after 10% discount: 200 * 0.9 = 180
        // Tax: 180 * 0.2 = 36
        expect(lineTax.priceWithoutTax).toBe(180.0);
        expect(lineTax.priceWithTax).toBe(216.0);
        expect(lineTax.tax).toBe(36.0);
        expect(lineTax.taxDetails[1].amount).toBe(36.0);
        // Price with a discount of 100% applied
        data["pos.order.line"][0].discount = 100.0;
        const updatedLineTax = data["pos.order.line"][0].getAllPrices();
        expect(updatedLineTax.priceWithoutTax).toBe(0.0);
        expect(updatedLineTax.priceWithTax).toBe(0.0);
        expect(updatedLineTax.tax).toBe(0.0);
        expect(updatedLineTax.taxDetails[1].amount).toBe(0.0);
    });

    test("[getAllPrices()] with multiple taxes settings", async () => {
        await makeMockServer();
        const models = getRelatedModelsInstance();
        const data = models.loadConnectedData(
            getAllPricesData({
                "account.tax": [
                    {
                        id: 4,
                        name: "5% Tax",
                        price_include: false,
                        include_base_amount: false,
                        is_base_affected: false,
                        has_negative_factor: false,
                        amount_type: "percent",
                        amount: 5.0,
                        formula_decoded_info: false,
                    },
                    {
                        id: 5,
                        name: "10% Tax",
                        price_include: false,
                        include_base_amount: false,
                        is_base_affected: false,
                        has_negative_factor: false,
                        amount_type: "percent",
                        amount: 10.0,
                        formula_decoded_info: false,
                    },
                ],
            })
        );
        data["product.template"][0].tax_ids = [4, 5];
        data["pos.order.line"][0].tax_ids = [4, 5];
        data["pos.order.line"][0].qty = 1;

        const lineTax = data["pos.order.line"][0].getAllPrices();
        // Test with two taxes applied
        // Price without tax: 100
        // Tax 1: 100 * 0.05 = 5
        // Tax 2: 100 * 0.10 = 10
        // Total tax: 15
        expect(lineTax.priceWithoutTax).toBe(100.0);
        expect(lineTax.priceWithTax).toBe(115.0);
        expect(lineTax.tax).toBe(15.0);
        expect(lineTax.taxDetails[4].amount).toBe(5.0);
        expect(lineTax.taxDetails[5].amount).toBe(10.0);

        // Test with "include_base_amount" and "is_base_affected" to true for both taxes
        data["account.tax"].forEach((tax) => {
            tax.is_base_affected = true;
            tax.include_base_amount = true;
        });
        // Price without tax: 100
        // Tax 1: 100 * 0.05 = 5
        // Tax 2: (100 + 5) * 0.10 = 10.5 => rounded to 11.0
        // Total tax: 16.0
        const updatedLineTax = data["pos.order.line"][0].getAllPrices();
        expect(updatedLineTax.priceWithoutTax).toBe(100.0);
        expect(updatedLineTax.priceWithTax).toBe(116.0);
        expect(updatedLineTax.tax).toBe(16.0);
        expect(updatedLineTax.taxDetails[4].amount).toBe(5.0);
        expect(updatedLineTax.taxDetails[5].amount).toBe(11.0);

        // Test without any taxes
        data["pos.order.line"][0].tax_ids = [];
        const noTaxLine = data["pos.order.line"][0].getAllPrices();
        expect(noTaxLine.priceWithoutTax).toBe(100.0);
        expect(noTaxLine.priceWithTax).toBe(100.0);
        expect(noTaxLine.tax).toBe(0.0);
        expect(Object.keys(noTaxLine.taxDetails).length).toBe(0);
    });

    test("[getAllPrices()] with fixed-amount tax", async () => {
        await makeMockServer();
        const models = getRelatedModelsInstance();
        const data = models.loadConnectedData(
            getAllPricesData({
                "account.tax": [
                    {
                        id: 2,
                        name: "Fixed Tax",
                        price_include: false,
                        include_base_amount: false,
                        is_base_affected: false,
                        has_negative_factor: false,
                        amount_type: "fixed",
                        amount: 5.0,
                        formula_decoded_info: false,
                    },
                ],
            })
        );
        data["product.template"][0].tax_ids = [2];
        data["pos.order.line"][0].tax_ids = [2];
        data["pos.order.line"][0].qty = 3;
        const lineTax = data["pos.order.line"][0].getAllPrices();
        // 3 * 100 = 300, tax = 3 * 5 = 15
        expect(lineTax.priceWithoutTax).toBe(300.0);
        expect(lineTax.priceWithTax).toBe(315.0);
        expect(lineTax.tax).toBe(15.0);
        expect(lineTax.taxDetails[2].amount).toBe(15.0);
    });

    test("[getAllPrices()] with one price-included and one price-excluded tax", async () => {
        await makeMockServer();
        const models = getRelatedModelsInstance();
        const data = models.loadConnectedData(
            getAllPricesData({
                "account.tax": [
                    {
                        id: 10,
                        name: "10% Included",
                        price_include: true,
                        include_base_amount: false,
                        is_base_affected: false,
                        has_negative_factor: false,
                        amount_type: "percent",
                        amount: 10.0,
                        formula_decoded_info: false,
                    },
                    {
                        id: 11,
                        name: "5% Excluded",
                        price_include: false,
                        include_base_amount: false,
                        is_base_affected: false,
                        has_negative_factor: false,
                        amount_type: "percent",
                        amount: 5.0,
                        formula_decoded_info: false,
                    },
                ],
            })
        );
        data["product.template"][0].tax_ids = [10, 11];
        data["pos.order.line"][0].tax_ids = [10, 11];
        data["pos.order.line"][0].qty = 1;
        data["pos.order.line"][0].price_unit = 110.0; // price includes 10% tax
        const lineTax = data["pos.order.line"][0].getAllPrices();
        // priceWithoutTax: 110 / 1.1 = 100, 5% tax = 5, priceWithTax = 110 + 5 = 115
        expect(lineTax.priceWithoutTax).toBe(100.0);
        expect(lineTax.priceWithTax).toBe(115.0);
        expect(lineTax.tax).toBe(15.0);
        expect(lineTax.taxDetails[10].amount).toBe(10.0);
        expect(lineTax.taxDetails[11].amount).toBe(5.0);
    });

    test("[getAllPrices()] with product attributes", async () => {
        await makeMockServer();
        const models = getRelatedModelsInstance();
        const data = models.loadConnectedData(getAllPricesData());
        const lineTax = data["pos.order.line"][0].getAllPrices();
        // expect(lineTax.priceWithoutTax).toBe(100.0);
        // expect(lineTax.priceWithTax).toBe(115.0);
        // expect(lineTax.tax).toBe(15.0);
        // expect(lineTax.taxDetails[10].amount).toBe(10.0);
        // expect(lineTax.taxDetails[11].amount).toBe(5.0);
    });
});
