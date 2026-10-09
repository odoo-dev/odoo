import { expect, mockUserAgent, test } from "@odoo/hoot";
import { Component, xml } from "@odoo/owl";
import { mountWithCleanup, onRpc, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { createPaymentLine, getFilledOrder, setupPosEnv } from "@point_of_sale/../tests/unit/utils";
import { definePosModels } from "@point_of_sale/../tests/unit/data/generate_model_definitions";
import { useVivaApp } from "@pos_viva_com/app/hooks/use_viva_app";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";

definePosModels();

let validated;

class Host extends Component {
    static template = xml`<div/>`;
    setup() {
        this.vivaApp = useVivaApp(() => validated.push(true));
    }
}

async function setupAppPayment() {
    mockUserAgent("android");
    const store = await setupPosEnv();
    const viva = store.models["pos.payment.method"].get(2);
    viva.payment_provider = "viva_com";
    const order = await getFilledOrder(store);
    store.setOrder(order);
    const line = createPaymentLine(store, order, viva, { payment_status: "waitingCard" });
    line.viva_com_session_id = "s1";
    validated = [];
    const dialogs = [];
    const comp = await mountWithCleanup(Host);
    patchWithCleanup(comp.env.services.dialog, { add: (_component, props) => dialogs.push(props) });
    return {
        store,
        line,
        settle: comp.vivaApp.settle,
        retry: comp.vivaApp.retry,
        validated,
        dialogs,
    };
}

test("a declined app payment keeps the line for a retry, without a dialog", async () => {
    const { line, settle, validated, dialogs } = await setupAppPayment();

    await settle({ status: "failed", message: "Declined" });

    expect(line.getPaymentStatus()).toBe("retry");
    expect(validated).toHaveLength(0);
    expect(dialogs).toHaveLength(0);
});

test("a successful app payment is validated once the server confirms it", async () => {
    const confirmations = [];
    const { line, settle, validated } = await setupAppPayment();
    onRpc("viva_com_confirm_app_payment", ({ args }) => {
        confirmations.push([args, line.getPaymentStatus()]);
        return { success: true, transactionId: "t1", cardType: "VISA" };
    });

    await settle({ status: "success", transactionId: "t1" });

    expect(confirmations).toEqual([[[[line.payment_method_id.id], "s1", "t1"], "waiting"]]);
    expect(line.payment_status).toBe("done");
    expect(line.transaction_id).toBe("t1");
    expect(line.card_type).toBe("VISA");
    expect(validated).toEqual([true]);
});

test("a success the server cannot confirm is left to be forced", async () => {
    onRpc("viva_com_confirm_app_payment", () => ({
        error: "Viva.com did not confirm the payment t1",
    }));
    const { line, settle, validated, dialogs } = await setupAppPayment();

    await settle({ status: "success", transactionId: "t1" });

    expect(line.getPaymentStatus()).toBe("force_done");
    expect(validated).toHaveLength(0);
    expect(dialogs.map((d) => d.body)).toEqual([
        "Please note that your order has not been finalized, try again or choose another payment method. (Viva.com did not confirm the payment t1)",
    ]);
});

test("an app supporting app links gets the payment result back through its link", async () => {
    const { store, line, retry } = await setupAppPayment();
    patchWithCleanup(store, {
        paymentAppCallback: (provider) => `odoo-mobile://payment/${provider}`,
    });
    const opened = [];
    patchWithCleanup(window, { open: (url) => opened.push(url) });

    await retry(line);

    expect(opened).toHaveLength(1);
    expect(opened[0]).toInclude(
        "&show_receipt=false&show_transaction_result=true&show_rating=false&callback=odoo-mobile://payment/viva_com&"
    );
});

test("the payment screen settles the payment of the Viva.com link it receives", async () => {
    mockUserAgent("android");
    const store = await setupPosEnv();
    const order = await getFilledOrder(store);
    const screen = await mountWithCleanup(PaymentScreen, { props: { orderUuid: order.uuid } });
    const settled = [];
    patchWithCleanup(screen.vivaApp, { settle: (params) => settled.push(params) });

    const link = (path, params) =>
        document.dispatchEvent(new CustomEvent("odoo_mobile_link", { detail: { path, params } }));
    link("payment/viva_com", { status: "success" });
    link("payment/other", { status: "success" });

    expect(settled).toEqual([{ status: "success" }]);
});
