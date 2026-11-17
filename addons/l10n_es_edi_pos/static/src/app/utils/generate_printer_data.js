import { GeneratePrinterData } from "@point_of_sale/app/utils/printer/generate_printer_data";
import { patch } from "@web/core/utils/patch";

const FISCAL_MODES_SIMPLIFIED_SEQUENCE = ["sii", "verifactu"];

/**
 * Mirror of `pos.order.receipt.order_receipt_generate_data` in l10n_es_edi_pos.
 */
patch(GeneratePrinterData.prototype, {
    generateReceiptData() {
        const data = super.generateReceiptData(...arguments);
        const fiscalMode = this.order.l10nEsPosFiscalMode;
        if (!fiscalMode) {
            return data;
        }

        const simplifiedPartnerId = this.config._l10n_es_pos_simplified_partner_id;
        if (simplifiedPartnerId && this.order.partner_id?.id === simplifiedPartnerId) {
            data.partner = false;
        }

        if (FISCAL_MODES_SIMPLIFIED_SEQUENCE.includes(fiscalMode)) {
            const invoiceName = this.order.l10nEsPosInvoiceName;
            data.conditions.l10n_es_pos_invoice_name = Boolean(invoiceName);
            data.conditions.l10n_es_pos_simplified_invoice = this.order.l10nEsPosIsSimplifiedInvoice;
            data.extra_data.l10n_es_pos_invoice_name = invoiceName;
        }
        return data;
    },
});