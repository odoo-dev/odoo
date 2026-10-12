import { beforeEach, expect, test } from "@odoo/hoot";
import { onRpc, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { getFilledOrder, setupPosEnv } from "@point_of_sale/../tests/unit/utils";
import { definePosModels } from "@point_of_sale/../tests/unit/data/generate_model_definitions";
import { PaymentStripe } from "@pos_stripe/app/payment_stripe";

definePosModels();

let intentAmount;
let tip;
let skipTipping;

beforeEach(() => {
    const cardDetails = { type: "card_present", card_present: { brand: "visa", network: "visa" } };
    const charges = { data: [{ id: "ch_1", payment_method_details: cardDetails }] };
    tip = null;
    patchWithCleanup(PaymentStripe.prototype, {
        async createStripeTerminal() {
            this.terminal = {
                getConnectionStatus: () => "connected",
                collectPaymentMethod: async (secret, { config_override }) => {
                    skipTipping = config_override.skip_tipping;
                    return { paymentIntent: { id: "pi_1" } };
                },
                processPayment: async () => ({
                    paymentIntent: {
                        id: "pi_1",
                        amount: intentAmount + tip,
                        amount_details: { tip: { amount: tip } },
                        charges,
                    },
                }),
            };
            return true;
        },
    });
    onRpc("pos.payment.method", "stripe_payment_intent", ({ args }) => {
        intentAmount = Math.round(args[1] * 100);
        return { client_secret: "secret" };
    });
    onRpc("pos.payment.method", "stripe_capture_payment", ({ args }) => ({ id: args[0], charges }));
});

test("adds the tips entered on the terminal to the order", async () => {
    const store = await setupPosEnv();
    store.config.iface_tipproduct = true;
    store.connectedReader = "SIMULATOR";
    const order = await getFilledOrder(store);
    await store.setTip(1);
    const method = store.models["pos.payment.method"].find(
        (pm) => pm.payment_provider === "stripe"
    );
    const pay = async (terminalTip, amount) => {
        const line = order.addPaymentline(method).data;
        if (amount) {
            line.setAmount(amount);
        }
        const due = line.amount;
        tip = terminalTip;
        await method.payment_interface.sendPaymentRequest(line);
        return [due, line.amount];
    };
    expect(await pay(200, 10)).toEqual([10, 12]);
    expect(await pay(null, 5)).toEqual([5, 5]);
    const [due, amount] = await pay(350);
    expect(amount).toBe(due + 3.5);
    expect(skipTipping).toBe(false);
    const tipLines = order.lines.filter(
        (line) => line.product_id.id === store.config.tip_product_id.id
    );
    expect(tipLines.map((line) => line.price_unit)).toEqual([6.5]);
    expect(order.remainingDue).toBe(0);
});

test("skips tipping on the terminal when the order cannot take it", async () => {
    const store = await setupPosEnv();
    store.connectedReader = "SIMULATOR";
    const order = await getFilledOrder(store);
    const method = store.models["pos.payment.method"].find(
        (pm) => pm.payment_provider === "stripe"
    );
    const line = order.addPaymentline(method).data;
    const skipped = [];
    for (const config of [
        { iface_tipproduct: false },
        { iface_tipproduct: true, set_tip_after_payment: true },
        { set_tip_after_payment: false, self_ordering_mode: "kiosk" },
    ]) {
        Object.assign(store.config, config);
        await method.payment_interface.collectPayment(line.amount);
        skipped.push(skipTipping);
    }
    expect(skipped).toEqual([true, true, true]);
});
