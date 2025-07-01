import { useService } from "@web/core/utils/hooks";


export class StockValuationReportController {
    constructor(action) {
        this.action = action;
        this.actionService = useService("action");
        this.dialog = useService("dialog");
        this.orm = useService("orm");
    }

    load(data) {
        this.currencyId = data.currency_id;
        this.companyId = data.company_id;
    }

    // Actions -----------------------------------------------------------------
    actionGenerateEntry() {
        const periodicCOGS = false; // TODO: make it truly optional.
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
