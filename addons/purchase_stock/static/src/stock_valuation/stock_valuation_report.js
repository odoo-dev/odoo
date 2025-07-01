import { _t } from "@web/core/l10n/translation";
import { patch } from "@web/core/utils/patch";

import { StockValuationReport } from "@stock_account/stock_valuation/stock_valuation_report";


patch(StockValuationReport.prototype, {
    async loadReportData() {
        await super.loadReportData();
        this.purchaseOrderIds = this.data.not_invoiced_received_goods.lines.map((line) => line.id);
    },

    // Getters -----------------------------------------------------------------
    get notInvoicedReceivedValuation() {
        return this.formatMonetary(this.data.not_invoiced_received_goods.value);
    },

    // On Click Methods --------------------------------------------------------
    openPurchaseOrder(line=false) {
        const action = {
            type: "ir.actions.act_window",
            name: _t("Purchase Orders"),
            res_model: "purchase.order",
            views: [[false, "list"], [false, "form"]],
            target: "current",
        }
        if (line) {
            action.views = [[false, "form"]],
            action.res_id = line.id;
        } else {
            action.domain = [["id", "in", this.purchaseOrderIds]];
        }
        return this.actionService.doAction(action);
    },
});