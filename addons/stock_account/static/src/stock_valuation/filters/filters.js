import { Component } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";

export class StockValuationReportFilters extends Component {
    static template = "stock_account.StockValuationReport.Filters";
    static components = { Dropdown };
    static props = {};
}
