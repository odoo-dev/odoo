import { _t } from "@web/core/l10n/translation";

/**
 * Helpers to derive a standard o-spreadsheet chart data structure
 * (`{ dataSetsValues, labelValues }`) from an Odoo pivot.
 *
 * This is the pure, side-effect-free core of the future "odoo_pivot" chart data
 * source: it only reads from an (already loaded) pivot through its public API
 * and never mutates it. The chart data source builder (registered separately)
 * is responsible for loading state, cumulative transforms and wiring.
 *
 * Mapping (mirrors the graph view semantics):
 *   - pivot rows    -> chart labels (x-axis), one entry per leaf row
 *   - pivot columns -> series, combined with each visible measure
 *
 * Sub-totals and grand totals produced by the pivot table are dropped: only the
 * leaf row x leaf column value cells are kept (detected by counting the domain
 * nodes belonging to row / column dimensions).
 */

/**
 * @typedef {import("@spreadsheet").OdooPivot} OdooPivot
 * @typedef {{ value: (number|string|boolean|null), format?: string }} ChartDataPoint
 * @typedef {{ dataSetId: string, label: string, data: ChartDataPoint[] }} ChartDataSet
 * @typedef {{ dataSetsValues: ChartDataSet[], labelValues: {value: (number|string|boolean|null)}[] }} ChartData
 */

/**
 * Build the chart data (`{ dataSetsValues, labelValues }`) from a loaded pivot.
 *
 * @param {OdooPivot} pivot a loaded and valid pivot
 * @returns {ChartData}
 */
export function buildChartDataFromPivot(pivot) {
    const definition = pivot.definition;
    const rowFields = new Set(definition.rows.map((dim) => dim.nameWithGranularity));
    const colFields = new Set(definition.columns.map((dim) => dim.nameWithGranularity));
    const rowCount = definition.rows.length;
    const colCount = definition.columns.length;

    const table = pivot.getExpandedTableStructure();

    const labelOrder = []; // ordered unique row keys (JSON of the row domain)
    const labelKeyToNodes = {}; // row key -> PivotDomain (row part)
    const seriesOrder = []; // ordered unique series keys
    const seriesKeyToInfo = {}; // series key -> { colNodes, measureId }
    const cellValues = {}; // `${seriesKey}@@${rowKey}` -> value

    // `getPivotCells()` is column-major: an array of columns, each an array of
    // cells. Iterating it yields row leaves in display order for the first data
    // column, and series in column order.
    for (const column of table.getPivotCells()) {
        for (const cell of column) {
            if (cell.type !== "VALUE") {
                continue;
            }
            const rowNodes = cell.domain.filter((node) => rowFields.has(node.field));
            const colNodes = cell.domain.filter((node) => colFields.has(node.field));
            if (rowNodes.length !== rowCount || colNodes.length !== colCount) {
                // sub-total or grand-total cell
                continue;
            }
            const rowKey = JSON.stringify(rowNodes);
            const seriesKey = JSON.stringify([colNodes, cell.measure]);
            if (!(rowKey in labelKeyToNodes)) {
                labelKeyToNodes[rowKey] = rowNodes;
                labelOrder.push(rowKey);
            }
            if (!(seriesKey in seriesKeyToInfo)) {
                seriesKeyToInfo[seriesKey] = { colNodes, measureId: cell.measure };
                seriesOrder.push(seriesKey);
            }
            const { value } = pivot.getPivotCellValueAndFormat(cell.measure, cell.domain);
            cellValues[`${seriesKey}@@${rowKey}`] = value === "" ? null : value;
        }
    }

    const labelValues = labelOrder.map((rowKey) => ({
        value: getHeaderPath(pivot, labelKeyToNodes[rowKey]),
    }));

    const hasMultipleMeasures = definition.measures.length > 1;
    const dataSetsValues = seriesOrder.map((seriesKey) => {
        const { colNodes, measureId } = seriesKeyToInfo[seriesKey];
        return {
            dataSetId: getDataSetId(colNodes, measureId),
            label: getSeriesLabel(pivot, colNodes, measureId, colCount, hasMultipleMeasures),
            data: labelOrder.map((rowKey) => ({
                value: cellValues[`${seriesKey}@@${rowKey}`] ?? null,
            })),
        };
    });

    return { dataSetsValues, labelValues };
}

/**
 * Display label of a (row or column) group, joining the header path of every
 * level with " / " (e.g. "Europe / Brussels").
 *
 * @param {OdooPivot} pivot
 * @param {import("@spreadsheet").PivotDomain} nodes
 * @returns {string}
 */
function getHeaderPath(pivot, nodes) {
    if (!nodes.length) {
        return _t("Total");
    }
    return nodes
        .map((_node, i) => pivot.getPivotHeaderValueAndFormat(nodes.slice(0, i + 1)).value)
        .join(" / ");
}

/**
 * Label of a chart series built from a column group and a measure.
 * - no column dimension: the series is the measure itself -> measure name
 * - a single measure: the series is the column path
 * - several measures: column path suffixed with the measure name
 *
 * @param {OdooPivot} pivot
 * @param {import("@spreadsheet").PivotDomain} colNodes
 * @param {string} measureId
 * @param {number} colCount
 * @param {boolean} hasMultipleMeasures
 * @returns {string}
 */
function getSeriesLabel(pivot, colNodes, measureId, colCount, hasMultipleMeasures) {
    const measureName = pivot.getMeasure(measureId).displayName;
    if (colCount === 0) {
        return measureName;
    }
    const path = getHeaderPath(pivot, colNodes);
    return hasMultipleMeasures ? `${path} / ${measureName}` : path;
}

/**
 * Stable identifier of a series, independent of display labels.
 *
 * @param {import("@spreadsheet").PivotDomain} colNodes
 * @param {string} measureId
 * @returns {string}
 */
function getDataSetId(colNodes, measureId) {
    return [
        ...colNodes.map((node) => `${node.field}:${JSON.stringify(node.value)}`),
        `measure:${measureId}`,
    ].join(",");
}
