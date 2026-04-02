import { patch } from "@web/core/utils/patch";
import { PaymentInterface } from "@pos_self/app/components/payment_interface/payment_interface";
import { generateQRCodeDataUrl } from "@point_of_sale/utils";

patch(PaymentInterface.prototype, {
    async startPayment() {
        let order = this.selfOrder.currentOrder;
        const pm = this.selectedPaymentMethod;
        const device = this.selfOrder.config.self_ordering_mode;

        if (!pm || !pm.is_online_payment) {
            return super.startPayment(...arguments);
        } else {
            order = await this.selfOrder.sendDraftOrderToServer();
        }
        this.openOnlinePayment(order, device);
    },
    openOnlinePayment(order, device) {
        const url = this.selfOrder.getOnlinePaymentUrl(order, false);
        this.generateQrcodeImg(url);
    },
    get selectedPaymentIsOnline() {
        const paymentMethods = this.selectedPaymentMethod;
        return paymentMethods && paymentMethods.is_online_payment;
    },
    generateQrcodeImg(url) {
        this.state.qrImage = generateQRCodeDataUrl(url);
    },
});
