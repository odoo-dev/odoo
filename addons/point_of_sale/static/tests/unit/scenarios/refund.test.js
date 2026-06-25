import { test, expect } from "@odoo/hoot";
import { waitFor } from "@odoo/hoot-dom";
import { contains } from "@web/../tests/web_test_helpers";
import { setupPosEnv, createAttribute, createAttributeValue, createAttributeLine } from "../utils";
import { definePosModels } from "../data/generate_model_definitions";
import * as Utils from "../ui_utils";

definePosModels();

test("test_refund_line_keep_attributes: refund line keeps variant attributes", async () => {
    const store = await setupPosEnv();

    // Make product 5 ("TEST") configurable with a single radio attribute "Sugar"
    const attribute = createAttribute(store, "Donut", "radio");
    const sugar = createAttributeValue(store, attribute, "Sugar");
    const template = store.models["product.template"].get(5);
    template.update({
        attribute_line_ids: [createAttributeLine(store, attribute, [sugar])],
    });

    await Utils.mountPosApp(store);
    await contains(".screen-login .btn.open-register-btn").click();

    // Add the configurable product, pick the attribute and confirm the popup
    await Utils.clickDisplayedProduct("TEST");
    await waitFor(".modal .attribute-name-cell");
    await contains(`.modal .attribute-name-cell label:contains("Sugar")`).click();
    await contains(".modal .btn-primary:contains('Add')").click();

    // Pay the order
    await Utils.clickPayButton();
    await Utils.clickPaymentMethod("Card");
    await Utils.clickValidatePayment();
    await waitFor(".feedback-screen");
    await Utils.clickNextOrder();

    // Refund one unit of the paid order
    await Utils.clickRefundButton();
    await waitFor(".ticket-screen");
    await Utils.selectTicketOrder("001");
    await Utils.clickNumpad("1");
    await contains(".ticket-screen .pads button:contains('Refund')").click();
    await waitFor(".payment-screen");
    await contains(".payment-screen .back-button").click();
    await waitFor(".product-screen");

    const refundOrder = store.getOrder();
    const refundLine = refundOrder.lines.find((l) => l.refunded_orderline_id);
    expect(refundLine.attribute_value_ids).toHaveLength(1);
    expect(refundLine.attribute_value_ids[0].name).toBe("Sugar");
});
