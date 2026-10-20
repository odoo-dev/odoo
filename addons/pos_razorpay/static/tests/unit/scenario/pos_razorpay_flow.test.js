import { expect, test } from "@odoo/hoot";
import { animationFrame, waitFor } from "@odoo/hoot-dom";
import { contains, MockServer, onRpc } from "@web/../tests/web_test_helpers";
import { setupAndMountPosApp } from "@point_of_sale/../tests/unit/utils";
import { definePosModels } from "@point_of_sale/../tests/unit/data/generate_model_definitions";
import * as PosUiUtils from "@point_of_sale/../tests/unit/ui_utils";
import * as RazorpayUiUtils from "@pos_razorpay/../tests/unit/ui_utils";

const Utils = { ...PosUiUtils, ...RazorpayUiUtils };

definePosModels();

const RAZORPAY_CONFIG = { use_pricelist: false, payment_method_ids: [1, 2, 7] };

test("PosRazorpayTour: an authorized terminal payment validates the order", async () => {
    const store = await setupAndMountPosApp(RAZORPAY_CONFIG);
    const order = store.getOrder();

    await Utils.clickDisplayedProduct("TEST");
    await Utils.clickPayButton();
    await waitFor(".payment-screen");

    await Utils.clickPaymentMethod("Razorpay");
    await Utils.clickPaymentAction("send");

    await waitFor(".feedback-screen");

    const payment = order.payment_ids[0];
    expect(payment.payment_status).toBe("done");
    expect(payment.card_no).toBe("1234");
    expect(payment.card_brand).toBe("VISA");
    expect(payment.transaction_id).toBe("250102070624795E020088174");
    expect(payment.razorpay_p2p_request_id).toBe("250102070607078E010040377");
    expect(payment.payment_ref_no).toMatch(/^Hoot\//);
    expect(order.finalized).toBe(true);
});

test("PosRazorpayCancelTour: a cancelled payment can be retried", async () => {
    let waitingOnDevice = true;
    onRpc("pos.payment.method", "razorpay_fetch_payment_status", () => {
        if (waitingOnDevice) {
            waitingOnDevice = false;
            return { status: "RECEIVED" };
        }
    });

    const store = await setupAndMountPosApp(RAZORPAY_CONFIG);
    const order = store.getOrder();

    await Utils.clickDisplayedProduct("TEST");
    await Utils.clickPayButton();
    await waitFor(".payment-screen");

    await Utils.clickPaymentMethod("Razorpay");
    await Utils.clickPaymentAction("send");

    await waitFor(".paymentline_status_title_waiting_card");
    await Utils.clickPaymentAction("cancel");

    await waitFor(".modal");
    expect(document.querySelector(".modal .modal-title").textContent).toInclude("Razorpay Error");
    expect(document.querySelector(".modal .modal-body").textContent).toInclude(
        "Razorpay POS transaction canceled successfully"
    );
    await contains(".modal .modal-footer .btn-primary").click();
    await animationFrame();

    expect(".payment-screen").toHaveCount(1);
    expect(order.payment_ids[0].payment_status).toBe("retry");

    await Utils.clickPaymentAction("retry");
    await waitFor(".feedback-screen");

    expect(order.payment_ids[0].payment_status).toBe("done");
    expect(order.finalized).toBe(true);
});

test("PosRazorpayRefundTour: a paid order is refunded through the terminal", async () => {
    const store = await setupAndMountPosApp(RAZORPAY_CONFIG);

    await Utils.clickDisplayedProduct("TEST");
    await Utils.clickPayButton();
    await waitFor(".payment-screen");
    await Utils.clickPaymentMethod("Razorpay");
    await Utils.clickPaymentAction("send");
    await waitFor(".feedback-screen");

    await Utils.clickNextOrder();
    await waitFor(".product-screen");

    // The terminal references must reach the backend...
    const paidOrderId = store.models["pos.order"].find((o) => o.finalized).id;
    const [serverPayment] = MockServer.env["pos.payment"].search_read([
        ["pos_order_id", "=", paidOrderId],
    ]);
    expect(serverPayment.razorpay_p2p_request_id).toBe("250102070607078E010040377");
    expect(serverPayment.razorpay_reverse_ref_no).toBe("RR6A55BBEA34E2");

    // ...and be reloaded from it, as the refund needs them
    store.data.localDeleteCascade(store.models["pos.order"].get(paidOrderId));
    const [paidOrder] = await store.data.loadServerOrders([["id", "=", paidOrderId]]);
    expect(paidOrder.payment_ids[0].razorpay_p2p_request_id).toBe("250102070607078E010040377");
    expect(paidOrder.payment_ids[0].razorpay_reverse_ref_no).toBe("RR6A55BBEA34E2");

    await Utils.clickOrders();
    await waitFor(".ticket-screen");
    await Utils.selectTicketFilter("Paid");
    await animationFrame();
    await contains('.ticket-screen .order-row:contains("001")').click();
    await animationFrame();

    await Utils.sendBufferKeys("1");
    await animationFrame();

    if (Utils.isMobile()) {
        await Utils.clickTicketReviewButton();
        await Utils.clickTicketAction("Refund");
    } else {
        await contains('.ticket-screen .pads button:contains("Refund")').click();
        await animationFrame();
    }

    await waitFor(".payment-screen");

    const refundOrder = store.getOrder();
    await Utils.clickPaymentMethod("Razorpay");
    const refundPayment = Utils.razorpayPaymentLine(store);
    expect(refundPayment.amount).toBe(-paidOrder.payment_ids[0].amount);
    expect(refundPayment.uiState.transaction_id).toBe(paidOrder.payment_ids[0].transaction_id);
    expect(refundPayment.uiState.razorpay_p2p_request_id).toBe("250102070607078E010040377");

    await Utils.clickPaymentAction("refund");
    await waitFor(".feedback-screen");

    expect(refundPayment.payment_status).toBe("done");
    expect(refundPayment.card_no).toBe("1234");
    expect(refundOrder.finalized).toBe(true);
});

test("PosRazorpayTerminalTour: requests use the terminal of the device, refunds the one of the payment", async () => {
    for (const method of [
        "razorpay_make_payment_request",
        "razorpay_fetch_payment_status",
        "razorpay_make_refund_request",
    ]) {
        onRpc("pos.payment.method", method, ({ args }) => {
            expect.step([method, args[2]]);
        });
    }
    const store = await setupAndMountPosApp(RAZORPAY_CONFIG);
    const paymentMethod = store.models["pos.payment.method"].get(7);
    // The terminals must exist on the server for the orders to be synchronized
    const [terminal2, terminal3] = [2, 3].map((sequence) => {
        const id = MockServer.env["pos.payment.terminal"].create({
            payment_method_id: paymentMethod.id,
            sequence,
        });
        return store.models["pos.payment.terminal"].create({
            id,
            payment_method_id: paymentMethod,
            sequence,
        });
    });
    store.paymentMethods.initDefaults();
    store.paymentMethods.setDefault("razorpay", `${paymentMethod.id}-${terminal2.id}`);

    await Utils.clickDisplayedProduct("TEST");
    await Utils.clickPayButton();
    await waitFor(".payment-screen");
    await Utils.clickPaymentMethod("Razorpay");
    const payment = Utils.razorpayPaymentLine(store);
    expect(payment.terminal_id).toBe(terminal2);
    await Utils.clickPaymentAction("send");
    await waitFor(".feedback-screen");
    expect.verifySteps([
        ["razorpay_make_payment_request", terminal2.id],
        ["razorpay_fetch_payment_status", terminal2.id],
    ]);

    // The device now uses another terminal, the refund is still made with the one of the payment
    store.paymentMethods.setDefault("razorpay", `${paymentMethod.id}-${terminal3.id}`);
    await Utils.clickNextOrder();
    await waitFor(".product-screen");
    await Utils.clickOrders();
    await waitFor(".ticket-screen");
    await Utils.selectTicketFilter("Paid");
    await animationFrame();
    await contains('.ticket-screen .order-row:contains("001")').click();
    await animationFrame();
    await Utils.sendBufferKeys("1");
    await animationFrame();
    if (Utils.isMobile()) {
        await Utils.clickTicketReviewButton();
        await Utils.clickTicketAction("Refund");
    } else {
        await contains('.ticket-screen .pads button:contains("Refund")').click();
        await animationFrame();
    }
    await waitFor(".payment-screen");

    await Utils.clickPaymentMethod("Razorpay");
    const refundPayment = Utils.razorpayPaymentLine(store);
    expect(refundPayment.terminal_id).toBe(terminal3);
    await Utils.clickPaymentAction("refund");
    await waitFor(".feedback-screen");
    expect(refundPayment.payment_status).toBe("done");
    expect.verifySteps([
        ["razorpay_fetch_payment_status", terminal2.id],
        ["razorpay_make_refund_request", terminal2.id],
    ]);
});
