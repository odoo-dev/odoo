import { test, expect } from "@odoo/hoot";
import { getFilledOrder, setupPosEnv, expectFormattedPrice } from "../utils";
import { definePosModels } from "../data/generate_model_definitions";
import { GeneratePrinterData } from "@point_of_sale/app/utils/generate_printer_data";

definePosModels();

test("getOrderlineData", async () => {
    const store = await setupPosEnv();
    const order = await getFilledOrder(store);

    const adapter = new GeneratePrinterData(order);
    const data = adapter.generateData();

    expect(data.lines).toHaveLength(2);
    expect(data.lines[0].isSelected).toBe(false);
    expect(data.lines[1].isSelected).toBe(true);
});

test("order amounts summary", async () => {
    const store = await setupPosEnv();
    const order = await getFilledOrder(store);

    const adapter = new GeneratePrinterData(order);
    const data = adapter.generateData();
    const taxes_data = data.extra_data?.prices;

    // update this before there was condition but now as we show subtotal in receipt so subtotal is always received
    expectFormattedPrice(taxes_data?.total_amount, "$ 17.85");
    expectFormattedPrice(taxes_data?.tax_amount, "$ 2.85");
    expectFormattedPrice(taxes_data?.subtotal_amount, "$ 15.00");
});
