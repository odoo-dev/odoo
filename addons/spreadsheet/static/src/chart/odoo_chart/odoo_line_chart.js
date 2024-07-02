/** @odoo-module */

import * as spreadsheet from "@odoo/o-spreadsheet";
import { _t } from "@web/core/l10n/translation";
import { OdooChart } from "./odoo_chart";

const { chartRegistry } = spreadsheet.registries;
const { INTERACTIVE_LEGEND_CONFIG } = spreadsheet.constants;

const {
    getDefaultChartJsRuntime,
    getChartAxisTitleRuntime,
    getCustomLegendLabels,
    chartFontColor,
    ColorGenerator,
    getFillingMode,
    colorToRGBA,
    rgbaToHex,
} = spreadsheet.helpers;

const LINE_FILL_TRANSPARENCY = 0.4;

export class OdooLineChart extends OdooChart {
    constructor(definition, sheetId, getters) {
        super(definition, sheetId, getters);
        this.verticalAxisPosition = definition.verticalAxisPosition;
        this.stacked = definition.stacked;
        this.cumulative = definition.cumulative;
        this.axesDesign = definition.axesDesign;
        this.fillArea = definition.fillArea;
    }

    getDefinition() {
        return {
            ...super.getDefinition(),
            verticalAxisPosition: this.verticalAxisPosition,
            stacked: this.stacked,
            cumulative: this.cumulative,
            axesDesign: this.axesDesign,
            fillArea: this.fillArea,
        };
    }
}

chartRegistry.add("odoo_line", {
    match: (type) => type === "odoo_line",
    createChart: (definition, sheetId, getters) => new OdooLineChart(definition, sheetId, getters),
    getChartRuntime: createOdooChartRuntime,
    validateChartDefinition: (validator, definition) =>
        OdooLineChart.validateChartDefinition(validator, definition),
    transformDefinition: (definition) => OdooLineChart.transformDefinition(definition),
    getChartDefinitionFromContextCreation: () => OdooLineChart.getDefinitionFromContextCreation(),
    name: _t("Line"),
});

function createOdooChartRuntime(chart, getters) {
    const background = chart.background || "#FFFFFF";
    const { datasets, labels } = chart.dataSource.getData();
    const locale = getters.getLocale();
    const chartJsConfig = getLineConfiguration(chart, labels, locale);
    const colors = new ColorGenerator(datasets.length);

    for (let [index, { label, data, cumulatedStart }] of datasets.entries()) {
        const color = colors.next();
        let backgroundColor = color;
        if (chart.fillArea) {
            const backgroundRGBA = colorToRGBA(color);
            // use the transparency of Odoo to keep consistency
            backgroundRGBA.a = LINE_FILL_TRANSPARENCY;
            backgroundColor = rgbaToHex(backgroundRGBA);
        }
        if (chart.cumulative) {
            let accumulator = cumulatedStart;
            data = data.map((value) => {
                accumulator += value;
                return accumulator;
            });
        }

        const dataset = {
            label,
            data,
            lineTension: 0,
            borderColor: color,
            backgroundColor,
            pointBackgroundColor: color,
            fill: chart.fillArea ? getFillingMode(index, chart.stacked) : false,
        };
        chartJsConfig.data.datasets.push(dataset);
    }
    return { background, chartJsConfig };
}

function getLineConfiguration(chart, labels, locale) {
    const fontColor = chartFontColor(chart.background);
    const config = getDefaultChartJsRuntime(chart, labels, fontColor, { locale });
    const filled = chart.fillArea || chart.stacked;
    const pointStyle = filled ? "rect" : "line";
    const lineWidth = filled ? 2 : 3;
    config.type = chart.type.replace("odoo_", "");
    const legend = {
        ...config.options.legend,
        display: chart.legendPosition !== "none",
        ...INTERACTIVE_LEGEND_CONFIG,
        ...getCustomLegendLabels(fontColor, {
            pointStyle,
            lineWidth,
        })
    };
    legend.position = chart.legendPosition;
    config.options.plugins = config.options.plugins || {};
    config.options.plugins.legend = legend;
    config.options.layout = {
        padding: { left: 20, right: 20, top: chart.title ? 10 : 25, bottom: 10 },
    };
    config.options.scales = {
        x: {
            ticks: {
                // x axis configuration
                maxRotation: 60,
                minRotation: 15,
                padding: 5,
                labelOffset: 2,
                color: fontColor,
            },
            title: getChartAxisTitleRuntime(chart.axesDesign?.x),
        },
        y: {
            position: chart.verticalAxisPosition,
            ticks: {
                color: fontColor,
            },
            title: getChartAxisTitleRuntime(chart.axesDesign?.y),
        },
    };
    if (chart.stacked) {
        config.options.scales.y.stacked = true;
    }
    return config;
}
