import { test, expect } from "@odoo/hoot";
import { waitFor } from "@odoo/hoot-dom";
import { mountWithCleanup, contains } from "@web/../tests/web_test_helpers";
import { localization as l10n } from "@web/core/l10n/localization";
import { setupPosEnv, createAttributeLine, createAttributeValue, createAttribute } from "../utils";
import { definePosModels } from "../data/generate_model_definitions";
import { CategorySelector } from "@point_of_sale/app/components/category_selector/category_selector";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import * as Utils from "../ui_utils";

definePosModels();

test("MultiProductOptionsTour: multi product options shows all values", async () => {
    const store = await setupPosEnv();
    store.session.state = "opened";
    const attribute = createAttribute(store, "Multi", "multi");
    const value1 = createAttributeValue(store, attribute, "Value 1");
    const value2 = createAttributeValue(store, attribute, "Value 2");
    const line = createAttributeLine(store, attribute, [value1, value2]);

    const product = store.models["product.template"].create({
        name: "Product A",
        display_name: "Product A",
        available_in_pos: true,
        active: true,
        type: "consu",
        uom_id: store.models["uom.uom"].get(1),
        tracking: "none",
        taxes_id: [],
        product_variant_ids: [store.models["product.product"].get(5)],
        attribute_line_ids: [line],
        combo_ids: [],
        pos_categ_ids: [store.models["pos.category"].get(1)],
    });

    const order = store.addNewOrder();
    await mountWithCleanup(ProductScreen, { props: { orderUuid: order.uuid } });

    // Clicking the product opens the configurator which must show all options
    await Utils.clickDisplayedProduct("Product A");
    await waitFor(".modal label:contains('Value 1')");
    expect(Utils.queryEl(".modal label", "Value 1")).not.toBe(null);
    expect(Utils.queryEl(".modal label", "Value 2")).not.toBe(null);
    await contains(".modal .btn-primary:contains('Add')").click();

    expect(product.attribute_line_ids[0].product_template_value_ids.map((v) => v.name)).toEqual([
        "Value 1",
        "Value 2",
    ]);
});

test("DecimalCommaOrderlinePrice: decimal comma orderline price format", async () => {
    const store = await setupPosEnv();
    store.session.state = "opened";
    l10n.decimalPoint = ",";
    l10n.thousandsSep = ".";
    const product = store.models["product.template"].get(5);
    product.list_price = 1453.53;
    product.taxes_id = [];

    const order = store.addNewOrder();
    await mountWithCleanup(ProductScreen, { props: { orderUuid: order.uuid } });

    await Utils.clickDisplayedProduct("TEST");
    await Utils.clickNumpad("5");

    const line = order.lines[0];
    expect(line.qty).toBe(5);
    expect(line.displayPrice).toBe(7267.65);
    await waitFor(".orderline .price:contains('7.267,65')");
    expect(Utils.queryEl(".orderline .price", "7.267,65")).not.toBe(null);
});

test("PosCategoriesOrder: pos categories keep sequence and hierarchy", async () => {
    await setupPosEnv();
    await mountWithCleanup(CategorySelector, { props: {} });

    const visibleCategories = () =>
        [...document.querySelectorAll(".category-button")].map((b) => b.textContent.trim());

    expect(visibleCategories()).toEqual(["Category 1", "Category 2", "Food"]);

    // Selecting a parent category reveals its children
    await contains(".category-button:contains('Food')").click();
    expect(visibleCategories()).toEqual(["Category 1", "Category 2", "Food", "Burger", "Pizza"]);
});
