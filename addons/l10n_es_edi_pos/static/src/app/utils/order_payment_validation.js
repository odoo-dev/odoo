import OrderPaymentValidation from "@point_of_sale/app/utils/order_payment_validation";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";
import { patch } from "@web/core/utils/patch";

patch(OrderPaymentValidation.prototype, {
    async askBeforeValidation() {
        // Block the payment before anything is sent to the server: the server check
        // (`_l10n_es_pos_check_simplified_invoice_limit`) remains as the safeguard for
        // orders reaching it by other means.
        if (
            this.order.l10nEsPosFiscalMode &&
            !this.order.isToInvoice() &&
            !this.order.l10nEsPosCanBeSimplifiedInvoice()
        ) {
            this.pos.env.services.dialog.add(AlertDialog, {
                title: _t("Invoice required"),
                body: _t(
                    "The order amount is above the simplified invoice limit. Select a customer and request an invoice to validate it."
                ),
            });
            return false;
        }
        return await super.askBeforeValidation(...arguments);
    },
});