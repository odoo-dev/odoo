import { beforeEach, expect, test, mockFetch } from "@odoo/hoot";
import { mountView, contains } from "@web/../tests/web_test_helpers";
import { definePosModels } from "../data/generate_model_definitions";
import { PosPrinter } from "@point_of_sale/../tests/unit/data/pos_printer.data";
import { setupPosEnv } from "../utils";

definePosModels();

beforeEach(() => {
    PosPrinter._views = {
        form: `
            <form string="Printer">
                <field name="name"/>
                <field name="printer_type"/>
                <field name="printer_ip"/>
                <field name="use_lna"/>
                <widget name="point_of_sale_test_epos"/>
            </form>`,
    };
    PosPrinter._records = [
        ...PosPrinter._records,
        {
            id: 21,
            name: "Sir Prints-A-Lot (but not today)",
            printer_type: "epson_epos",
            use_type: "receipt",
            printer_ip: "definitely.renamed.everywhere.except.here",
            product_categories_ids: [],
            use_lna: false,
        },
    ];
});

test("Test EPOS Button URL Computation", async () => {
    await setupPosEnv();
    await mountView({
        resModel: "pos.printer",
        resId: 21,
        type: "form",
    });

    let requestedUrl = "";
    let requestOptions = null;
    mockFetch((url, options) => {
        requestedUrl = url;
        requestOptions = options;
    });

    await contains("button:contains('Test')").click();
    expect(requestOptions.method).toBe("POST");
    expect(requestedUrl).toBe(
        "http://definitely.renamed.everywhere.except.here/cgi-bin/epos/service.cgi?devid=local_printer"
    );
});
