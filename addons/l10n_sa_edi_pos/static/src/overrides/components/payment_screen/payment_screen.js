/** @odoo-module */

import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { ZatcaErrorPopup } from "@l10n_sa_edi_pos/app/zatca_error_popup/zatca_error_popup";
import { _t } from "@web/core/l10n/translation";
import { escape } from "@web/core/utils/strings";
import { patch } from "@web/core/utils/patch";
import { markup } from "@odoo/owl";

patch(PaymentScreen.prototype, {
    //@Override
    shouldDownloadInvoice() {
        // For SA companies the PDF is deferred (generated on demand). Skip the
        // automatic post-checkout download so the cashier is never presented
        // with a proforma instead of the real invoice.
        if (this.pos.isSACompany) {
            return false;
        }
        return super.shouldDownloadInvoice();
    },
    //@Override
    async _finalizeValidation() {
        await super._finalizeValidation(...arguments);
        const order = this.currentOrder;
        // note: isSACompany guarantees order.is_to_invoice()
        // note: Skips entirely if journal is not onboarded or electronic invoicing is not selected
        // Also skip if invoice is not mandatory(Ex: settlement)
        if (
            this.pos.isSACompany &&
            order.finalized &&
            !order.l10n_sa_invoice_qr_code_str &&
            order.isInvoiceMandatoryForSA
        ) {
            const orderError = escape(
                _t("%s by going to Backend > Orders > Invoice", order.name)
            );
            const href = `/web#model=account.move&id=${order.account_move}&view_type=form`;
            const link = `<a target="_blank" href="${escape(href)}" class="text-info fw-bolder">${escape(
                _t("Invoice")
            )}</a>`;
            const errorInfo = order.account_move ? link : orderError;
            const message = markup(
                _t(
                    `The Receipt and Invoice generated here are not valid documents as there is ` +
                        `an error in their processing. You need to resolve the errors first in %s` +
                        `. Upon Successful submission, you can reprint the Invoice and the Receipt.`,
                    errorInfo
                )
            );

            this.popup.add(ZatcaErrorPopup, {
                title: _t("ZATCA Validation Error"),
                body: message,
            });
        }
    },
});
