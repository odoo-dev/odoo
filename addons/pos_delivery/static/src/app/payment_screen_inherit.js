/* @odoo-module */

import { patch } from "@web/core/utils/patch";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { DatePickerPopup } from "@point_of_sale/app/components/popups/date_picker_popup/date_picker_popup";
import { _t } from "@web/core/l10n/translation";

patch(PaymentScreen.prototype, {
    async togglePickupDatePicker() {
        if (!this.currentOrder.pickup_date) {
            this.dialog.add(DatePickerPopup, {
                title: _t("Select the pick up date"),
                getPayload: (pickupDate) => {
                    this.currentOrder.pickup_date = pickupDate;
                    this.currentOrder.pos_delivery_type = "pickup";
                    // Clear shipping_date if set
                    this.currentOrder.shipping_date = false;
                },
            });
        } else {
            this.currentOrder.pickup_date = false;
            this.currentOrder.pos_delivery_type = false;
        }
    },
});
