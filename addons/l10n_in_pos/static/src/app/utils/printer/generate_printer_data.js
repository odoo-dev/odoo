import { patch } from "@web/core/utils/patch";
import { GeneratePrinterData } from "@point_of_sale/app/utils/printer/generate_printer_data";

/**
 * This class is a JS copy of the class PosOrderReceipt in Python.
 */
patch(GeneratePrinterData.prototype, {
    generateReceiptData() {
        const data = super.generateReceiptData(...arguments);

        if (this.order.isInCompany) {
            data.conditions.code_in = this.order.isInCompany;
            // Invoices requested afterwards from the ticket portal are not GST compliant.
            data.conditions.use_self_invoicing = false;
            data.extra_data.l10n_in_hsn_summary = this.order._prepareL10nInHsnSummary();
            data.extra_data.l10n_in_invoice_name =
                (this.order.to_invoice && this.order.invoiceName) || false;
        }

        return data;
    },
});
