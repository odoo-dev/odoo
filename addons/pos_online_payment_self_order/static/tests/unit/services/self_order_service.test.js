import { test, expect } from "@odoo/hoot";
import { onRpc } from "@web/../tests/web_test_helpers";
import {
    setupSelfPosEnv,
    getFilledSelfOrder,
    mockNavigate,
} from "@pos_self_order/../tests/unit/utils";
import { definePosSelfModels } from "@pos_self_order/../tests/unit/data/generate_model_definitions";

definePosSelfModels();

test("sendDraftOrderToServer updateLastOrderChange", async () => {
    const store = await setupSelfPosEnv();
    const order = await getFilledSelfOrder(store);

    store.config.self_ordering_mode = "mobile";
    const product4 = store.models["product.template"].get(11);
    await store.addToCart(product4, 1, "");
    await store.sendDraftOrderToServer();
    expect(Object.keys(order.prep_order_ids)).toHaveLength(0);

    store.config.self_ordering_pay_after = "meal";
    const product3 = store.models["product.template"].get(10);
    await store.addToCart(product3, 1, "");
    await store.sendDraftOrderToServer();
    expect(Object.keys(order.prep_order_ids[0].prep_line_ids)).toHaveLength(4);
});

test("kiosk online payment keeps the preparation changes for the confirmation page", async () => {
    const store = await setupSelfPosEnv("kiosk");
    const order = await getFilledSelfOrder(store);
    mockNavigate(store.router);

    onRpc(`/pos-self-order/get-order/${order.id}`, () => ({
        "pos.order": [{ id: order.id, access_token: order.access_token, state: "paid" }],
        "pos.prep.order": [{ id: 1, pos_order_id: order.id }],
        "pos.prep.line": order.lines.map((line, index) => ({
            id: index + 1,
            prep_order_id: 1,
            pos_order_line_id: line.id,
            product_id: line.product_id.id,
            quantity: line.qty,
            cancelled: 0,
        })),
    }));

    expect(order.getChanges().addedQuantity).toHaveLength(2);

    await store.updateOnlinePaymentStatus("success");
    expect(order.getChanges().addedQuantity).toHaveLength(0);
    expect(order.uiState.pendingPrepChange.addedQuantity).toHaveLength(2);

    const generator = store.ticketPrinter.getGenerator({ models: store.models, order });
    const receipts = generator.generatePreparationData(store.config.preparationCategories, {
        orderChange: order.uiState.pendingPrepChange,
    });
    expect(receipts[0].changes.data).toHaveLength(2);
});
