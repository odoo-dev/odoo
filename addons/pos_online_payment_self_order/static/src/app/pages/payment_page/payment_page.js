import { patch } from "@web/core/utils/patch";
import { PaymentInterface } from "@pos_self/app/components/payment_interface/payment_interface";
import { _t } from "@web/core/l10n/translation";

patch(PaymentInterface.prototype, {
    openOnlinePayment(order, device) {
        if (device === "kiosk") {
            super.openOnlinePayment(...arguments);
        } else {
            this.checkAndOpenPaymentPage(order);
        }
    },
    async checkAndOpenPaymentPage(order) {
        if (order.state === "draft") {
            const onlinePaymentUrl = this.selfOrder.getOnlinePaymentUrl(order, true);
            window.open(onlinePaymentUrl, "_self");
        } else {
            this.selfOrder.notification.add(
                _t("The current order cannot be paid (maybe it is already paid)."),
                { type: "danger" }
            );
        }
    },
});
