import { expect, test } from "@odoo/hoot";
import { animationFrame, waitFor, queryAll, press, advanceTime } from "@odoo/hoot-dom";
import { contains, getService, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { session } from "@web/session";
import {
    setupAndMountPosApp,
    createAttribute,
    createAttributeValue,
    createAttributeLine,
} from "@point_of_sale/../tests/unit/utils";
import { definePosModels } from "@point_of_sale/../tests/unit/data/generate_model_definitions";
import * as Utils from "@point_of_sale/../tests/unit/ui_utils";

definePosModels();

const createConfigurableChair = (store) => {
    const color = createAttribute(store, "Color", "color");
    const material = createAttribute(store, "Material", "select");
    const fabric = createAttribute(store, "Fabrics", "radio");
    const options = createAttribute(store, "Options", "multi");

    const blue = createAttributeValue(store, color, "Blue", { id: 9801 });
    const wood = createAttributeValue(store, material, "Wood", { id: 9802 });
    const leather = createAttributeValue(store, fabric, "Leather", { id: 9806 });
    const wool = createAttributeValue(store, fabric, "wool", { id: 9807 });
    const other = createAttributeValue(store, fabric, "Other", { id: 9803, isCustom: true });
    const cushion = createAttributeValue(store, options, "Cushion", { id: 9804 });
    const headrest = createAttributeValue(store, options, "Headrest", { id: 9805 });

    const template = store.models["product.template"].get(5);
    template.update({
        attribute_line_ids: [
            createAttributeLine(store, color, [blue]),
            createAttributeLine(store, material, [wood]),
            createAttributeLine(store, fabric, [leather, wool, other]),
            createAttributeLine(store, options, [cushion, headrest]),
        ],
        name: "Configurable Chair",
        display_name: "Configurable Chair",
    });

    return {
        template,
        values: { blue, wood, leather, wool, other, cushion, headrest },
        payload: {
            attribute_value_ids: [blue.id, wood.id, other.id, cushion.id, headrest.id],
            attribute_custom_values: { [other.id]: "Azerty" },
            price_extra: 0,
            qty: 1,
        },
    };
};

const createSimpleComboItem = (store, id, name) => {
    const productTmpl = store.models["product.template"].create({
        id,
        name,
        display_name: name,
        available_in_pos: true,
        active: true,
        type: "consu",
        uom_id: store.models["uom.uom"].get(1),
        tracking: "none",
        taxes_id: [],
        product_variant_ids: [],
        attribute_line_ids: [],
        combo_ids: [],
        pos_categ_ids: [store.models["pos.category"].get(1)],
    });
    const product = store.models["product.product"].create({
        id,
        name,
        product_tmpl_id: productTmpl,
        display_name: name,
        lst_price: 10,
        standard_price: 0,
        barcode: false,
        default_code: false,
        product_template_attribute_value_ids: [],
        product_template_variant_value_ids: [],
        product_tag_ids: [],
        pos_categ_ids: [1],
    });
    return store.models["product.combo.item"].create({
        id: id + 100,
        combo_id: false,
        product_id: product,
        extra_price: 0,
    });
};

const createComboProduct = (store, configurableProduct) => {
    const product2 = createSimpleComboItem(store, 9821, "Combo Product 2");
    const configurableChair = store.models["product.combo.item"].create({
        id: 9822,
        combo_id: false,
        product_id: configurableProduct.template.product_variant_ids[0],
        extra_price: 0,
    });
    const product6 = createSimpleComboItem(store, 9823, "Combo Product 6");
    const combo1 = store.models["product.combo"].create({
        id: 9861,
        name: "Combo 1",
        combo_item_ids: [product2],
        base_price: 10,
        qty_free: 1,
        qty_max: 1,
        is_upsell: false,
        sequence: 1,
    });
    const combo2 = store.models["product.combo"].create({
        id: 9862,
        name: "Combo 2",
        combo_item_ids: [configurableChair],
        base_price: 10,
        qty_free: 1,
        qty_max: 2,
        is_upsell: false,
        sequence: 2,
    });
    const combo3 = store.models["product.combo"].create({
        id: 9863,
        name: "Combo 3",
        combo_item_ids: [product6],
        base_price: 10,
        qty_free: 1,
        qty_max: 1,
        is_upsell: false,
        sequence: 3,
    });
    product2.combo_id = combo1;
    configurableChair.combo_id = combo2;
    product6.combo_id = combo3;

    const comboVariant = store.models["product.product"].create({
        id: 9864,
        name: "Office Combo Test",
        product_tmpl_id: store.models["product.template"].get(7),
        display_name: "Office Combo Test",
        lst_price: 30,
        standard_price: 0,
        barcode: false,
        default_code: false,
        product_template_attribute_value_ids: [],
        product_template_variant_value_ids: [],
        product_tag_ids: [],
        pos_categ_ids: [1],
    });
    const comboTemplate = store.models["product.template"].create({
        id: 9865,
        name: "Office Combo Test",
        display_name: "Office Combo Test",
        available_in_pos: true,
        active: true,
        type: "combo",
        uom_id: store.models["uom.uom"].get(1),
        tracking: "none",
        taxes_id: [],
        product_variant_ids: [comboVariant],
        attribute_line_ids: [],
        combo_ids: [combo1, combo2, combo3],
        pos_categ_ids: [store.models["pos.category"].get(1)],
    });
    comboVariant.product_tmpl_id = comboTemplate;

    return {
        template: comboTemplate,
        items: { product2, configurableChair, product6 },
    };
};

const expectConfiguredChairLine = (line) => {
    expect(line.getFullProductName()).toBe(
        "Configurable Chair (Blue, Wood, Fabrics: Other: Azerty, Cushion, Headrest)"
    );
    expect(line.selectedAttributes[line.attribute_value_ids[0].attribute_id.id].selected.name).toBe(
        "Blue"
    );
    expect(line.custom_attribute_value_ids[0].custom_product_template_attribute_value_id.name).toBe(
        "Other"
    );
    expect(line.custom_attribute_value_ids[0].custom_value).toBe("Azerty");
};

test("pos_basic_order_02_decimal_order_quantity: decimal order quantity", async () => {
    const store = await setupAndMountPosApp();

    const order = store.getOrder();
    await Utils.clickDisplayedProduct("TEST");
    expect(order.lines).toHaveLength(1);
    expect(order.lines[0].qty).toBe(1);
    await Utils.sendBufferKeys(".");
    expect(order.lines[0].qty).toBe(0);
    await Utils.sendBufferKeys("9");
    expect(order.lines[0].qty).toBe(0.9);
    await Utils.sendBufferKeys("9");
    expect(order.lines[0].qty).toBe(0.99);
    expect(Utils.getOrderTotal().includes("3.42")).toBe(true);
    await Utils.clickPayButton();
    await waitFor(".payment-screen");
    await Utils.clickPaymentMethod("Cash");
    await Utils.clickValidatePayment();
});

test("FloatingOrderTour: floating orders preserve product quantities", async () => {
    const store = await setupAndMountPosApp();

    const order1 = store.getOrder();
    expect(order1.lines).toHaveLength(0);
    await Utils.clickDisplayedProduct("TEST");
    expect(order1.lines).toHaveLength(1);
    expect(order1.lines[0].qty).toBe(1);
    await Utils.clickDisplayedProduct("TEST");
    expect(order1.lines[0].qty).toBe(2);
    await contains(".pos-leftheader .list-plus-btn").click();
    await animationFrame();
    const order2 = store.getOrder();
    expect(order2).not.toBe(order1);
    await Utils.clickDisplayedProduct("TEST 2");
    expect(order2.lines).toHaveLength(1);
    expect(order2.lines[0].qty).toBe(1);
    await Utils.clickDisplayedProduct("TEST 2");
    expect(order2.lines[0].qty).toBe(2);
    const floatingBtns = queryAll(".list-container-items .floating-order-container .btn");
    await contains(floatingBtns[0]).click();
    await animationFrame();
    expect(store.getOrder()).toBe(order1);
    expect(order1.lines[0].qty).toBe(2);
    await waitFor(".product-screen");
    const floatingBtns2 = queryAll(".list-container-items .floating-order-container .btn");
    await contains(floatingBtns2[1]).click();
    await animationFrame();
    expect(store.getOrder()).toBe(order2);
    expect(order2.lines[0].qty).toBe(2);
    if (Utils.isMobile()) {
        await contains(".product-screen .mobile-more-button").click();
    } else {
        await contains(".product-screen .more-btn").click();
    }
    await animationFrame();
    await press("9");
    await animationFrame();
    await advanceTime(200);
    await Utils.cancelDialog();
    await waitFor(".product-screen");
    expect(order2.lines[0].qty).toBe(2);
    const numberBuffer = getService("number_buffer");
    expect(numberBuffer.get()).toBe("");
});

test("PaymentScreenRoundingUp: cash rounding up with refund", async () => {
    const store = await setupAndMountPosApp({ use_pricelist: false });

    const productTmpl = store.models["product.template"].get(5);
    productTmpl.list_price = 1.96;
    productTmpl.taxes_id = false;
    store.models["product.product"].get(5).lst_price = 1.96;

    const rounding = store.models["account.cash.rounding"].create({
        id: 1,
        name: "Rounding up",
        rounding: 0.05,
        rounding_method: "UP",
    });
    store.config.rounding_method = rounding;
    store.config.cash_rounding = true;
    store.config.only_round_cash_method = true;
    await animationFrame();

    const order = store.getOrder();
    order.setPricelist(false);
    await Utils.clickDisplayedProduct("TEST");
    expect(order.lines).toHaveLength(1);
    expect(Utils.getOrderTotal().includes("1.96")).toBe(true);

    await Utils.clickPayButton();
    await waitFor(".payment-screen");

    await Utils.clickPaymentMethod("Cash");
    expect(order.payment_ids[0].amount).toBe(2.0);

    await Utils.clickValidatePayment();

    await Utils.closePrintingError();
    await Utils.clickNextOrder();
    await waitFor(".product-screen");

    await Utils.clickOrders();
    await waitFor(".ticket-screen");

    await waitFor(".ticket-screen");
    await contains(".ticket-screen .filter").click();
    await animationFrame();
    await contains('.dropdown-item:contains("Paid")').click();
    await animationFrame();
    await contains('.ticket-screen .order-row:contains("001")').click();
    await animationFrame();

    if (Utils.isMobile()) {
        await Utils.clickTicketReviewButton();
        Utils.sendBufferKeys("1");
        await animationFrame();
        await Utils.clickTicketAction("Refund");
    } else {
        await Utils.clickNumpad("1");
        await contains('.ticket-screen .pads button:contains("Refund")').click();
        await animationFrame();
    }

    await waitFor(".payment-screen");

    const refundOrder = store.getOrder();
    await Utils.clickPaymentMethod("Cash");
    expect(refundOrder.payment_ids[0].amount).toBe(-2.0);
});

test("PaymentScreenRoundingDown: cash rounding down with refund", async () => {
    const store = await setupAndMountPosApp({ use_pricelist: false });

    const productTmpl = store.models["product.template"].get(5);
    productTmpl.list_price = 1.98;
    productTmpl.taxes_id = false;
    store.models["product.product"].get(5).lst_price = 1.98;

    const rounding = store.models["account.cash.rounding"].create({
        id: 1,
        name: "Rounding down",
        rounding: 0.05,
        rounding_method: "DOWN",
    });
    store.config.rounding_method = rounding;
    store.config.cash_rounding = true;
    store.config.only_round_cash_method = true;
    await animationFrame();

    const order = store.getOrder();
    order.setPricelist(false);
    await Utils.clickDisplayedProduct("TEST");
    expect(order.lines).toHaveLength(1);
    expect(Utils.getOrderTotal().includes("1.98")).toBe(true);

    await Utils.clickPayButton();
    await waitFor(".payment-screen");

    await Utils.clickPaymentMethod("Cash");
    expect(order.payment_ids[0].amount).toBe(1.95);

    await Utils.clickValidatePayment();

    await Utils.closePrintingError();
    await Utils.clickNextOrder();
    await waitFor(".product-screen");

    await Utils.clickOrders();
    await waitFor(".ticket-screen");

    await waitFor(".ticket-screen");
    await contains(".ticket-screen .filter").click();
    await animationFrame();
    await contains('.dropdown-item:contains("Paid")').click();
    await animationFrame();
    await contains('.ticket-screen .order-row:contains("001")').click();
    await animationFrame();

    if (Utils.isMobile()) {
        await Utils.clickTicketReviewButton();
        Utils.sendBufferKeys("1");
        await animationFrame();
        await Utils.clickTicketAction("Refund");
    } else {
        await Utils.clickNumpad("1");
        await contains('.ticket-screen .pads button:contains("Refund")').click();
        await animationFrame();
    }

    await waitFor(".payment-screen");

    const refundOrder = store.getOrder();
    await Utils.clickPaymentMethod("Cash");
    expect(refundOrder.payment_ids[0].amount).toBe(-1.95);
});

test("PaymentScreenTotalDueWithOverPayment: overpayment shows correct change", async () => {
    const store = await setupAndMountPosApp({ use_pricelist: false });

    const productTmpl = store.models["product.template"].get(5);
    productTmpl.list_price = 1.98;
    productTmpl.taxes_id = false;
    store.models["product.product"].get(5).lst_price = 1.98;

    const rounding = store.models["account.cash.rounding"].create({
        id: 1,
        name: "Rounding down",
        rounding: 0.05,
        rounding_method: "DOWN",
    });
    store.config.rounding_method = rounding;
    store.config.cash_rounding = true;
    store.config.only_round_cash_method = true;
    await animationFrame();

    const order = store.getOrder();
    order.setPricelist(false);
    await Utils.clickDisplayedProduct("TEST");
    expect(order.lines).toHaveLength(1);
    expect(Utils.getOrderTotal().includes("1.98")).toBe(true);

    await Utils.clickPayButton();
    await waitFor(".payment-screen");

    await Utils.clickPaymentMethod("Cash");
    await Utils.sendBufferKeys("5");

    expect(order.payment_ids[0].amount).toBe(5);
    expect(order.change).toBe(-3.05);
});

test("FiscalPositionNoTax: fiscal position maps tax to no tax", async () => {
    const store = await setupAndMountPosApp({ use_pricelist: false });

    const tax = store.models["account.tax"].create({
        id: 100,
        name: "Tax 15%",
        amount: 15,
        price_include_override: "tax_included",
        price_include: true,
        amount_type: "percent",
        type_tax_use: "sale",
        include_base_amount: false,
        is_base_affected: true,
        has_negative_factor: false,
        company_id: 250,
        sequence: 1,
        tax_group_id: 1,
        fiscal_position_ids: [store.models["account.fiscal.position"].get(1)],
    });

    const productTmpl = store.models["product.template"].get(5);
    productTmpl.list_price = 100;
    productTmpl.taxes_id = [tax];
    store.models["product.product"].get(5).lst_price = 100;

    const fpNoTax = store.models["account.fiscal.position"].get(2);
    store.config.tax_regime_selection = true;
    store.config.fiscal_position_ids = [fpNoTax];
    await animationFrame();

    const order = store.getOrder();
    order.setPricelist(false);
    await Utils.clickDisplayedProduct("TEST");
    expect(order.lines).toHaveLength(1);
    expect(Utils.getOrderTotal().includes("100.00")).toBe(true);

    await Utils.clickControlButton("Tax");
    await waitFor(".selection-item");
    await contains('.selection-item:contains("No tax fp")').click();
    await animationFrame();

    expect(Utils.getOrderTotal().includes("100.00")).toBe(true);

    await Utils.clickPayButton();
    await waitFor(".payment-screen");
    await Utils.clickPaymentMethod("Card");
    await Utils.clickValidatePayment();

    const paidOrder = order;
    expect(paidOrder.lines[0].discount).toBe(undefined);
});

test("FiscalPositionIncl: inclusive tax mapped to inclusive and exclusive", async () => {
    const store = await setupAndMountPosApp({ use_pricelist: false });

    const fpInclToIncl = store.models["account.fiscal.position"].create({
        id: 10,
        name: "Incl. to Incl.",
        display_name: "Incl. to Incl.",
        tax_map: { 110: [111] },
    });
    const fpInclToExcl = store.models["account.fiscal.position"].create({
        id: 11,
        name: "Incl. to Excl.",
        display_name: "Incl. to Excl.",
        tax_map: { 110: [112] },
    });

    const taxIncl20 = store.models["account.tax"].create({
        id: 110,
        name: "Tax incl.20%",
        amount: 20,
        price_include_override: "tax_included",
        price_include: true,
        amount_type: "percent",
        type_tax_use: "sale",
        include_base_amount: false,
        is_base_affected: true,
        has_negative_factor: false,
        company_id: 250,
        sequence: 1,
        tax_group_id: 1,
    });

    store.models["account.tax"].create({
        id: 111,
        name: "Tax incl.10%",
        amount: 10,
        price_include_override: "tax_included",
        price_include: true,
        amount_type: "percent",
        type_tax_use: "sale",
        include_base_amount: false,
        is_base_affected: true,
        has_negative_factor: false,
        company_id: 250,
        sequence: 1,
        tax_group_id: 1,
        fiscal_position_ids: [fpInclToIncl],
        original_tax_ids: [taxIncl20],
    });

    store.models["account.tax"].create({
        id: 112,
        name: "Tax excl.10%",
        amount: 10,
        price_include_override: "tax_excluded",
        amount_type: "percent",
        type_tax_use: "sale",
        include_base_amount: false,
        is_base_affected: true,
        has_negative_factor: false,
        company_id: 250,
        sequence: 1,
        tax_group_id: 1,
        fiscal_position_ids: [fpInclToExcl],
        original_tax_ids: [taxIncl20],
    });

    const productTmpl = store.models["product.template"].get(5);
    productTmpl.list_price = 100;
    productTmpl.taxes_id = [taxIncl20];
    store.models["product.product"].get(5).lst_price = 100;

    store.config.tax_regime_selection = true;
    store.config.fiscal_position_ids = [fpInclToIncl, fpInclToExcl];
    await animationFrame();

    const order = store.getOrder();
    order.setPricelist(false);
    await Utils.clickDisplayedProduct("TEST");
    expect(Utils.getOrderTotal().includes("100.00")).toBe(true);

    await Utils.clickControlButton("Tax");
    await waitFor(".selection-item");
    await contains('.selection-item:contains("Incl. to Incl.")').click();
    await animationFrame();
    expect(Utils.getOrderTotal().includes("100.00")).toBe(true);

    await Utils.clickControlButton("Tax");
    await waitFor(".selection-item");
    await contains('.selection-item:contains("Incl. to Excl.")').click();
    await animationFrame();
    expect(Utils.getOrderTotal().includes("110.00")).toBe(true);

    await Utils.clickPayButton();
    await waitFor(".payment-screen");
    await Utils.clickPaymentMethod("Card");
    await Utils.clickValidatePayment();
});

test("FiscalPositionExcl: exclusive tax mapped to exclusive and inclusive", async () => {
    const store = await setupAndMountPosApp({ use_pricelist: false });

    const fpExclToExcl = store.models["account.fiscal.position"].create({
        id: 12,
        name: "Excl. to Excl.",
        display_name: "Excl. to Excl.",
        tax_map: { 120: [121] },
    });
    const fpExclToIncl = store.models["account.fiscal.position"].create({
        id: 13,
        name: "Excl. to Incl.",
        display_name: "Excl. to Incl.",
        tax_map: { 120: [122] },
    });

    const taxExcl20 = store.models["account.tax"].create({
        id: 120,
        name: "Tax excl.20%",
        amount: 20,
        price_include_override: "tax_excluded",
        amount_type: "percent",
        type_tax_use: "sale",
        include_base_amount: false,
        is_base_affected: true,
        has_negative_factor: false,
        company_id: 250,
        sequence: 1,
        tax_group_id: 1,
    });

    store.models["account.tax"].create({
        id: 121,
        name: "Tax excl.10%",
        amount: 10,
        price_include_override: "tax_excluded",
        amount_type: "percent",
        type_tax_use: "sale",
        include_base_amount: false,
        is_base_affected: true,
        has_negative_factor: false,
        company_id: 250,
        sequence: 1,
        tax_group_id: 1,
        fiscal_position_ids: [fpExclToExcl],
        original_tax_ids: [taxExcl20],
    });

    store.models["account.tax"].create({
        id: 122,
        name: "Tax incl.10%",
        amount: 10,
        price_include_override: "tax_included",
        price_include: true,
        amount_type: "percent",
        type_tax_use: "sale",
        include_base_amount: false,
        is_base_affected: true,
        has_negative_factor: false,
        company_id: 250,
        sequence: 1,
        tax_group_id: 1,
        fiscal_position_ids: [fpExclToIncl],
        original_tax_ids: [taxExcl20],
    });

    const productTmpl = store.models["product.template"].get(5);
    productTmpl.list_price = 100;
    productTmpl.taxes_id = [taxExcl20];
    store.models["product.product"].get(5).lst_price = 100;

    store.config.tax_regime_selection = true;
    store.config.fiscal_position_ids = [fpExclToExcl, fpExclToIncl];
    await animationFrame();

    const order = store.getOrder();
    order.setPricelist(false);
    await Utils.clickDisplayedProduct("TEST");
    expect(Utils.getOrderTotal().includes("120.00")).toBe(true);

    await Utils.clickControlButton("Tax");
    await waitFor(".selection-item");
    await contains('.selection-item:contains("Excl. to Excl.")').click();
    await animationFrame();
    expect(Utils.getOrderTotal().includes("110.00")).toBe(true);

    await Utils.clickControlButton("Tax");
    await waitFor(".selection-item");
    await contains('.selection-item:contains("Excl. to Incl.")').click();
    await animationFrame();
    expect(Utils.getOrderTotal().includes("100.00")).toBe(true);

    await Utils.clickPayButton();
    await waitFor(".payment-screen");
    await Utils.clickPaymentMethod("Card");
    await Utils.clickValidatePayment();
});

test("test_line_configurators_product: line configurators product", async () => {
    const store = await setupAndMountPosApp({ use_pricelist: false });

    createConfigurableChair(store);
    await animationFrame();

    await Utils.clickDisplayedProduct("Configurable Chair");
    await waitFor(".modal");

    await contains('.modal label[data-color="Blue"], .modal label[title="Blue"]').click();
    await animationFrame();
    await contains(".modal select.configurator_select").select("9802");
    await animationFrame();
    await contains('.modal label:contains("Other")').click();
    await animationFrame();
    await contains(".modal input.custom_value").edit("Azerty");
    await animationFrame();
    await contains('.modal label:contains("Cushion")').click();
    await animationFrame();
    await contains('.modal label:contains("Headrest")').click();
    await animationFrame();

    await contains(".modal .btn-primary").click();
    await animationFrame();

    const order = store.getOrder();
    expect(order.lines).toHaveLength(1);
    expectConfiguredChairLine(order.lines[0]);
});

test("test_line_configurators_combo: line configurators combo", async () => {
    const store = await setupAndMountPosApp({ use_pricelist: false });

    createConfigurableChair(store);
    createComboProduct(store, {
        template: store.models["product.template"].get(5),
        values: {},
        payload: {
            attribute_value_ids: [9801, 9802, 9803, 9804, 9805],
            attribute_custom_values: { 9803: "Azerty" },
            price_extra: 0,
            qty: 1,
        },
    });
    await animationFrame();

    await Utils.clickDisplayedProduct("Office Combo Test");
    await waitFor(".modal");

    await Utils.selectComboItem("Combo Product 2");

    await Utils.selectComboItem("TEST");
    await waitFor('.modal label[data-color="Blue"], .modal label[title="Blue"]');
    await contains('.modal label[data-color="Blue"], .modal label[title="Blue"]').click();
    await animationFrame();
    await contains(".modal select.configurator_select").select("9802");
    await animationFrame();
    await contains('.modal label:contains("Other")').click();
    await animationFrame();
    await contains(".modal input.custom_value").edit("Azerty");
    await animationFrame();
    await contains('.modal label:contains("Cushion")').click();
    await animationFrame();
    await contains('.modal label:contains("Headrest")').click();
    await animationFrame();
    await contains(".modal .btn-primary:eq(1)").click();
    await animationFrame();

    await Utils.selectComboItem("Combo Product 6");

    await Utils.confirmCombo();

    const order = store.getOrder();
    const parentLine = order.lines.find((l) => l.combo_line_ids?.length);
    expect(parentLine).not.toBe(null);
    const childLines = parentLine.getAllLinesInCombo().filter((line) => line.combo_item_id);
    const configuredLine = childLines.find((l) => l.product_id.name === "Configurable Chair");
    expectConfiguredChairLine(configuredLine);
});

test("MultiProductOptionsTour: multi product options shows all values", async () => {
    const store = await setupAndMountPosApp({ use_pricelist: false });

    const attribute = createAttribute(store, "Multi", "multi");
    const value1 = createAttributeValue(store, attribute, "Value 1");
    const value2 = createAttributeValue(store, attribute, "Value 2");
    const attrLine = createAttributeLine(store, attribute, [value1, value2]);

    const product = store.models["product.template"].get(5);
    product.update({
        attribute_line_ids: [attrLine],
        name: "Product A",
        display_name: "Product A",
        taxes_id: [],
    });
    await animationFrame();

    await Utils.clickDisplayedProduct("Product A");
    await waitFor(".modal");

    await waitFor('.form-check-label:contains("Value 1")');
    await waitFor('.form-check-label:contains("Value 2")');

    await contains(".modal .btn-primary").click();
    await animationFrame();
});

test("DecimalCommaOrderlinePrice: decimal comma orderline price format", async () => {
    localization.decimalPoint = ",";
    localization.thousandsSep = ".";

    const store = await setupAndMountPosApp({ use_pricelist: false });

    const productTmpl = store.models["product.template"].get(5);
    productTmpl.list_price = 1453.53;
    productTmpl.taxes_id = [];
    store.models["product.product"].get(5).lst_price = 1453.53;

    const order = store.getOrder();
    order.setPricelist(false);
    await animationFrame();

    await Utils.clickDisplayedProduct("TEST");
    await Utils.sendBufferKeys("5");

    expect(order.lines[0].qty).toBe(5);
    expect(order.lines[0].displayPrice).toBe(7267.65);
});

test("PosCategoriesOrder: pos categories keep sequence and hierarchy", async () => {
    await setupAndMountPosApp();

    await waitFor(".category-list");
    const categoryButtons = queryAll(".category-button span");
    const categoryNames = categoryButtons.map((el) => el.textContent.trim());
    expect(categoryNames).toInclude("Category 1");
    expect(categoryNames).toInclude("Category 2");
    expect(categoryNames).toInclude("Food");
});

test("AutofillCashCount: cash count autofill with comma decimal separator", async () => {
    localization.decimalPoint = ",";
    localization.thousandsSep = ".";

    const store = await setupAndMountPosApp({ use_pricelist: false });

    const productTmpl = store.models["product.template"].get(5);
    productTmpl.list_price = 123456;
    productTmpl.taxes_id = [];
    store.models["product.product"].get(5).lst_price = 123456;

    const order = store.getOrder();
    order.setPricelist(false);
    await animationFrame();

    await Utils.clickDisplayedProduct("TEST");
    await Utils.clickPayButton();
    await waitFor(".payment-screen");
    await Utils.clickPaymentMethod("Cash");

    expect(order.payment_ids[0].amount).toBe(123456);
    await Utils.clickValidatePayment();
    await Utils.closePrintingError();
    await Utils.clickNextOrder();
    await waitFor(".product-screen");

    await contains(".pos-leftheader .fa-bars, .pos-topheader .fa-bars").click();
    await animationFrame();
    await contains(
        '.dropdown-item:contains("Close Register"), .o-dropdown-item:contains("Close Register")'
    ).click();
    await animationFrame();

    await waitFor(".close-pos-popup");
    expect(document.querySelector(".close-pos-popup .cash-difference").textContent).toInclude("0");
});

test("SearchProducts: product search is case-insensitive and accent-aware", async () => {
    const store = await setupAndMountPosApp();

    const category = store.models["pos.category"].get(1);
    const createTestProduct = (id, name, opts = {}) => {
        const tmpl = store.models["product.template"].create({
            id,
            name,
            display_name: name,
            available_in_pos: true,
            active: true,
            type: "consu",
            uom_id: store.models["uom.uom"].get(1),
            taxes_id: [],
            list_price: 10,
            pos_categ_ids: [category],
            attribute_line_ids: [],
            combo_ids: [],
            product_variant_ids: [],
            pos_sequence: 5,
            sequence: 1,
        });
        const variant = store.models["product.product"].create({
            id,
            product_tmpl_id: tmpl,
            lst_price: 10,
            display_name: name,
            barcode: opts.barcode || false,
            default_code: opts.default_code || false,
            product_template_attribute_value_ids: [],
            product_template_variant_value_ids: [],
            product_tag_ids: [],
            pos_categ_ids: [category.id],
        });
        tmpl.product_variant_ids = [variant];
    };

    createTestProduct(300, "Test chair 1");
    createTestProduct(301, "Test CHAIR 2");
    createTestProduct(302, "Test sofa", { default_code: "CHAIR_01" });
    createTestProduct(303, "clémentine");
    await animationFrame();

    const searchInput = ".pos-rightheader .form-control > input";

    if (Utils.isMobile()) {
        await contains(".fa-search").click();
        await animationFrame();
    }
    await contains(searchInput).edit("chair");
    await animationFrame();

    await waitFor('article.product .product-name:contains("Test chair 1")');
    await waitFor('article.product .product-name:contains("Test CHAIR 2")');
    await waitFor('article.product .product-name:contains("Test sofa")');

    await contains(searchInput).edit("clémentine");
    await animationFrame();

    await waitFor('article.product .product-name:contains("clémentine")');
});

test("ProductCardUoMPrecision: product card shows correct quantity precision", async () => {
    const store = await setupAndMountPosApp({ use_pricelist: false });

    createConfigurableChair(store);
    await animationFrame();

    await Utils.clickDisplayedProduct("Configurable Chair");
    await waitFor(".modal");
    await contains('.modal label:contains("Leather")').click();
    await animationFrame();
    await contains(".modal .btn-primary").click();
    await animationFrame();

    const order = store.getOrder();
    expect(order.lines).toHaveLength(1);

    await Utils.sendBufferKeys(".", "1");
    expect(order.lines[0].qty).toBe(0.1);

    await Utils.clickDisplayedProduct("Configurable Chair");
    await waitFor(".modal");
    await contains('.modal label:contains("wool")').click();
    await animationFrame();
    await contains(".modal .btn-primary").click();
    await animationFrame();

    expect(order.lines).toHaveLength(2);

    await Utils.sendBufferKeys(".", "7");
    expect(order.lines[1].qty).toBe(0.7);

    const totalQty = order.lines
        .filter((l) => l.product_id.name === "Configurable Chair")
        .reduce((sum, l) => sum + l.qty, 0);
    expect(Math.round(totalQty * 10) / 10).toBe(0.8);
});

test("test_ctrl_number_ignored: ctrl+number does not change the order line", async () => {
    const store = await setupAndMountPosApp();

    await Utils.clickDisplayedProduct("TEST");
    const order = store.getOrder();
    expect(order.lines).toHaveLength(1);
    expect(order.lines[0].qty).toBe(1);

    window.dispatchEvent(new KeyboardEvent("keyup", { key: "5", ctrlKey: true }));
    await animationFrame();
    await advanceTime(350);

    expect(order.lines[0].qty).toBe(1);
});

test("test_click_all_orders_keep_customer: all orders keeps the selected customer", async () => {
    const store = await setupAndMountPosApp();

    const partner = store.models["res.partner"].get(3);

    await Utils.clickPartnerButton();
    await contains(`.partner-line:contains("${partner.name}")`).click();
    await animationFrame();

    expect(store.getOrder().partner_id.id).toBe(partner.id);

    await Utils.clickPartnerButton();
    await contains(`.partner-line:contains("${partner.name}") .fa-bars`).click();
    await animationFrame();
    await contains('.dropdown-item:contains("All Orders")').click();
    await animationFrame();
    await waitFor(".ticket-screen");

    await Utils.clickRegister();
    await waitFor(".product-screen");

    expect(store.getOrder().partner_id.id).toBe(partner.id);
});

test("test_quantity_package_of_non_basic_unit: barcode packaging sets the packaged quantity", async () => {
    patchWithCleanup(session, { nomenclature_id: 1 });
    const store = await setupAndMountPosApp();

    const baseUom = store.models["uom.uom"].create({
        id: 9301,
        name: "test unit uom",
        factor: 1,
        is_pos_groupable: false,
        parent_path: "9301/",
    });
    const packageUom = store.models["uom.uom"].create({
        id: 9302,
        name: "Pack of 12 unit",
        factor: 12,
        is_pos_groupable: true,
        parent_path: "9301/9302/",
    });
    const category = store.models["pos.category"].get(1);
    const productTmpl = store.models["product.template"].create({
        id: 9303,
        name: "Cord",
        display_name: "Cord",
        available_in_pos: true,
        active: true,
        type: "consu",
        uom_id: baseUom,
        tracking: "none",
        taxes_id: [],
        product_variant_ids: [],
        attribute_line_ids: [],
        combo_ids: [],
        pos_categ_ids: [category],
    });
    const variant = store.models["product.product"].create({
        id: 9304,
        name: "Cord",
        display_name: "Cord",
        product_tmpl_id: productTmpl,
        lst_price: 10,
        standard_price: 0,
        barcode: false,
        default_code: false,
        product_template_attribute_value_ids: [],
        product_template_variant_value_ids: [],
        product_tag_ids: [],
        pos_categ_ids: [category.id],
    });
    productTmpl.product_variant_ids = [variant];
    store.models["product.uom"].create({
        id: 9305,
        barcode: "555555",
        product_id: variant,
        uom_id: packageUom,
    });

    getService("barcode").bus.trigger("barcode_scanned", { barcode: "555555" });
    await animationFrame();
    await animationFrame();

    const order = store.getOrder();
    expect(order.lines).toHaveLength(1);
    expect(order.lines[0].product_id.id).toBe(variant.id);
    expect(order.lines[0].qty).toBe(12);
});

test("test_attribute_order: attributes keep the configured display order", async () => {
    const store = await setupAndMountPosApp({ use_pricelist: false });

    const category = store.models["pos.category"].get(1);
    const attribute1 = createAttribute(store, "Attribute 1", "radio");
    const attribute2 = createAttribute(store, "Attribute 2", "radio");
    const attribute3 = createAttribute(store, "Attribute 3", "radio");
    const value1 = createAttributeValue(store, attribute1, "Value 1");
    const value2 = createAttributeValue(store, attribute2, "Value 2");
    const value3 = createAttributeValue(store, attribute3, "Value 3");
    const value4 = createAttributeValue(store, attribute3, "Value 4");

    const product = store.models["product.template"].create({
        id: 9900,
        name: "Product Test",
        display_name: "Product Test",
        available_in_pos: true,
        active: true,
        type: "consu",
        uom_id: store.models["uom.uom"].get(1),
        tracking: "none",
        taxes_id: [],
        product_variant_ids: [],
        attribute_line_ids: [
            createAttributeLine(store, attribute1, [value1]),
            createAttributeLine(store, attribute2, [value2]),
            createAttributeLine(store, attribute3, [value3, value4]),
        ],
        combo_ids: [],
        pos_categ_ids: [category],
    });
    const variant = store.models["product.product"].create({
        id: 9901,
        name: "Product Test",
        display_name: "Product Test",
        product_tmpl_id: product,
        lst_price: 10,
        standard_price: 0,
        barcode: false,
        default_code: false,
        product_template_attribute_value_ids: [],
        product_template_variant_value_ids: [],
        product_tag_ids: [],
        pos_categ_ids: [category.id],
    });
    product.product_variant_ids = [variant];
    await animationFrame();

    await Utils.clickDisplayedProduct("Product Test");
    await waitFor(".modal");

    await contains('.modal label:contains("Value 1")').click();
    await animationFrame();
    await contains('.modal label:contains("Value 2")').click();
    await animationFrame();
    await contains('.modal label:contains("Value 3")').click();
    await animationFrame();

    await contains(".modal .btn-primary").click();
    await animationFrame();

    const order = store.getOrder();
    expect(order.lines).toHaveLength(1);
    expect(order.lines[0].getFullProductName()).toBe("Product Test (Value 1, Value 2, Value 3)");
});

test("test_combo_variant_mix: combo with variant and no_variant attributes", async () => {
    const store = await setupAndMountPosApp({ use_pricelist: false });

    const category = store.models["pos.category"].get(1);
    const colorAttribute = createAttribute(store, "Color", "radio");
    const sizeAttribute = createAttribute(store, "Size", "radio", "always");

    const red = createAttributeValue(store, colorAttribute, "Red", { id: 9501 });
    const blue = createAttributeValue(store, colorAttribute, "Blue", { id: 9502 });
    const small = createAttributeValue(store, sizeAttribute, "Small", { id: 9503 });
    const large = createAttributeValue(store, sizeAttribute, "Large", { id: 9504 });

    const productTmpl = store.models["product.template"].create({
        id: 9510,
        name: "Test Product",
        display_name: "Test Product",
        available_in_pos: true,
        active: true,
        type: "consu",
        uom_id: store.models["uom.uom"].get(1),
        tracking: "none",
        taxes_id: [],
        product_variant_ids: [],
        attribute_line_ids: [
            createAttributeLine(store, colorAttribute, [red, blue]),
            createAttributeLine(store, sizeAttribute, [small, large]),
        ],
        combo_ids: [],
        pos_categ_ids: [category],
    });
    const variantSmall = store.models["product.product"].create({
        id: 9511,
        name: "Test Product",
        display_name: "Test Product (Small)",
        product_tmpl_id: productTmpl,
        lst_price: 10,
        standard_price: 0,
        barcode: false,
        default_code: false,
        product_template_attribute_value_ids: [small],
        product_template_variant_value_ids: [small],
        product_tag_ids: [],
        pos_categ_ids: [category.id],
    });
    const variantLarge = store.models["product.product"].create({
        id: 9512,
        name: "Test Product",
        display_name: "Test Product (Large)",
        product_tmpl_id: productTmpl,
        lst_price: 10,
        standard_price: 0,
        barcode: false,
        default_code: false,
        product_template_attribute_value_ids: [large],
        product_template_variant_value_ids: [large],
        product_tag_ids: [],
        pos_categ_ids: [category.id],
    });
    productTmpl.product_variant_ids = [variantSmall, variantLarge];

    const comboItemSmall = store.models["product.combo.item"].create({
        id: 9521,
        combo_id: false,
        product_id: variantSmall,
        extra_price: 0,
    });
    const comboItemLarge = store.models["product.combo.item"].create({
        id: 9522,
        combo_id: false,
        product_id: variantLarge,
        extra_price: 0,
    });
    const combo = store.models["product.combo"].create({
        id: 9530,
        name: "Test Combo",
        combo_item_ids: [comboItemSmall, comboItemLarge],
        base_price: 20,
        qty_free: 1,
        qty_max: 1,
        is_upsell: false,
        sequence: 1,
    });
    comboItemSmall.combo_id = combo;
    comboItemLarge.combo_id = combo;

    const comboProductTmpl = store.models["product.template"].create({
        id: 9540,
        name: "Test Product Combo",
        display_name: "Test Product Combo",
        available_in_pos: true,
        active: true,
        type: "combo",
        uom_id: store.models["uom.uom"].get(1),
        tracking: "none",
        taxes_id: [],
        product_variant_ids: [],
        attribute_line_ids: [],
        combo_ids: [combo],
        pos_categ_ids: [category],
    });
    const comboVariant = store.models["product.product"].create({
        id: 9541,
        name: "Test Product Combo",
        display_name: "Test Product Combo",
        product_tmpl_id: comboProductTmpl,
        lst_price: 20,
        standard_price: 0,
        barcode: false,
        default_code: false,
        product_template_attribute_value_ids: [],
        product_template_variant_value_ids: [],
        product_tag_ids: [],
        pos_categ_ids: [category.id],
    });
    comboProductTmpl.product_variant_ids = [comboVariant];
    await animationFrame();

    await Utils.clickDisplayedProduct("Test Product Combo");
    await waitFor(".modal");

    await Utils.selectComboItem("Test Product (Large)");
    await waitFor('.modal label:contains("Blue")');
    await contains('.modal label:contains("Blue")').click();
    await animationFrame();
    await contains(".modal .btn-primary:eq(1)").click();
    await animationFrame();

    await Utils.confirmCombo();

    const order = store.getOrder();
    const comboLine = order.lines.find((l) => l.combo_parent_id);
    expect(comboLine).not.toBe(null);
    expect(comboLine.product_id.id).toBe(variantLarge.id);
    expect(comboLine.attribute_value_ids.map((v) => v.name).sort()).toEqual(["Blue", "Large"]);
});

test("test_custom_attribute_alone_displayed: custom attribute shows configurator", async () => {
    const store = await setupAndMountPosApp({ use_pricelist: false });

    const attribute = createAttribute(store, "Custom", "radio");
    const customValue = createAttributeValue(store, attribute, "Custom", {
        id: 9810,
        isCustom: true,
    });
    const attrLine = createAttributeLine(store, attribute, [customValue]);

    const product = store.models["product.template"].get(5);
    product.update({
        attribute_line_ids: [attrLine],
        name: "Only Custom",
        display_name: "Only Custom",
        taxes_id: [],
    });
    await animationFrame();

    await Utils.clickDisplayedProduct("Only Custom");
    await waitFor(".modal");

    await contains(".modal .custom_value").edit("Filling");
    await animationFrame();

    await contains(".modal .btn-primary").click();
    await animationFrame();

    const order = store.getOrder();
    expect(order.lines).toHaveLength(1);
    expect(order.lines[0].custom_attribute_value_ids[0].custom_value).toBe("Filling");
});

test("test_preset_customer_selection: selecting a customer with address preset", async () => {
    const store = await setupAndMountPosApp({
        use_presets: true,
        default_preset_id: 4,
        available_preset_ids: [4],
    });

    const partner = store.models["res.partner"].create({
        id: 9201,
        name: "Partner Full",
        street: "77 Santa Barbara Rd",
        city: "Pleasant Hill",
        zip: "94523",
        address: "77 Santa Barbara Rd Pleasant Hill",
        barcode: false,
        email: false,
        phone: false,
        lang: "en_US",
        parent_name: false,
        fiscal_position_id: false,
        invoice_emails: "",
        property_product_pricelist: false,
        write_date: "2025-07-03 12:38:12",
    });
    await animationFrame();
    await Utils.cancelDialog();
    await Utils.clickPartnerButton();
    await waitFor(".partner-list");
    await contains(".modal-header input").edit("Partner Full");
    await animationFrame();
    await contains(`.partner-line:contains("Partner Full")`).click();
    await animationFrame();

    expect(store.getOrder().partner_id.id).toBe(partner.id);

    await Utils.clickOrders();
    await waitFor(".ticket-screen");

    const addressCell = document.querySelector(".address-cell");
    expect(addressCell.textContent).toInclude("77 Santa Barbara Rd Pleasant Hill");
});

test("test_pos_large_amount_confirmation_dialog: large payment asks for confirmation", async () => {
    const store = await setupAndMountPosApp();

    await Utils.clickDisplayedProduct("TEST");
    const order = store.getOrder();

    await Utils.clickPayButton();
    await waitFor(".payment-screen");

    await Utils.clickPaymentMethod("Cash");
    await Utils.sendBufferKeys("1", "5", "0", "0");

    expect(order.payment_ids[0].amount).toBe(1500);

    await Utils.clickValidatePayment();
    await waitFor(".modal");

    await contains(".modal .modal-footer .btn-primary").click();
    await animationFrame();
});

test("test_add_money_button_with_different_decimal_separator: +50 button works with comma separator", async () => {
    await setupAndMountPosApp();
    patchWithCleanup(localization, { decimalPoint: ",", thousandsSep: "." });

    await Utils.clickDisplayedProduct("TEST");
    await Utils.clickPayButton();
    await waitFor(".payment-screen");

    await Utils.clickPaymentMethod("Card");

    await contains('.numpad button:contains("+50")').click();
    await animationFrame();
    await advanceTime(350);
    expect(await Utils.selectedPaymentLineHasAmount("$53,45")).toBe(true);
});

test("test_convert_orderlines_to_combo: convert orderlines to combo and break", async () => {
    const store = await setupAndMountPosApp({ use_pricelist: false });

    const category = store.models["pos.category"].get(1);

    const createProduct = (id, name, price = 10) => {
        const tmpl = store.models["product.template"].create({
            id,
            name,
            display_name: name,
            available_in_pos: true,
            active: true,
            type: "consu",
            uom_id: store.models["uom.uom"].get(1),
            taxes_id: [],
            list_price: price,
            pos_categ_ids: [category],
            attribute_line_ids: [],
            combo_ids: [],
            product_variant_ids: [],
            pos_sequence: 5,
            sequence: 1,
        });
        const variant = store.models["product.product"].create({
            id,
            product_tmpl_id: tmpl,
            lst_price: price,
            display_name: name,
            barcode: false,
            default_code: false,
            product_template_attribute_value_ids: [],
            product_template_variant_value_ids: [],
            product_tag_ids: [],
            pos_categ_ids: [category.id],
        });
        tmpl.product_variant_ids = [variant];
        return variant;
    };

    const cp2 = createProduct(8001, "Combo Product 2", 11);
    const cp4 = createProduct(8002, "Combo Product 4", 20);
    const cp6 = createProduct(8003, "Combo Product 6", 30);
    const cp1 = createProduct(8004, "Combo Product 1", 30);

    const ci1 = store.models["product.combo.item"].create({
        id: 8011,
        combo_id: false,
        product_id: cp2,
        extra_price: 0,
    });
    const ci2 = store.models["product.combo.item"].create({
        id: 8012,
        combo_id: false,
        product_id: cp4,
        extra_price: 0,
    });
    const ci3 = store.models["product.combo.item"].create({
        id: 8013,
        combo_id: false,
        product_id: cp6,
        extra_price: 0,
    });
    const ci4 = store.models["product.combo.item"].create({
        id: 8014,
        combo_id: false,
        product_id: cp1,
        extra_price: 0,
    });

    const combo1 = store.models["product.combo"].create({
        id: 8021,
        name: "First Combo",
        combo_item_ids: [ci1, ci4],
        base_price: 10,
        qty_free: 1,
        qty_max: 1,
        is_upsell: false,
        sequence: 1,
    });
    const combo2 = store.models["product.combo"].create({
        id: 8022,
        name: "Second Combo",
        combo_item_ids: [ci2],
        base_price: 10,
        qty_free: 1,
        qty_max: 1,
        is_upsell: false,
        sequence: 2,
    });
    const combo3 = store.models["product.combo"].create({
        id: 8023,
        name: "Third Combo",
        combo_item_ids: [ci3],
        base_price: 10,
        qty_free: 1,
        qty_max: 1,
        is_upsell: false,
        sequence: 3,
    });
    ci1.combo_id = combo1;
    ci4.combo_id = combo1;
    ci2.combo_id = combo2;
    ci3.combo_id = combo3;

    const officeComboTmpl = store.models["product.template"].create({
        id: 8030,
        name: "Office Combo",
        display_name: "Office Combo",
        available_in_pos: true,
        active: true,
        type: "combo",
        uom_id: store.models["uom.uom"].get(1),
        taxes_id: [],
        list_price: 50,
        product_variant_ids: [],
        attribute_line_ids: [],
        combo_ids: [combo1, combo2, combo3],
        pos_categ_ids: [category],
    });
    const officeComboVariant = store.models["product.product"].create({
        id: 8031,
        name: "Office Combo",
        display_name: "Office Combo",
        product_tmpl_id: officeComboTmpl,
        lst_price: 50,
        standard_price: 0,
        barcode: false,
        default_code: false,
        product_template_attribute_value_ids: [],
        product_template_variant_value_ids: [],
        product_tag_ids: [],
        pos_categ_ids: [category.id],
    });
    officeComboTmpl.product_variant_ids = [officeComboVariant];
    officeComboVariant.type = "combo";
    store.comboSuggestion.productCombos = store.comboSuggestion._getProductCombos();
    await animationFrame();

    await Utils.clickDisplayedProduct("Combo Product 2");
    await Utils.clickDisplayedProduct("Combo Product 4");
    await Utils.clickDisplayedProduct("Combo Product 6");

    const order = store.getOrder();
    expect(order.lines).toHaveLength(3);

    await Utils.ensurePane("left");
    await waitFor(".combo-proposition");
    await contains(".combo-proposition button.btn").click();
    await animationFrame();

    expect(Utils.hasOrderline({ productName: "Office Combo", quantity: "1" })).toBe(true);
    await Utils.clickControlButton("Break Combo");

    expect(Utils.hasOrderline({ productName: "Combo Product 2", quantity: "1" })).toBe(true);
    expect(Utils.hasOrderline({ productName: "Combo Product 4", quantity: "1" })).toBe(true);
    expect(Utils.hasOrderline({ productName: "Combo Product 6", quantity: "1" })).toBe(true);
    expect(Utils.doesNotHaveOrderline({ productName: "Office Combo" })).toBe(true);

    const sp2 = createProduct(8041, "Second Product 2", 11);
    const sp4 = createProduct(8042, "Second Product 4", 20);

    const colorAttr = createAttribute(store, "Color", "color");
    const blueVal = createAttributeValue(store, colorAttr, "Blue", { id: 8050 });
    const redVal = createAttributeValue(store, colorAttr, "Red", { id: 8051 });
    const sp9Tmpl = store.models["product.template"].create({
        id: 8043,
        name: "Second Product 9",
        display_name: "Second Product 9",
        available_in_pos: true,
        active: true,
        type: "consu",
        uom_id: store.models["uom.uom"].get(1),
        taxes_id: [],
        list_price: 50,
        pos_categ_ids: [category],
        attribute_line_ids: [createAttributeLine(store, colorAttr, [blueVal, redVal])],
        combo_ids: [],
        product_variant_ids: [],
        pos_sequence: 5,
        sequence: 1,
    });
    const sp9 = store.models["product.product"].create({
        id: 8043,
        product_tmpl_id: sp9Tmpl,
        lst_price: 50,
        display_name: "Second Product 9",
        barcode: false,
        default_code: false,
        product_template_attribute_value_ids: [],
        product_template_variant_value_ids: [],
        product_tag_ids: [],
        pos_categ_ids: [category.id],
    });
    sp9Tmpl.product_variant_ids = [sp9];

    const sci1 = store.models["product.combo.item"].create({
        id: 8061,
        combo_id: false,
        product_id: sp2,
        extra_price: 0,
    });
    const sci2 = store.models["product.combo.item"].create({
        id: 8062,
        combo_id: false,
        product_id: sp4,
        extra_price: 0,
    });
    const sci3 = store.models["product.combo.item"].create({
        id: 8063,
        combo_id: false,
        product_id: sp9,
        extra_price: 0,
    });
    const sCombo1 = store.models["product.combo"].create({
        id: 8071,
        name: "S First",
        combo_item_ids: [sci1],
        base_price: 10,
        qty_free: 1,
        qty_max: 1,
        is_upsell: false,
        sequence: 1,
    });
    const sCombo2 = store.models["product.combo"].create({
        id: 8072,
        name: "S Second",
        combo_item_ids: [sci2],
        base_price: 10,
        qty_free: 1,
        qty_max: 1,
        is_upsell: false,
        sequence: 2,
    });
    const sCombo3 = store.models["product.combo"].create({
        id: 8073,
        name: "S Third",
        combo_item_ids: [sci3],
        base_price: 10,
        qty_free: 1,
        qty_max: 1,
        is_upsell: false,
        sequence: 3,
    });
    sci1.combo_id = sCombo1;
    sci2.combo_id = sCombo2;
    sci3.combo_id = sCombo3;

    const secondComboTmpl = store.models["product.template"].create({
        id: 8080,
        name: "Second Combo Product",
        display_name: "Second Combo Product",
        available_in_pos: true,
        active: true,
        type: "combo",
        uom_id: store.models["uom.uom"].get(1),
        taxes_id: [],
        list_price: 50,
        product_variant_ids: [],
        attribute_line_ids: [],
        combo_ids: [sCombo1, sCombo2, sCombo3],
        pos_categ_ids: [category],
    });
    const secondComboVariant = store.models["product.product"].create({
        id: 8081,
        name: "Second Combo Product",
        display_name: "Second Combo Product",
        product_tmpl_id: secondComboTmpl,
        lst_price: 50,
        standard_price: 0,
        barcode: false,
        default_code: false,
        product_template_attribute_value_ids: [],
        product_template_variant_value_ids: [],
        product_tag_ids: [],
        pos_categ_ids: [category.id],
    });
    secondComboTmpl.product_variant_ids = [secondComboVariant];
    secondComboVariant.type = "combo";
    store.comboSuggestion.productCombos = store.comboSuggestion._getProductCombos();
    await animationFrame();

    await Utils.clickDisplayedProduct("Second Product 2");
    await Utils.clickDisplayedProduct("Second Product 4");
    await Utils.clickDisplayedProduct("Second Product 9");

    await waitFor(".modal");
    await contains('.modal label[data-color="Blue"], .modal label[title="Blue"]').click();
    await animationFrame();
    await contains(".modal .btn-primary").click();
    await animationFrame();

    await Utils.ensurePane("left");
    await waitFor(".combo-proposition");
    await contains(".combo-proposition button.btn").click();
    await animationFrame();

    await contains(".modal .apply-combo-btn").click();
    await animationFrame();
    await contains(".modal .apply-combo-btn").click();
    await animationFrame();

    expect(Utils.hasOrderline({ productName: "Second Combo Product", quantity: "1" })).toBe(true);
    expect(Utils.hasOrderline({ productName: "Second Product 9", attributeLine: "Blue" })).toBe(
        true
    );

    await Utils.clickPayButton();
    await waitFor(".payment-screen");
    await Utils.clickPaymentMethod("Card");
    await Utils.clickValidatePayment();
});

test("test_convert_orderlines_to_combo_with_upsell: combo suggestion shows prices", async () => {
    const store = await setupAndMountPosApp({ use_pricelist: false });

    const category = store.models["pos.category"].get(1);
    let order = store.getOrder();
    order.setPricelist(false);
    const createProduct = (id, name, price = 10) => {
        const tmpl = store.models["product.template"].create({
            id,
            name,
            display_name: name,
            available_in_pos: true,
            active: true,
            type: "consu",
            uom_id: store.models["uom.uom"].get(1),
            taxes_id: [],
            list_price: price,
            pos_categ_ids: [category],
            attribute_line_ids: [],
            combo_ids: [],
            product_variant_ids: [],
            pos_sequence: 5,
            sequence: 1,
        });
        const variant = store.models["product.product"].create({
            id,
            product_tmpl_id: tmpl,
            lst_price: price,
            display_name: name,
            barcode: false,
            default_code: false,
            product_template_attribute_value_ids: [],
            product_template_variant_value_ids: [],
            product_tag_ids: [],
            pos_categ_ids: [category.id],
        });
        tmpl.product_variant_ids = [variant];
        return variant;
    };

    const cp2 = createProduct(8101, "Combo Product 2", 15);
    const cp4 = createProduct(8102, "Combo Product 4", 25);
    const cp6 = createProduct(8103, "Combo Product 6", 35);
    const sp2 = createProduct(8104, "Second Product 2", 1);
    const sp4 = createProduct(8105, "Second Product 4", 2);
    const sp6 = createProduct(8106, "Second Product 6", 3);

    const ci1 = store.models["product.combo.item"].create({
        id: 8111,
        combo_id: false,
        product_id: cp2,
        extra_price: 0,
    });
    const ci2 = store.models["product.combo.item"].create({
        id: 8112,
        combo_id: false,
        product_id: cp4,
        extra_price: 0,
    });
    const ci3 = store.models["product.combo.item"].create({
        id: 8113,
        combo_id: false,
        product_id: cp6,
        extra_price: 0,
    });
    const si1 = store.models["product.combo.item"].create({
        id: 8114,
        combo_id: false,
        product_id: sp2,
        extra_price: 0,
    });
    const si2 = store.models["product.combo.item"].create({
        id: 8115,
        combo_id: false,
        product_id: sp4,
        extra_price: 0,
    });
    const si3 = store.models["product.combo.item"].create({
        id: 8116,
        combo_id: false,
        product_id: sp6,
        extra_price: 0,
    });

    const combo1 = store.models["product.combo"].create({
        id: 8121,
        name: "First Combo",
        combo_item_ids: [ci1, si1],
        base_price: 10,
        qty_free: 1,
        qty_max: 1,
        is_upsell: false,
        sequence: 1,
    });
    const combo2 = store.models["product.combo"].create({
        id: 8122,
        name: "Second Combo",
        combo_item_ids: [ci2, si2],
        base_price: 10,
        qty_free: 1,
        qty_max: 1,
        is_upsell: false,
        sequence: 2,
    });
    const combo3 = store.models["product.combo"].create({
        id: 8123,
        name: "Third Combo",
        combo_item_ids: [ci3, si3],
        base_price: 10,
        qty_free: 1,
        qty_max: 1,
        is_upsell: false,
        sequence: 3,
    });
    ci1.combo_id = combo1;
    si1.combo_id = combo1;
    ci2.combo_id = combo2;
    si2.combo_id = combo2;
    ci3.combo_id = combo3;
    si3.combo_id = combo3;

    const officeComboTmpl = store.models["product.template"].create({
        id: 8130,
        name: "Office Combo",
        display_name: "Office Combo",
        available_in_pos: true,
        active: true,
        type: "combo",
        uom_id: store.models["uom.uom"].get(1),
        taxes_id: [],
        list_price: 50,
        product_variant_ids: [],
        attribute_line_ids: [],
        combo_ids: [combo1, combo2, combo3],
        pos_categ_ids: [category],
    });
    const officeComboVariant = store.models["product.product"].create({
        id: 8131,
        name: "Office Combo",
        display_name: "Office Combo",
        product_tmpl_id: officeComboTmpl,
        lst_price: 50,
        standard_price: 0,
        barcode: false,
        default_code: false,
        product_template_attribute_value_ids: [],
        product_template_variant_value_ids: [],
        product_tag_ids: [],
        pos_categ_ids: [category.id],
    });
    officeComboTmpl.product_variant_ids = [officeComboVariant];
    officeComboVariant.type = "combo";
    store.comboSuggestion.productCombos = store.comboSuggestion._getProductCombos();
    await animationFrame();

    await Utils.clickDisplayedProduct("Combo Product 2");
    await Utils.clickDisplayedProduct("Combo Product 4");
    await Utils.clickDisplayedProduct("Combo Product 6");
    await Utils.clickDisplayedProduct("Second Product 2");
    await Utils.clickDisplayedProduct("Second Product 4");
    await Utils.clickDisplayedProduct("Second Product 6");

    order = store.getOrder();
    expect(order.lines).toHaveLength(6);

    await Utils.ensurePane("left");
    await waitFor(".combo-proposition");
    await contains(".combo-proposition button.btn").click();
    await animationFrame();

    await waitFor(".modal");

    const comboItems = queryAll(".modal-body .combo-item");
    expect(comboItems.length).toBe(2);

    expect(comboItems[0].textContent).toInclude("Office Combo");
    expect(comboItems[0].textContent).toInclude("50.00");
    expect(comboItems[0].textContent).toInclude("25.00");
    expect(comboItems[0].textContent).toInclude("Save");

    expect(comboItems[1].textContent).toInclude("Office Combo");
    expect(comboItems[1].textContent).toInclude("50.00");
    expect(comboItems[1].textContent).toInclude("44.00");
    expect(comboItems[1].textContent).toInclude("Add");
});

test("test_refund_line_keep_attributes: refund keeps variant attributes", async () => {
    await setupAndMountPosApp();
    await Utils.clickDisplayedProduct("Cake");
    await waitFor(".modal");
    await contains(".modal .btn-primary").click();
    await animationFrame();
    expect(
        Utils.hasOrderline({
            productName: "Cake",
            quantity: "1",
            attributeLine: "Chocolate",
        })
    ).toBe(true);
    await Utils.clickPayButton();
    await waitFor(".payment-screen");
    await Utils.clickPaymentMethod("Card");
    await Utils.clickValidatePayment();
    await Utils.closePrintingError();
    await Utils.clickNextOrder();
    await waitFor(".product-screen");

    await Utils.clickOrders();
    await waitFor(".ticket-screen");
    await contains(".ticket-screen .filter").click();
    await animationFrame();
    await contains('.dropdown-item:contains("Paid")').click();
    await animationFrame();

    await contains('.ticket-screen .order-row:contains("001")').click();
    await animationFrame();

    await Utils.sendBufferKeys("1");

    if (Utils.isMobile()) {
        await Utils.clickTicketReviewButton();
        await Utils.clickTicketAction("Refund");
    } else {
        await contains('.ticket-screen .pads button:contains("Refund")').click();
        await animationFrame();
    }

    await waitFor(".payment-screen");
    await contains(".payment-screen .back").click();
    await animationFrame();
    expect(
        Utils.hasOrderline({
            productName: "Cake",
            quantity: "-1",
            attributeLine: "Chocolate",
        })
    ).toBe(true);
});

test("test_pos_snooze: snooze and unsnooze products", async () => {
    patchWithCleanup(session, { nomenclature_id: 1 });
    const store = await setupAndMountPosApp();

    await Utils.longPress('[data-product-id="5"]');
    await animationFrame();
    await waitFor(".modal");

    const snoozeBtn = document.querySelector(".modal .section-inventory .btn");
    expect(snoozeBtn.classList.contains("btn-secondary")).toBe(true);

    await contains(".modal .section-inventory .btn").click();
    await animationFrame();

    await contains('.modal label:contains("1 Hour")').click();
    await animationFrame();

    await contains('.modal .btn-primary:contains("Apply")').click();
    await animationFrame();

    await waitFor(".modal .section-inventory .btn-warning");

    await contains('.modal .btn-primary:contains("Close")').click();
    await animationFrame();

    await Utils.clickDisplayedProduct("TEST");
    await animationFrame();
    expect(document.querySelector(".modal-body").textContent).toInclude("snoozed");

    await contains('.modal .btn-primary:contains("Continue")').click();
    await animationFrame();

    const order = store.getOrder();
    expect(order.lines).toHaveLength(1);

    await Utils.clickDisplayedProduct("TEST");
    expect(order.lines[0].qty).toBe(2);

    await Utils.longPress('[data-product-id="5"]');
    await animationFrame();
    await waitFor(".modal");

    await contains(".modal .section-inventory .btn-warning").click();
    await animationFrame();

    await contains('.modal .btn-primary:contains("Yes")').click();
    await animationFrame();

    await waitFor(".modal .section-inventory .btn-secondary");
    await contains('.modal .btn-primary:contains("Close")').click();
    await animationFrame();
    await Utils.clickDisplayedProduct("TEST");
    expect(order.lines[0].qty).toBe(3);
});

test("test_orderline_merge_with_higher_price_precision: merging with high precision price", async () => {
    const store = await setupAndMountPosApp({ use_pricelist: false });

    store.models["decimal.precision"].get(3).digits = 3;

    const category = store.models["pos.category"].get(1);
    const productTmpl = store.models["product.template"].create({
        id: 9700,
        name: "High Precision Product",
        display_name: "High Precision Product",
        available_in_pos: true,
        active: true,
        type: "consu",
        uom_id: store.models["uom.uom"].get(1),
        taxes_id: [],
        list_price: 8.245,
        pos_categ_ids: [category],
        attribute_line_ids: [],
        combo_ids: [],
        product_variant_ids: [],
        pos_sequence: 5,
        sequence: 1,
    });
    const variant = store.models["product.product"].create({
        id: 9700,
        product_tmpl_id: productTmpl,
        lst_price: 8.245,
        display_name: "High Precision Product",
        barcode: false,
        default_code: false,
        product_template_attribute_value_ids: [],
        product_template_variant_value_ids: [],
        product_tag_ids: [],
        pos_categ_ids: [category.id],
    });
    productTmpl.product_variant_ids = [variant];

    const order = store.getOrder();
    order.setPricelist(false);
    await animationFrame();

    await Utils.clickDisplayedProduct("High Precision Product");
    expect(order.lines).toHaveLength(1);
    expect(order.lines[0].qty).toBe(1);

    await Utils.clickDisplayedProduct("High Precision Product");
    expect(order.lines).toHaveLength(1);
    expect(order.lines[0].qty).toBe(2);
});
