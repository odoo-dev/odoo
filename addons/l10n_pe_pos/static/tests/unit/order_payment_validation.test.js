import { expect, test } from "@odoo/hoot";
import { patchWithCleanup } from "@web/../tests/web_test_helpers";
import OrderPaymentValidation from "@point_of_sale/app/utils/order_payment_validation";
import { getFilledOrder, setupPosEnv } from "@point_of_sale/../tests/unit/utils";
import { definePosModels } from "@point_of_sale/../tests/unit/data/generate_model_definitions";

definePosModels();

test("isOrderValid accepts a partner identified by its DNI only", async () => {
    const store = await setupPosEnv();
    patchWithCleanup(store, { isPeruvianCompany: () => true });
    const order = await getFilledOrder(store);
    const consumidorFinal = store.models["res.partner"].create({
        name: "Consumidor Final",
        vat: false,
        additional_identifiers: { PE_DNI: "00000000" },
    });
    order.setPartner(consumidorFinal);
    order.addPaymentline(store.models["pos.payment.method"].find((pm) => pm.type === "cash"));

    const validation = new OrderPaymentValidation({ pos: store, orderUuid: order.uuid });
    expect(await validation.isOrderValid(false)).toBe(true);
});
