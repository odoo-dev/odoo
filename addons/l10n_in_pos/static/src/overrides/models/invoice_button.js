/** @odoo-module */

import { InvoiceButton } from "@point_of_sale/app/screens/ticket_screen/invoice_button/invoice_button";

import { patch } from "@web/core/utils/patch";
import { companyStateDialog } from "@l10n_in_pos/company_state_dialog/company_state_dialog";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";

patch(InvoiceButton.prototype, {
    click() {
        if (this.pos.company.country_id?.code === "IN" && !this.pos.company.state_id) {
            this.dialog.add(companyStateDialog);
            return;
        }
        return super.click();
    },
    async _invoiceOrder() {
        await super._invoiceOrder(...arguments);
        const order = this.props.order;
        if (!order.is_invoiced) {
            await this.dialog.add(AlertDialog, {
                title: _t("Invoicing Failed"),
                body: _t(
                    "This order was not invoiced. It might be invalid or from a previous month."
                ),
            });
        }
    },
});
