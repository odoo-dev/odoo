import { beforeEach, describe, expect, test } from "@odoo/hoot";
import { registries } from "@odoo/o-spreadsheet";
import { setCellContent, setSelection, updatePivot } from "@spreadsheet/../tests/helpers/commands";
import { defineSpreadsheetModels } from "@spreadsheet/../tests/helpers/data";
import { getFormattedValueGrid } from "@spreadsheet/../tests/helpers/getters";
import { createSpreadsheetWithPivot } from "@spreadsheet/../tests/helpers/pivot";
import { doMenuAction } from "@spreadsheet/../tests/helpers/ui";
import { waitForDataLoaded } from "@spreadsheet/helpers/model";
import { Partner, Product } from "../../helpers/data";
const { cellMenuRegistry } = registries;

describe.current.tags("headless");
defineSpreadsheetModels();

beforeEach(() => {
    Product._records.push(
        { id: 200, display_name: "chair", name: "chair" },
        { id: 201, display_name: "table", name: "table" }
    );
    Partner._records.push(
        { id: 200, foo: 12, bar: true, product_id: 200, probability: 100, currency_id: 1 },
        { id: 201, foo: 13, bar: false, product_id: 201, probability: 50, currency_id: 1 }
    );
});

const GROUPED_PRODUCTS = {
    parentField: "product_id",
    name: "GroupedProducts",
    groups: [{ name: "a group", values: [37, 41] }],
};

describe("Pivot custom groups", () => {
    test("Can have custom groups in a pivot", async function () {
        const { model, pivotId } = await createSpreadsheetWithPivot();
        updatePivot(model, pivotId, {
            columns: [{ fieldName: "GroupedProducts", order: "asc" }],
            rows: [],
            measures: [{ id: "probability:sum", fieldName: "probability", aggregator: "sum" }],
            customFields: { GroupedProducts: GROUPED_PRODUCTS },
        });
        await waitForDataLoaded(model);
        setCellContent(model, "A1", "=PIVOT(1)");

        // prettier-ignore
        expect(getFormattedValueGrid(model, "A1:E3")).toEqual({
            A1:"Partner Pivot",  B1: "a group",      C1: "chair",        D1: "table",        E1: "Total",
            A2: "",              B2: "Probability",  C2: "Probability",  D2: "Probability",  E2: "Probability",
            A3: "Total",         B3: "131.00",       C3: "100.00",       D3: "50.00",        E3: "281.00",
        });
    });
});

describe("Pivot custom groups menu items", () => {
    test("Can add custom groups from the menu items", async function () {
        const { model, pivotId, env } = await createSpreadsheetWithPivot();
        updatePivot(model, pivotId, {
            columns: [{ fieldName: "product_id" }],
            rows: [],
            measures: [{ id: "probability:sum", fieldName: "probability", aggregator: "sum" }],
        });
        await waitForDataLoaded(model);

        setSelection(model, "C1:E1"); // "xpad", "chair", "table" column headers
        await doMenuAction(cellMenuRegistry, ["pivot_headers_group"], env);
        const definition = model.getters.getPivotCoreDefinition(pivotId);
        expect(definition.customFields).toEqual({
            Product2: {
                parentField: "product_id",
                name: "Product2",
                groups: [{ name: "Group", values: [41, 200, 201] }],
            },
        });
        expect(definition.columns).toEqual([
            { fieldName: "Product2" },
            { fieldName: "product_id" },
        ]);
    });

    test("Grouping a mix of ungrouped an grouped values creates a new group and removes the old one", async function () {
        const { model, pivotId, env } = await createSpreadsheetWithPivot();
        updatePivot(model, pivotId, {
            columns: [{ fieldName: "product_id" }],
            rows: [],
            measures: [{ id: "probability:sum", fieldName: "probability", aggregator: "sum" }],
            customFields: {
                Product2: {
                    parentField: "product_id",
                    name: "Product2",
                    groups: [{ name: "Group", values: [41, 200, 201] }],
                },
            },
        });
        await waitForDataLoaded(model);

        setSelection(model, "B1:C1"); // "xphone", "xpad" column headers
        await doMenuAction(cellMenuRegistry, ["pivot_headers_group"], env);
        const definition = model.getters.getPivotCoreDefinition(pivotId);
        expect(definition.customFields).toEqual({
            Product2: {
                parentField: "product_id",
                name: "Product2",
                groups: [{ name: "Group", values: [37, 41] }],
            },
        });
        expect(definition.columns).toEqual([
            { fieldName: "Product2" },
            { fieldName: "product_id" },
        ]);
    });

    test("Can merge existing group with other values with menu items", async function () {
        const { model, pivotId, env } = await createSpreadsheetWithPivot();
        updatePivot(model, pivotId, {
            columns: [{ fieldName: "Product2", order: "asc" }],
            rows: [],
            measures: [{ id: "probability:sum", fieldName: "probability", aggregator: "sum" }],
            customFields: {
                Product2: {
                    parentField: "product_id",
                    name: "Product2",
                    groups: [{ name: "aaGroup", values: [200, 201] }],
                },
            },
        });
        await waitForDataLoaded(model);

        setSelection(model, "B1:C1"); // "aaGroup", "xPad" column headers
        await doMenuAction(cellMenuRegistry, ["pivot_headers_group"], env);
        const definition = model.getters.getPivotCoreDefinition(pivotId);
        expect(definition.customFields).toEqual({
            Product2: {
                parentField: "product_id",
                name: "Product2",
                groups: [{ name: "aaGroup", values: [200, 201, 41] }],
            },
        });
    });

    test("Can remove existing groups with menu items", async function () {
        const { model, pivotId, env } = await createSpreadsheetWithPivot();
        updatePivot(model, pivotId, {
            columns: [{ fieldName: "Product2", order: "asc" }, { fieldName: "product_id" }],
            rows: [],
            measures: [{ id: "probability:sum", fieldName: "probability", aggregator: "sum" }],
            customFields: {
                Product2: {
                    parentField: "product_id",
                    name: "Product2",
                    groups: [
                        { name: "MyGroup", values: [200, 201] },
                        { name: "MyGroup2", values: [37, 41] },
                    ],
                },
            },
        });
        await waitForDataLoaded(model);

        setSelection(model, "B1"); // "MyGroup" column headers
        await doMenuAction(cellMenuRegistry, ["pivot_headers_ungroup"], env);
        await waitForDataLoaded(model);
        let definition = model.getters.getPivotCoreDefinition(pivotId);
        expect(definition.customFields).toEqual({
            Product2: {
                parentField: "product_id",
                name: "Product2",
                groups: [{ name: "MyGroup2", values: [37, 41] }],
            },
        });

        setSelection(model, "C2"); // "xpad" column headers
        await doMenuAction(cellMenuRegistry, ["pivot_headers_ungroup"], env);
        await waitForDataLoaded(model);
        definition = model.getters.getPivotCoreDefinition(pivotId);
        expect(definition.customFields).toEqual({});
        expect(definition.columns).toEqual([{ fieldName: "product_id" }]);
    });
});
