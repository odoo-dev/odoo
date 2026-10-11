import { test, expect, animationFrame } from "@odoo/hoot";
import { mountWithCleanup, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { setupPosEnv, getFilledOrder, expectFormattedPrice, createPaymentLine } from "../utils";
import { definePosModels } from "../data/generate_model_definitions";
import { queryOne } from "@odoo/hoot-dom";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { localization } from "@web/core/l10n/localization";

definePosModels();

test("Change always incl", async () => {
    const store = await setupPosEnv();
    const order = await getFilledOrder(store);
    const firstPm = store.models["pos.payment.method"].getFirst();
    order.config.iface_tax_included = "total";
    const comp = await mountWithCleanup(PaymentScreen, {
        props: { orderUuid: order.uuid },
    });
    await comp.addNewPaymentLine(firstPm);
    order.payment_ids[0].setAmount(1000);
    await animationFrame();
    const total = queryOne(".amount");
    expectFormattedPrice(total.attributes.amount.value, "$ -405.00");
    order.config.iface_tax_included = "subtotal";
    await animationFrame();
    const subtotal = queryOne(".amount");
    expectFormattedPrice(subtotal.attributes.amount.value, "$ -405.00");
});

test("addTip startingValue uses locale decimal separator on overpayment", async () => {
    const store = await setupPosEnv();
    store.config.iface_tipproduct = true;
    patchWithCleanup(localization, { decimalPoint: ",", thousandsSep: "." });

    const order = await getFilledOrder(store);
    const cashPm = store.models["pos.payment.method"].get(1);
    const { data: paymentLine } = order.addPaymentline(cashPm);
    paymentLine.setAmount(1000);
    expect(Math.abs(order.change)).toBe(405);

    let capturedStartingValue;
    const screen = {
        pos: store,
        currentOrder: order,
        env: { services: { localization } },
        dialog: {
            add: (_, props) => {
                capturedStartingValue = props.startingValue;
            },
        },
    };
    await PaymentScreen.prototype.addTip.call(screen);

    const tipAmount = PaymentScreen.prototype.computeNewTip.call(screen, {
        value: capturedStartingValue,
        type: "fixed",
    });
    expect(tipAmount).toBe(405);
});

test.tags("mobile");
test("payment lines are displayed in their payment method on mobile", async () => {
    const store = await setupPosEnv();
    const order = await getFilledOrder(store);
    const card = store.models["pos.payment.method"].get(2);
    createPaymentLine(store, order, card, { amount: 3 });
    createPaymentLine(store, order, card, { amount: 2 });
    await mountWithCleanup(PaymentScreen, {
        props: { orderUuid: order.uuid },
    });

    expect(".paymentmethod-item-paid").toHaveCount(1);
    expect(".paymentmethod-item-paid .paymentmethod").toHaveText(/Card/);
    expect(".paymentmethod-item-paid .paymentline").toHaveCount(2);
    expect(".paymentmethod-item-paid .delete-button").toHaveCount(2);
    expect(".payment-screen > .paymentlines").toHaveCount(0);
});

test.tags("desktop");
test("payment lines are displayed in the payment summary on desktop", async () => {
    const store = await setupPosEnv();
    const order = await getFilledOrder(store);
    const card = store.models["pos.payment.method"].get(2);
    createPaymentLine(store, order, card, { amount: 3 });
    createPaymentLine(store, order, card, { amount: 2 });
    await mountWithCleanup(PaymentScreen, {
        props: { orderUuid: order.uuid },
    });

    expect(".paymentmethod-item-paid").toHaveCount(0);
    expect(".payment-summary .paymentline").toHaveCount(2);
});

test("deletePaymentLine keeps a payment line that cannot be deleted", async () => {
    const store = await setupPosEnv();
    const order = await getFilledOrder(store);
    const card = store.models["pos.payment.method"].get(2);
    const paymentline = createPaymentLine(store, order, card);
    paymentline.payment_status = "done";
    const comp = await mountWithCleanup(PaymentScreen, {
        props: { orderUuid: order.uuid },
    });

    comp.deletePaymentLine(paymentline.uuid);
    expect(order.payment_ids).toHaveLength(1);
});
