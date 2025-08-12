import { patch } from "@web/core/utils/patch";
import { PosOrder } from "@point_of_sale/app/models/pos_order";

patch(PosOrder.prototype, {

    getCustomerDisplayData() {
        const data = super.getCustomerDisplayData();
        const selectedPaymentLine = this.get_selected_paymentline();

        if (selectedPaymentLine && selectedPaymentLine.qrPaymentData) {

            // Add qrCodeMethod to qrPaymentData to use in qr customer display
            data.qrPaymentData.qrCodeMethod = selectedPaymentLine.payment_method_id.qr_code_method || '';
            data.qrPaymentData.currency_name = this.currency.name;
        }
        return data;
    },

    export_for_printing(baseUrl, headerData) {
        // Export order data for printing on bill and receipt

        const result = super.export_for_printing(baseUrl, headerData);
        return {
            ...result,
            payway_qr_image: this.payway_qr_image || "",
            state: this.state,
        }
    },
});