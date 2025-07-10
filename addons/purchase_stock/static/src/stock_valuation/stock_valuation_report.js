import { _t } from "@web/core/l10n/translation";
import { patch } from "@web/core/utils/patch";

import { StockValuationReport } from "@stock_account/stock_valuation/stock_valuation_report";


patch(StockValuationReport.prototype, {
    async loadReportData() {
        await super.loadReportData();
        this.purchaseOrderIds = this.data.not_invoiced_received_goods.lines.map((line) => line.id);
    },

    _getAccrual() {
        const accrual = super._getAccrual();
        const notInvoicedReceivedGoods = this.data.not_invoiced_received_goods;
        notInvoicedReceivedGoods.display_name = _t("Goods Received Not Invoiced");
        notInvoicedReceivedGoods.method = this.openPurchaseOrder.bind(this);
        notInvoicedReceivedGoods.id = 0; // TODO: find better solution
        accrual.lines.push(this.data.not_invoiced_received_goods);
        accrual.value += this.data.not_invoiced_received_goods.value;
        return accrual;
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
        if (line?.id) {
            action.views = [[false, "form"]],
            action.res_id = line.id;
        } else {
            action.domain = [["id", "in", this.purchaseOrderIds]];
        }
        return this.actionService.doAction(action);
    },
});
