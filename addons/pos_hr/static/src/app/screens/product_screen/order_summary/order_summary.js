import { OrderSummary } from "@point_of_sale/app/screens/product_screen/order_summary/order_summary";
import { ReloadErrorPopup } from "@point_of_sale/app/components/popups/reload_error_popup/reload_error_popup";
import { _t } from "@web/core/l10n/translation";
import { patch } from "@web/core/utils/patch";

patch(OrderSummary.prototype, {
    async setLinePrice(line, price) {
        if (this.pos.cashierHasPriceControlRights()) {
            await super.setLinePrice(line, price);
            return;
        }

        this.dialog.add(ReloadErrorPopup, {
            title: _t("Access Denied"),
            body: _t("You are not allowed to change the price of a product."),
        });
    },
});
