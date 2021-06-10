/** @odoo-module **/

import { hexToRGBA } from "@web/views/graph/graph_utils";
import { GraphView } from "@web/views/graph/graph_view";
import { registry } from "@web/core/registry";

const viewRegistry = registry.category("views");

class BurndownChartView extends GraphView {
    /**
     * @override
     */
    getLineChartData() {
        const data = super.getLineChartData();
        const { stacked } = this.model.metaData;
        if (stacked) {
            for (const dataset of data.datasets) {
                dataset.backgroundColor = hexToRGBA(dataset.borderColor, 0.4);
            }
        }
        return data;
    }

    /**
     * @override
     */
    getElementOptions() {
        const elementOptions = super.getElementOptions();
        const { mode, stacked } = this.model.metaData;
        if (mode === "line") {
            elementOptions.line.fill = stacked;
        }
        return elementOptions;
    }

    /**
     * @override
     */
    getScaleOptions() {
        const { xAxes, yAxes } = super.getScaleOptions();
        const { mode, stacked } = this.model.metaData;
        if (mode === "line") {
            for (const y of yAxes) {
                y.stacked = stacked;
            }
        }
        return { xAxes, yAxes };
    }
}
BurndownChartView.buttonTemplate = "project.BurndownChartView.Buttons";

viewRegistry.add("burndown_chart", BurndownChartView);
