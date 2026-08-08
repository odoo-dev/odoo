import { describe, expect, test } from "@odoo/hoot";

import { buildChartDataFromPivot } from "@spreadsheet/chart/odoo_chart/odoo_chart_pivot_helpers";
import { createModelWithDataSource } from "@spreadsheet/../tests/helpers/model";
import { waitForDataLoaded } from "@spreadsheet/helpers/model";
import {
    defineSpreadsheetModels,
    defineSpreadsheetActions,
    getBasicServerData,
} from "@spreadsheet/../tests/helpers/data";

describe.current.tags("headless");
defineSpreadsheetModels();
defineSpreadsheetActions();

/**
 * Create a model, add an Odoo pivot from the given (partial) definition, load
 * it and return the loaded pivot instance.
 */
async function createLoadedPivot(pivot) {
    const { model } = await createModelWithDataSource({ serverData: getBasicServerData() });
    model.dispatch("ADD_PIVOT", {
        pivotId: "1",
        pivot: { type: "ODOO", model: "partner", domain: [], context: {}, ...pivot },
    });
    const odooPivot = model.getters.getPivot("1");
    await odooPivot.load();
    await waitForDataLoaded(model);
    return odooPivot;
}

/** Map label -> data values for the single dataset. */
function byLabel(chartData) {
    return Object.fromEntries(
        chartData.dataSetsValues.map((ds) => [ds.label, ds.data.map((d) => d.value)])
    );
}

test("single row dimension, single measure (count)", async () => {
    const pivot = await createLoadedPivot({
        rows: [{ fieldName: "product_id" }],
        columns: [],
        measures: [{ id: "__count", fieldName: "__count" }],
    });

    const chartData = buildChartDataFromPivot(pivot);

    expect(chartData.dataSetsValues).toHaveLength(1);
    expect(chartData.dataSetsValues[0].dataSetId).toBe("measure:__count");

    // label -> count : xphone has 1 record, xpad has 3
    const countByLabel = {};
    chartData.labelValues.forEach((label, i) => {
        countByLabel[label.value] = chartData.dataSetsValues[0].data[i].value;
    });
    expect(countByLabel).toEqual({ xphone: 1, xpad: 3 });
});

test("single row dimension, several measures -> one dataset per measure", async () => {
    const pivot = await createLoadedPivot({
        rows: [{ fieldName: "product_id" }],
        columns: [],
        measures: [
            { id: "__count", fieldName: "__count" },
            { id: "foo:sum", fieldName: "foo", aggregator: "sum" },
        ],
    });

    const chartData = buildChartDataFromPivot(pivot);

    expect(chartData.labelValues).toHaveLength(2);
    expect(chartData.dataSetsValues).toHaveLength(2);
    expect(chartData.dataSetsValues.map((ds) => ds.dataSetId).sort()).toEqual([
        "measure:__count",
        "measure:foo:sum",
    ]);

    const labels = chartData.labelValues.map((l) => l.value);
    const count = chartData.dataSetsValues.find((ds) => ds.dataSetId === "measure:__count");
    const fooSum = chartData.dataSetsValues.find((ds) => ds.dataSetId === "measure:foo:sum");
    const valueOf = (ds, label) => ds.data[labels.indexOf(label)].value;
    expect(valueOf(count, "xphone")).toBe(1);
    expect(valueOf(count, "xpad")).toBe(3);
    // foo: xphone -> 12 ; xpad -> 1 + 17 + 2 = 20
    expect(valueOf(fooSum, "xphone")).toBe(12);
    expect(valueOf(fooSum, "xpad")).toBe(20);
});

test("row + column dimensions -> one series per column group, empty cells are null", async () => {
    const pivot = await createLoadedPivot({
        rows: [{ fieldName: "bar" }],
        columns: [{ fieldName: "product_id" }],
        measures: [{ id: "__count", fieldName: "__count" }],
    });

    const chartData = buildChartDataFromPivot(pivot);

    // two `bar` groups (true / false) as labels
    expect(chartData.labelValues).toHaveLength(2);

    // one series per product, labelled by the product display name
    const series = byLabel(chartData);
    expect(Object.keys(series).sort()).toEqual(["xpad", "xphone"]);

    // xphone: 1 record (bar=true), nothing for bar=false -> a null gap
    expect(series.xphone.includes(null)).toBe(true);
    expect(series.xphone.filter((v) => v !== null)).toEqual([1]);
    // xpad: bar=true -> 2 (Steven, Taylor), bar=false -> 1 (Zara)
    expect(series.xpad.slice().sort()).toEqual([1, 2]);
});
