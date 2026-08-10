import { animationFrame } from "@odoo/hoot-mock";
import { describe, expect, test } from "@odoo/hoot";

import * as spreadsheet from "@odoo/o-spreadsheet";
// Registers the "odoo_pivot" chart data source.
import "@spreadsheet/chart/odoo_chart/odoo_chart_pivot_datasource";
import { createModelWithDataSource } from "@spreadsheet/../tests/helpers/model";
import { waitForDataLoaded } from "@spreadsheet/helpers/model";
import {
    defineSpreadsheetModels,
    defineSpreadsheetActions,
    getBasicServerData,
} from "@spreadsheet/../tests/helpers/data";

const { chartDataSourceRegistry } = spreadsheet.registries;
const { UuidGenerator } = spreadsheet.helpers;

describe.current.tags("headless");
defineSpreadsheetModels();
defineSpreadsheetActions();

const COUNT_BY_PRODUCT_PIVOT = {
    type: "ODOO",
    model: "partner",
    domain: [],
    context: {},
    rows: [{ fieldName: "product_id" }],
    columns: [],
    measures: [{ id: "__count", fieldName: "__count" }],
    name: "Partner Pivot",
};

async function createModelWithPivot() {
    const { model } = await createModelWithDataSource({ serverData: getBasicServerData() });
    model.dispatch("ADD_PIVOT", { pivotId: "1", pivot: COUNT_BY_PRODUCT_PIVOT });
    return model;
}

test("the odoo_pivot chart data source is registered", () => {
    expect(chartDataSourceRegistry.contains("odoo_pivot")).toBe(true);
    const builder = chartDataSourceRegistry.get("odoo_pivot");
    expect(builder.supportedChartTypes).toEqual(["bar", "line", "pie"]);
});

test("extractData returns empty data while the pivot is loading, then the pivot data", async () => {
    const model = await createModelWithPivot();
    const builder = chartDataSourceRegistry.get("odoo_pivot");
    const dataSource = { type: "odoo_pivot", pivotId: "1" };

    // Not loaded yet -> empty (and a load is triggered under the hood).
    const loading = builder.extractData(dataSource, "chartId", model.getters);
    expect(loading).toEqual({ dataSetsValues: [], labelValues: [] });

    await model.getters.getPivot("1").load();

    const data = builder.extractData(dataSource, "chartId", model.getters);
    expect(data.labelValues.map((l) => l.value).sort()).toEqual(["xpad", "xphone"]);
    expect(data.dataSetsValues).toHaveLength(1);
    expect(data.dataSetsValues[0].dataSetId).toBe("measure:__count");
});

test("a bar chart based on an odoo pivot renders the pivot data", async () => {
    const model = await createModelWithPivot();
    const chartId = UuidGenerator.smallUuid();
    model.dispatch("CREATE_CHART", {
        sheetId: model.getters.getActiveSheetId(),
        chartId,
        figureId: UuidGenerator.smallUuid(),
        col: 0,
        row: 0,
        offset: { x: 10, y: 10 },
        definition: {
            type: "bar",
            dataSource: { type: "odoo_pivot", pivotId: "1" },
            title: { text: "Partners" },
            background: "#FFFFFF",
            legendPosition: "top",
            verticalAxisPosition: "left",
            stacked: false,
            id: chartId,
        },
    });

    await waitForDataLoaded(model);
    await animationFrame();

    const runtime = model.getters.getChartRuntime(chartId);
    const { labels, datasets } = runtime.chartJsConfig.data;
    const countByLabel = Object.fromEntries(labels.map((label, i) => [label, datasets[0].data[i]]));
    expect(countByLabel).toEqual({ xphone: 1, xpad: 3 });
});
