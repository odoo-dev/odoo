import { patch } from "@web/core/utils/patch";
import { GeneratePrinterData } from "@point_of_sale/app/utils/printer/generate_printer_data";

/**
 * This class is a JS copy of the class PosOrderReceipt in Python.
 */
patch(GeneratePrinterData.prototype, {
    generateReceiptData() {
        const data = super.generateReceiptData(...arguments);

        if (this.order.isInCompany) {
            data.extra_data.l10n_in_irn = this.order.l10n_in_irn;
            data.image.l10n_in_irn_qr_code = this.generateQrCode(this.order.l10n_in_irn_qr_code_str);
        }

        return data;
    },
});
