import { expect, test, waitUntil } from "@odoo/hoot";
import { animationFrame } from "@odoo/hoot-dom";
import { advanceTime } from "@odoo/hoot-mock";
import { definePosModels } from "@point_of_sale/../tests/unit/data/generate_model_definitions";
import {
    getFilledOrder,
    setupPosEnv,
    setupAndMountPosApp,
} from "@point_of_sale/../tests/unit/utils";
import { patch } from "@web/core/utils/patch";
import * as PosUiUtils from "@point_of_sale/../tests/unit/ui_utils";
import * as ResUiUtils from "@pos_restaurant/../tests/unit/ui_utils";
const Utils = { ...PosUiUtils, ...ResUiUtils };

definePosModels();

function buildChangeLine({
    uuid,
    product,
    quantity = 1,
    isCombo = false,
    comboParentUuid = undefined,
    name = product.display_name,
}) {
    return {
        uuid,
        product_id: product.id,
        name,
        basic_name: name,
        display_name: name,
        quantity,
        note: "",
        customer_note: "",
        attribute_value_names: [],
        pos_categ_id: product.pos_categ_ids[0]?.id ?? 0,
        pos_categ_sequence: product.pos_categ_ids[0]?.sequence ?? 0,
        pack_lot_lines: [],
        group: undefined,
        isCombo,
        combo_parent_uuid: comboParentUuid,
    };
}

test("preparation data includes table and customer note", async () => {
    const store = await setupPosEnv();
    const order = await getFilledOrder(store);
    const table = store.models["restaurant.table"].get(2);
    const allCategoryIds = new Set(store.models["pos.category"].map((c) => c.id));
    order.table_id = table;
    order.setCustomerCount(5);
    order.lines[0].setCustomerNote("Updated customer note - orderline");

    const generator = store.ticketPrinter.getGenerator({ models: store.models, order });
    const receipts = generator.generatePreparationData(allCategoryIds, {});

    expect(receipts.length).toBe(1);
    expect(receipts[0].extra_data.table_name).toBe(table.table_number);
    expect(receipts[0].extra_data.time).toBeOfType("string");
    expect(receipts[0].changes.title).toBe("NEW");
    expect(receipts[0].changes.data[0].customer_note).toBe("Updated customer note - orderline");
});

test("note update title is generated", async () => {
    const store = await setupPosEnv();
    const order = await getFilledOrder(store);
    const allCategoryIds = new Set(store.models["pos.category"].map((c) => c.id));

    const line = order.lines[0];
    const manualOrderChange = {
        addedQuantity: [],
        removedQuantity: [],
        noteUpdate: [
            {
                ...buildChangeLine({
                    uuid: line.uuid,
                    product: line.product_id,
                    quantity: line.qty,
                    name: line.product_id.display_name,
                }),
                customer_note: "Updated customer note - orderline",
            },
        ],
    };

    const generator = store.ticketPrinter.getGenerator({ models: store.models, order });
    const receipts = generator.generatePreparationData(allCategoryIds, {
        orderChange: manualOrderChange,
    });

    expect(receipts).toHaveLength(1);
    expect(receipts[0].changes.title).toBe("NOTE UPDATE");
    expect(receipts[0].changes.data).toHaveLength(1);
    expect(receipts[0].changes.data[0].customer_note).toBe("Updated customer note - orderline");
});

test("only printers with matching categories are used", async () => {
    const store = await setupPosEnv();
    const order = await getFilledOrder(store);

    const category1 = store.models["pos.category"].get(1);
    const category2 = store.models["pos.category"].get(2);

    const printer1 = store.models["pos.printer"].create({
        name: "Printer 1",
        printer_type: "epson_epos",
        product_categories_ids: [category1],
    });
    const printer2 = store.models["pos.printer"].create({
        name: "Printer 2",
        printer_type: "epson_epos",
        product_categories_ids: [category2],
    });

    printer1._instance = {};
    printer2._instance = {};

    let printedBy = [];
    store.ticketPrinter.generateIframe = async () => ({
        contentWindow: {},
        contentDocument: {},
    });
    store.ticketPrinter.generateImage = async () => "mock-image";
    store.ticketPrinter.print = async ({ printer }) => {
        printedBy.push(printer.name);
        return { successful: true };
    };
    store.ticketPrinter.showPrinterErrorDialog = () => {};
    store.ticketPrinter.setIframeSizeFromPrinter = () => {};

    // Both printers print when order has lines matching both categories
    let result = await store.ticketPrinter.printOrderChanges({
        order,
        printers: [printer1, printer2],
    });
    expect(result).toBe(true);
    expect(printedBy.sort()).toEqual(["Printer 1", "Printer 2"]);

    // Only matching printer prints when order has lines for one category
    order.lines[1].delete();
    printedBy = [];
    result = await store.ticketPrinter.printOrderChanges({
        order,
        printers: [printer1, printer2],
    });
    expect(result).toBe(true);
    expect(printedBy).toEqual(["Printer 1"]);
});

test("check only matching categories product data printed and reprinted", async () => {
    // The preparation printers are configured to accept products with different categories.
    // This test ensures that the printer selection and reprint flow respect category filtering.
    const store = await setupAndMountPosApp();
    const printer = store.models["pos.printer"].create({
        name: "Preparation Printer",
        product_categories_ids: [4],
        printer_type: "epson_epos",
        use_type: "preparation",
    });
    Object.assign(store.config, {
        preparation_printer_ids: [1, printer.id],
    });
    await store.ticketPrinter.initPrinters();
    let printedData = [];
    const generateIframeFun = store.ticketPrinter.generateIframe;
    patch(store.ticketPrinter, {
        async generateIframe(...args) {
            const data = args[1];
            // Capture the generated preparation payload so the assertions validate the filtered
            // products independently from the printer UI rendering itself.
            printedData.push(
                data.changes.data.map((line) => ({
                    basic_name: line.basic_name,
                    quantity: line.quantity,
                }))
            );
            return await generateIframeFun(...args);
        },
        print() {
            return { successful: true };
        },
    });
    await Utils.clickTable("1");
    await Utils.clickDisplayedProduct("Steel desk");
    await Utils.clickOrderButton();
    await animationFrame();
    await Utils.clickPlanButton();
    // Printed for preparation printer with id 1 which contains same category as Steel desk
    expect(printedData).toHaveLength(1);
    expect(printedData[0]).toHaveLength(1);
    expect(printedData[0][0]).toMatchObject({
        basic_name: "Steel desk",
        quantity: 1,
    });
    printedData = [];
    await advanceTime(300);
    await Utils.clickTable("1");
    await Utils.clickDisplayedProduct("Bacon burger");
    await Utils.clickOrderButton();
    await animationFrame();
    await Utils.clickPlanButton();
    // Printed for preparation printer with id 5 which contains same category as bacon burger
    expect(printedData).toHaveLength(1);
    expect(printedData[0]).toHaveLength(1);
    expect(printedData[0][0]).toMatchObject({
        basic_name: "Bacon burger",
        quantity: 1,
    });
    printedData = [];
    await advanceTime(300);
    await Utils.clickTable("1");
    await Utils.checkNoOrderButton();
    if (store.ui.isSmall) {
        await Utils.clickBackButton();
    }
    await Utils.clickReprintButton();
    await waitUntil(() => printedData.length === 2);
    // Reprint both the order lines separately because of different categories
    expect(printedData).toHaveLength(2);
    expect(printedData[0]).toHaveLength(1);
    expect(printedData[0][0]).toMatchObject({
        basic_name: "Steel desk",
        quantity: 1,
    });
    expect(printedData[1]).toHaveLength(1);
    expect(printedData[1][0]).toMatchObject({
        basic_name: "Bacon burger",
        quantity: 1,
    });
});

function mockPrinterInstance(maxWidth = 512, fontSize = 22) {
    return { getStyle: () => ({ maxWidth, fontSize }) };
}

test("identical preparation tickets are rendered once per printer style", async () => {
    const store = await setupPosEnv();
    const order = await getFilledOrder(store);
    const category1 = store.models["pos.category"].get(1);
    const [kitchen, kitchenCopy, smallKitchen] = ["Kitchen", "Kitchen copy", "Small"].map((name) =>
        store.models["pos.printer"].create({
            name,
            printer_type: "epson_epos",
            product_categories_ids: [category1],
        })
    );
    kitchen._instance = mockPrinterInstance();
    kitchenCopy._instance = mockPrinterInstance();
    smallKitchen._instance = mockPrinterInstance(360);

    let renderCount = 0;
    const printedImages = [];
    patch(store.ticketPrinter, {
        async generateIframe(template, ticket) {
            renderCount++;
            return ticket;
        },
        setIframeSizeFromPrinter() {},
        async generateImage(ticket) {
            return ticket;
        },
        async print({ printer, image }) {
            printedImages.push({ name: printer.name, image });
            return { successful: true };
        },
    });

    const result = await store.ticketPrinter.printOrderChanges({
        order,
        printers: [kitchen, kitchenCopy, smallKitchen],
    });
    expect(result).toBe(true);
    expect(renderCount).toBe(2);
    expect(printedImages.map(({ name }) => name)).toEqual(["Kitchen", "Kitchen copy", "Small"]);
    const [kitchenImage, kitchenCopyImage, smallImage] = printedImages.map(({ image }) => image);
    // Same content and style for the 2 kitchens: same image
    expect(kitchenCopyImage).toBe(kitchenImage);
    // Different width for the small printer: its own image
    expect(smallImage).not.toBe(kitchenImage);
});

test("preparation printers print in parallel, each printer in order", async () => {
    const store = await setupPosEnv();
    const order = await getFilledOrder(store);
    const kitchen = store.models["pos.printer"].create({
        name: "Kitchen",
        printer_type: "epson_epos",
        product_categories_ids: [store.models["pos.category"].get(1)],
    });
    // Not loaded in the test data: 3 "TEST" split per product for the kitchen
    kitchen.is_split_per_product = true;
    const bar = store.models["pos.printer"].create({
        name: "Bar",
        printer_type: "epson_epos",
        product_categories_ids: [store.models["pos.category"].get(2)],
    });
    kitchen._instance = mockPrinterInstance();
    bar._instance = mockPrinterInstance();

    // Prints are on hold until released
    let releasePrints;
    const printsReleased = new Promise((resolve) => (releasePrints = resolve));
    const printedBy = [];
    let kitchenFailures = 1;
    let errorMessage;
    patch(store.ticketPrinter, {
        async generateIframe(template, ticket) {
            return ticket;
        },
        setIframeSizeFromPrinter() {},
        async generateImage(ticket) {
            return ticket;
        },
        async print({ printer }) {
            printedBy.push(printer.name);
            await printsReleased;
            if (printer === kitchen && kitchenFailures-- > 0) {
                return { successful: false, message: { body: "Unreachable" } };
            }
            return { successful: true };
        },
        showPrinterErrorDialog(message) {
            errorMessage = message.body;
        },
    });

    const printPromise = store.ticketPrinter.printOrderChanges({
        order,
        printers: [kitchen, bar],
    });
    // The bar doesn't wait for the kitchen, but the kitchen waits for its first ticket
    // to be printed before sending the next one
    await waitUntil(() => printedBy.length === 2);
    await animationFrame();
    expect(printedBy).toEqual(["Kitchen", "Bar"]);

    // The first kitchen ticket fails, the next ones are still sent
    releasePrints();
    expect(await printPromise).toBe(true);
    expect(printedBy).toEqual(["Kitchen", "Bar", "Kitchen", "Kitchen"]);
    expect(errorMessage).toBe("Kitchen: Unreachable");
});

test("disconnected preparation printer is reported without blocking the others", async () => {
    const store = await setupPosEnv();
    const order = await getFilledOrder(store);
    const kitchen = store.models["pos.printer"].create({
        name: "Kitchen",
        printer_type: "epson_epos",
        product_categories_ids: [store.models["pos.category"].get(1)],
    });
    const bar = store.models["pos.printer"].create({
        name: "Bar",
        printer_type: "epson_epos",
        product_categories_ids: [store.models["pos.category"].get(2)],
    });
    kitchen._instance = false;
    bar._instance = mockPrinterInstance();

    const printedBy = [];
    let errorMessage;
    patch(store.ticketPrinter, {
        async generateIframe(template, ticket) {
            return ticket;
        },
        setIframeSizeFromPrinter() {},
        async generateImage(ticket) {
            return ticket;
        },
        async print({ printer }) {
            printedBy.push(printer.name);
            return { successful: true };
        },
        showPrinterErrorDialog(message) {
            errorMessage = message.body;
        },
    });

    const result = await store.ticketPrinter.printOrderChanges({ order, printers: [kitchen, bar] });
    expect(result).toBe(true);
    expect(printedBy).toEqual(["Bar"]);
    expect(errorMessage).toBe("Kitchen is not connected");
});

test("preparation ticket is sent as soon as it is rendered", async () => {
    const store = await setupPosEnv();
    const order = await getFilledOrder(store);
    const kitchen = store.models["pos.printer"].create({
        name: "Kitchen",
        printer_type: "epson_epos",
        product_categories_ids: [store.models["pos.category"].get(1)],
    });
    const bar = store.models["pos.printer"].create({
        name: "Bar",
        printer_type: "epson_epos",
        product_categories_ids: [store.models["pos.category"].get(2)],
    });
    kitchen._instance = mockPrinterInstance();
    bar._instance = mockPrinterInstance();

    // The bar ticket rendering is on hold until released
    let releaseRendering;
    const renderingReleased = new Promise((resolve) => (releaseRendering = resolve));
    let renderCount = 0;
    const printedBy = [];
    patch(store.ticketPrinter, {
        async generateIframe(template, ticket) {
            return ticket;
        },
        setIframeSizeFromPrinter() {},
        async generateImage(ticket) {
            if (++renderCount > 1) {
                await renderingReleased;
            }
            return ticket;
        },
        async print({ printer }) {
            printedBy.push(printer.name);
            return { successful: true };
        },
    });

    const printPromise = store.ticketPrinter.printOrderChanges({
        order,
        printers: [kitchen, bar],
    });
    // The kitchen ticket doesn't wait for the bar ticket to be rendered
    await waitUntil(() => printedBy.length === 1);
    expect(printedBy).toEqual(["Kitchen"]);

    releaseRendering();
    expect(await printPromise).toBe(true);
    expect(printedBy).toEqual(["Kitchen", "Bar"]);
});
