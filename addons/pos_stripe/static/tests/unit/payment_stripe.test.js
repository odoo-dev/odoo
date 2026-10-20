import { beforeEach, expect, test } from "@odoo/hoot";
import { patchWithCleanup } from "@web/../tests/web_test_helpers";
import { definePosModels } from "@point_of_sale/../tests/unit/data/generate_model_definitions";
import {
    addPaymentMethodTerminals,
    getFilledOrder,
    setupPosEnv,
} from "@point_of_sale/../tests/unit/utils";
import { PaymentStripe } from "@pos_stripe/app/payment_stripe";

definePosModels();

class MockStripeTerminal {
    status = "not_connected";

    getConnectionStatus() {
        return this.status;
    }

    async discoverReaders() {
        return {
            discoveredReaders: [{ serial_number: "WSC-1" }, { serial_number: "WSC-2" }],
        };
    }

    async connectReader(reader) {
        expect.step(`connect ${reader.serial_number}`);
        this.status = "connected";
        return { reader };
    }

    async disconnectReader() {
        expect.step("disconnect");
        this.status = "not_connected";
        return {};
    }
}

let lastError = null;

beforeEach(() => {
    lastError = null;
    patchWithCleanup(PaymentStripe.prototype, {
        async createStripeTerminal() {
            this.terminal = new MockStripeTerminal();
            return true;
        },
        _showError(msg) {
            lastError = msg;
        },
    });
});

const setupStripe = async () => {
    const store = await setupPosEnv();
    const order = await getFilledOrder(store);
    const paymentMethod = store.models["pos.payment.method"].create({
        id: 1401,
        name: "Stripe",
        type: "bank",
        payment_provider: "stripe",
        payment_method_type: "terminal",
    });
    paymentMethod.payment_interface = new PaymentStripe(store, paymentMethod);
    store.config.payment_method_ids = [...store.config.payment_method_ids, paymentMethod];
    const [terminal1, terminal2] = addPaymentMethodTerminals(store, paymentMethod);
    terminal1.stripe_serial_number = "WSC-1";
    terminal2.stripe_serial_number = "WSC-2";
    return { stripe: paymentMethod.payment_interface, order, paymentMethod, terminal1, terminal2 };
};

test("connects to the reader of the terminal of the payment line", async () => {
    const { stripe, order, paymentMethod, terminal1, terminal2 } = await setupStripe();

    const line = order.addPaymentline(paymentMethod, { terminal: terminal2 }).data;
    await expect(stripe.checkReader(line)).resolves.toBe(true);
    expect.verifySteps(["connect WSC-2"]);

    // Already connected to the reader of the terminal
    await expect(stripe.checkReader(line)).resolves.toBe(true);
    expect.verifySteps([]);

    // The device switched to another terminal: reconnect to its reader
    line.terminal_id = terminal1;
    await expect(stripe.checkReader(line)).resolves.toBe(true);
    expect.verifySteps(["disconnect", "connect WSC-1"]);
    expect(lastError).toBe(null);
});

test("connects to the reader of the first terminal without terminal", async () => {
    // e.g. in the Self Order Kiosk, the payment line has no terminal
    const { stripe, order, paymentMethod } = await setupStripe();
    const line = order.addPaymentline(paymentMethod).data;
    await expect(stripe.checkReader(line)).resolves.toBe(true);
    expect.verifySteps(["connect WSC-1"]);
});

test("shows an error when the reader of the terminal is not found", async () => {
    const { stripe, order, paymentMethod, terminal2 } = await setupStripe();
    terminal2.stripe_serial_number = "WSC-3";
    const line = order.addPaymentline(paymentMethod, { terminal: terminal2 }).data;
    await stripe.checkReader(line);
    expect.verifySteps([]);
    expect(lastError).toInclude("WSC-3");
});
