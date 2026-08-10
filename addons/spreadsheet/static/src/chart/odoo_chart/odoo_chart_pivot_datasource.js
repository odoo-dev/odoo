import { registries } from "@odoo/o-spreadsheet";
import { CommandResult } from "../../o_spreadsheet/cancelled_reason";
import { buildChartDataFromPivot } from "./odoo_chart_pivot_helpers";

const { chartDataSourceRegistry } = registries;

const EMPTY_CHART_DATA = { dataSetsValues: [], labelValues: [] };

/**
 * Chart data source backed by an Odoo pivot.
 *
 * The chart definition only stores a reference to a pivot
 * (`dataSource: { type: "odoo_pivot", pivotId }`); the data itself is derived
 * from the live pivot through `getters.getPivot(pivotId)`. Loading, reloading
 * (global filters, refresh) and re-rendering are handled by the pivot layer and
 * the standard `EVALUATE_CELLS` invalidation, so this builder is a thin,
 * (mostly) stateless adapter.
 */
chartDataSourceRegistry.add("odoo_pivot", {
    // Bar/line/pie for now. Hierarchical (sunburst/treemap), geo and the other
    // types are added together with their data extraction / drill-down.
    supportedChartTypes: ["bar", "line", "pie"],
    fromExternalDefinition: (dataSource) => dataSource,
    fromContextCreation: (context) => context.dataSource,
    fromHierarchicalContextCreation: (context) => context.dataSource,
    validate: () => CommandResult.Success,
    transform: (dataSource) => dataSource,
    extractData: (dataSource, chartId, getters) => {
        const pivot = getters.getPivot(dataSource.pivotId);
        // `assertIsValid` triggers a (lazy) load when needed and returns a
        // truthy error/loading marker while the pivot is not ready. The chart
        // runtime is re-evaluated through `EVALUATE_CELLS` once the load
        // resolves, which re-runs `extractData`.
        if (!pivot || pivot.assertIsValid({ throwOnError: false })) {
            return EMPTY_CHART_DATA;
        }
        return buildChartDataFromPivot(pivot);
    },
    // Hierarchical extraction is added with the hierarchical chart types.
    extractHierarchicalData: () => EMPTY_CHART_DATA,
    adaptRanges: (dataSource) => dataSource,
    getDefinition: (dataSource) => dataSource,
    duplicateInDuplicatedSheet: (dataSource) => dataSource,
    getContextCreation: (dataSource) => ({ dataSource }),
    getHierarchicalContextCreation: (dataSource) => ({ dataSource }),
    toExcelDataSets: () => undefined,
});
