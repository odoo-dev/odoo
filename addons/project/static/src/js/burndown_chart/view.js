/** @odoo-module alias=project.BurndownChartView **/
import GraphView from 'web.GraphView';
import viewRegistry from 'web.view_registry';
import { BurndownChartRenderer } from "./renderer";

export const BurndownChartView = GraphView.extend({
    config: Object.assign({}, GraphView.prototype.config, {
        Renderer: BurndownChartRenderer,
    })
});

viewRegistry.add('burndown_chart', BurndownChartView);
