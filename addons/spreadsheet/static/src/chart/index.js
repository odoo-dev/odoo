/** @odoo-module */

import * as spreadsheet from "@odoo/o-spreadsheet";

const { chartComponentRegistry } = spreadsheet.registries;
const { ChartJsComponent } = spreadsheet.components;

chartComponentRegistry.add("odoo_bar", ChartJsComponent);
chartComponentRegistry.add("odoo_line", ChartJsComponent);
chartComponentRegistry.add("odoo_pie", ChartJsComponent);

import OdooChartCorePlugin from "./plugins/odoo_chart_core_plugin";
import ChartOdooActionPlugin from "./plugins/chart_odoo_action_plugin";
import OdooChartUIPlugin from "./plugins/odoo_chart_ui_plugin";

export { OdooChartCorePlugin, ChartOdooActionPlugin, OdooChartUIPlugin };
