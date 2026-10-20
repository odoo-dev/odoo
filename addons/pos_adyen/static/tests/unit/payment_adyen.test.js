import { beforeEach, expect, test } from "@odoo/hoot";
import { onRpc, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { definePosModels } from "@point_of_sale/../tests/unit/data/generate_model_definitions";
import {
    addPaymentMethodTerminals,
    getFilledOrder,
    setupPosEnv,
} from "@point_of_sale/../tests/unit/utils";
import { PaymentAdyen } from "@pos_adyen/app/utils/payment/payment_adyen";

definePosModels();

let lastError = null;

beforeEach(() => {
    lastError = null;
    patchWithCleanup(PaymentAdyen.prototype, {
        _show_error(msg) {
            lastError = msg;
        },
    });
});

const setupAdyen = async () => {
    const store = await setupPosEnv();
    const order = await getFilledOrder(store);
    const paymentMethod = store.models["pos.payment.method"].create({
        id: 1301,
        name: "Adyen",
        type: "bank",
        payment_provider: "adyen",
        payment_method_type: "terminal",
        adyen_merchant_account: "merchant_account",
    });
    paymentMethod.payment_interface = new PaymentAdyen(store, paymentMethod);
    store.config.payment_method_ids = [...store.config.payment_method_ids, paymentMethod];
    const [terminal1, terminal2] = addPaymentMethodTerminals(store, paymentMethod);
    terminal1.adyen_terminal_identifier = "P400Plus-1";
    terminal2.adyen_terminal_identifier = "P400Plus-2";
    return { adyen: paymentMethod.payment_interface, order, paymentMethod, terminal1, terminal2 };
};

const mockProxyAdyenRequest = (response) => {
    onRpc("pos.payment.method", "proxy_adyen_request", ({ args }) => {
        const message = args[1].SaleToPOIRequest;
        expect.step([
            args[0],
            message.MessageHeader.MessageCategory,
            message.MessageHeader.POIID,
            args[3],
        ]);
        return response;
    });
};

test("payment requests are sent to the terminal of the payment line", async () => {
    const { adyen, order, paymentMethod, terminal2 } = await setupAdyen();
    const line = order.addPaymentline(paymentMethod, { terminal: terminal2 }).data;
    mockProxyAdyenRequest({
        SaleToPOIRequest: {
            EventNotification: { EventToNotify: "Reject", EventDetails: "message=Rejected" },
        },
    });

    await expect(adyen.sendPaymentRequest(line)).resolves.toBe(false);
    expect(lastError).toInclude("Rejected");
    expect.verifySteps([[[paymentMethod.id], "Payment", "P400Plus-2", terminal2.id]]);

    onRpc("pos.payment.method", "proxy_adyen_request", ({ args }) => {
        expect.step([args[1].SaleToPOIRequest.MessageHeader.POIID, args[3]]);
        return true;
    });
    await expect(adyen.sendPaymentCancel(line)).resolves.toBe(true);
    expect.verifySteps([["P400Plus-2", terminal2.id]]);
});

test("payment requests without terminal use the first terminal", async () => {
    // e.g. in the Self Order Kiosk, the payment line has no terminal
    const { adyen, order, paymentMethod } = await setupAdyen();
    const line = order.addPaymentline(paymentMethod).data;
    expect(line.terminal_id).toBe(undefined);
    mockProxyAdyenRequest(true);

    await expect(adyen.sendPaymentCancel(line)).resolves.toBe(true);
    expect.verifySteps([[[paymentMethod.id], "Abort", "P400Plus-1", null]]);
});

test("latest status is fetched from the terminal of the payment line", async () => {
    const { adyen, order, paymentMethod, terminal2 } = await setupAdyen();
    const line = order.addPaymentline(paymentMethod, { terminal: terminal2 }).data;
    line.setPaymentStatus("waitingCard");
    onRpc("pos.payment.method", "get_latest_adyen_status", ({ args }) => {
        expect.step(args);
        return {
            SaleToPOIResponse: {
                MessageHeader: { ServiceID: "other" },
                PaymentResponse: {
                    Response: { Result: "Failure", AdditionalResponse: "message=Declined" },
                },
            },
        };
    });

    await adyen.handleAdyenStatusResponse();
    expect.verifySteps([[[paymentMethod.id], terminal2.id]]);
    expect(lastError).toInclude("Declined");
});
