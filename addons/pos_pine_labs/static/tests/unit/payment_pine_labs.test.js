import { expect, test } from "@odoo/hoot";
import { onRpc } from "@web/../tests/web_test_helpers";
import {
    addPaymentMethodTerminals,
    getFilledOrder,
    setupPosEnv,
} from "@point_of_sale/../tests/unit/utils";
import { definePosModels } from "@point_of_sale/../tests/unit/data/generate_model_definitions";
import { PaymentPineLabs } from "@pos_pine_labs/app/utils/payment/payment_pine_labs";

definePosModels();

test("requests are sent to the terminal of the payment line", async () => {
    const store = await setupPosEnv();
    const order = await getFilledOrder(store);
    const paymentMethod = store.models["pos.payment.method"].create({
        id: 1181,
        name: "Pine Labs",
        payment_provider: "pine_labs",
        payment_method_type: "terminal",
        type: "bank",
    });
    paymentMethod.payment_interface = new PaymentPineLabs(store, paymentMethod);
    store.config.payment_method_ids = [...store.config.payment_method_ids, paymentMethod];
    const [, terminal2] = addPaymentMethodTerminals(store, paymentMethod);
    store.paymentMethods.setDefault("pine_labs", `${paymentMethod.id}-${terminal2.id}`);

    const paymentLine = order.addPaymentline(paymentMethod, {
        terminal: store.paymentMethods.getTerminal(paymentMethod),
    }).data;
    expect(paymentLine.terminal_id).toBe(terminal2);

    onRpc("pos.payment.method", "pine_labs_make_payment_request", ({ args }) => {
        expect.step(["pay", args[0], args[2]]);
        return { error: "Stop here" };
    });
    onRpc("pos.payment.method", "pine_labs_cancel_payment_request", ({ args }) => {
        expect.step(["cancel", args[0], args[2]]);
        return { error: "Stop here" };
    });
    await paymentMethod.payment_interface._processPineLabs();
    paymentLine.setPaymentStatus("waitingCard");
    await paymentMethod.payment_interface._pineLabsCancel();
    expect.verifySteps([
        ["pay", [paymentMethod.id], terminal2.id],
        ["cancel", [paymentMethod.id], terminal2.id],
    ]);
});
