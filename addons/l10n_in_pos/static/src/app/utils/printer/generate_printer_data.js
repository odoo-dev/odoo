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
            data.extra_data.l10n_in_hsn_summary = this.order._prepareL10nInHsnSummary();
        }

        return data;
    },
    getQrPaymentData(order) {
        const data = super.getQrPaymentData(order);
        if (data && order.isInCompany) {
            const paymentMethod =
                order.getSelectedPaymentline()?.qrPaymentData?.paymentMethod || {};
            const { upi_identifier = "", _qr_payment_icon_urls = [] } = paymentMethod;
            data.paymentMethod = { upi_identifier, _qr_payment_icon_urls };
        }
        return data;
    },
});
