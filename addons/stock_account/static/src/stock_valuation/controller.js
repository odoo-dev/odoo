import { reactive } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
const { DateTime } = luxon;


export class StockValuationReportController {
    constructor(action) {
        this.action = action;
        this.actionService = useService("action");
        this.dialog = useService("dialog");
        this.orm = useService("orm");
        this.state = reactive({
            date: DateTime.now(),
        });
    }

    async load() {
        await this.loadReportData();
        this.currencyId = this.data.currency_id;
        this.companyId = this.data.company_id;
    }

    async loadReportData() {
        const kwargs = {
            date: this.state.date.toFormat("yyyy-MM-dd"),
        };
        const res = await this.orm.call(
            "stock_account.stock.valuation.report",
            "get_report_values",
            [],
            kwargs
        );
        this.data = res.data;
    }

    async setDate(date) {
        this.state.date = date;
        await this.loadReportData();
    }

    // Actions -----------------------------------------------------------------
    actionGenerateEntry() {
        const periodicCOGS = true; // TODO: make it truly optional.
        const args = [[this.companyId], periodicCOGS];
        return this.orm.call("res.company", "post_stock_valuation", args);
    }

    actionPrintReport(format="pdf") {
        if (format === "pdf") {
            return this.orm.call("stock_account.stock.valuation.report", "action_print_as_pdf");
        } else if (format === "xlsx") {
            return this.orm.call("stock_account.stock.valuation.report", "action_print_as_xlsx");
        }
    }
}
