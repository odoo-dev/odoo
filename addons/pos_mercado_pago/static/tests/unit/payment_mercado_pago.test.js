import { test, expect, beforeEach } from "@odoo/hoot";
import { onRpc, patchWithCleanup } from "@web/../tests/web_test_helpers";
import {
    setupPosEnv,
    getFilledOrder,
    addPaymentMethodTerminals,
} from "@point_of_sale/../tests/unit/utils";
import { definePosModels } from "@point_of_sale/../tests/unit/data/generate_model_definitions";
import { PaymentMercadoPago } from "@pos_mercado_pago/app/utils/payment/payment_mercado_pago";

definePosModels();

let lastError = null;

beforeEach(() => {
    lastError = null;
    patchWithCleanup(PaymentMercadoPago.prototype, {
        _showMsg(msg) {
            lastError = msg;
        },
    });
});

const setupMercadoPago = async () => {
    const store = await setupPosEnv();
    const order = await getFilledOrder(store);
    const paymentMethod = store.models["pos.payment.method"].find(
        (pm) => pm.payment_provider === "mercado_pago"
    );
    onRpc("pos.payment.method", "mp_order_create", ({ args }) => {
        expect.step([args[0], args[2]]);
        return { errors: [{ message: "Mercado Pago test error" }] };
    });
    return { store, order, paymentMethod, mercadoPago: paymentMethod.payment_interface };
};

test("orders are created on the terminal of the payment line", async () => {
    const { store, order, paymentMethod, mercadoPago } = await setupMercadoPago();
    const [, terminal] = addPaymentMethodTerminals(store, paymentMethod);
    const paymentLine = order.addPaymentline(paymentMethod, { terminal }).data;

    await expect(mercadoPago.sendPaymentRequest(paymentLine)).resolves.toBe(false);
    expect.verifySteps([[[paymentMethod.id], terminal.id]]);
    expect(lastError).toBe("Mercado Pago test error");
});

test("orders without terminal are created on the first terminal of the method", async () => {
    // e.g. the Self Order Kiosk, the server uses the first terminal of the payment method
    const { order, paymentMethod, mercadoPago } = await setupMercadoPago();
    const paymentLine = order.addPaymentline(paymentMethod).data;

    await mercadoPago.sendPaymentRequest(paymentLine);
    expect.verifySteps([[[paymentMethod.id], null]]);
});
