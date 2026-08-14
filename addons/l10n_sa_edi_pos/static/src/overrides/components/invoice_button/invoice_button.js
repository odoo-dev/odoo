/** @odoo-module */

import { InvoiceButton } from "@point_of_sale/app/screens/ticket_screen/invoice_button/invoice_button";
import { patch } from "@web/core/utils/patch";

patch(InvoiceButton.prototype, {
    async _downloadInvoice(orderId) {
        if (this.pos.isSACompany) {
            // PDF was deferred at checkout to avoid blocking on wkhtmltopdf.
            // Generate it now on demand before downloading so the user gets
            // the real signed invoice and not the proforma fallback.
            const [orderData] = await this.orm.read("pos.order", [orderId], ["account_move"], {
                load: false,
            });
            if (orderData?.account_move) {
                await this.orm.call("account.move", "l10n_sa_pos_ensure_invoice_pdf", [
                    orderData.account_move,
                ]);
            }
        }
        return super._downloadInvoice(...arguments);
    },
});
