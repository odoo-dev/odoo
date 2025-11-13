import { registry } from "@web/core/registry";
import { ProgressBarField, progressBarField } from "@web/views/fields/progress_bar/progress_bar_field";

export class PurchaseOnTimeRateProgressBar extends ProgressBarField {
    static template="purchase_stock.PurchaseOnTimeRateProgressBar";

    get progressBarColorClass() {
        return "o_purchase_stock_progressbar_bg";
    }
}

export const purchaseOnTimeRateProgressBar = {
    ...progressBarField,
    component: PurchaseOnTimeRateProgressBar,
};

registry.category("fields").add("purchase_stock_progressbar", purchaseOnTimeRateProgressBar);
