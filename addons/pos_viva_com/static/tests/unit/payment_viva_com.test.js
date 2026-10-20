import { test, expect, beforeEach } from "@odoo/hoot";
import { onRpc, patchWithCleanup } from "@web/../tests/web_test_helpers";
import {
    setupPosEnv,
    getFilledOrder,
    addPaymentMethodTerminals,
} from "@point_of_sale/../tests/unit/utils";
import { definePosModels } from "@point_of_sale/../tests/unit/data/generate_model_definitions";
import { PaymentVivaCom } from "@pos_viva_com/app/payment_viva_com";

definePosModels();

let lastError = null;

beforeEach(() => {
    lastError = null;
    patchWithCleanup(PaymentVivaCom.prototype, {
        _show_error(msg) {
            lastError = msg;
        },
    });
});

const setupVivaCom = async () => {
    const store = await setupPosEnv();
    const order = await getFilledOrder(store);
    const paymentMethod = store.models["pos.payment.method"].find(
        (pm) => pm.payment_provider === "viva_com"
    );
    return { store, order, paymentMethod, vivaCom: paymentMethod.payment_interface };
};

test("payment requests are sent to the terminal of the payment line", async () => {
    const { store, order, paymentMethod, vivaCom } = await setupVivaCom();
    const [, terminal] = addPaymentMethodTerminals(store, paymentMethod);
    const paymentLine = order.addPaymentline(paymentMethod, { terminal }).data;

    onRpc("pos.payment.method", "viva_com_send_payment_request", ({ args }) => {
        expect.step([args[0], args[1].terminalId, args[2]]);
        return { error: "Viva.com test error" };
    });
    await expect(vivaCom.sendPaymentRequest(paymentLine)).resolves.toBe(false);
    // The Viva.com terminal id is set by the server from the terminal of the line
    expect.verifySteps([[[paymentMethod.id], undefined, terminal.id]]);
    expect(lastError).toBe("Viva.com test error");
});

test("payment requests without terminal use the first terminal of the method", async () => {
    // e.g. the Self Order Kiosk, the server uses the first terminal of the payment method
    const { order, paymentMethod, vivaCom } = await setupVivaCom();
    const paymentLine = order.addPaymentline(paymentMethod).data;

    onRpc("pos.payment.method", "viva_com_send_payment_request", ({ args }) => {
        expect.step(args[2]);
        return { error: "Viva.com test error" };
    });
    await vivaCom.sendPaymentRequest(paymentLine);
    expect.verifySteps([null]);
});
