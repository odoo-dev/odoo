import { CartPage } from "@pos_self_order/app/pages/cart_page/cart_page";
import { patch } from "@web/core/utils/patch";
import { WhatsappNumberPopup } from "./whatsapp_number_popup";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { BACKSPACE, getButtons, ZERO, EMPTY } from "@point_of_sale/app/components/numpad/numpad";

patch(CartPage.prototype, {
    async pay() {
        const type = this.selfOrder.config.self_ordering_mode;
        if (type === "kiosk") {
            const result = await makeAwaitable(this.dialog, WhatsappNumberPopup, {
                title: "Whatsapp number",
                placeholder: "Enter whatsapp number eg. 9999999999",
                isValid: (value) => value && value.length == 10 && !isNaN(value),
                confirmButtonLabel: "Confirm",
                buttons: getButtons([EMPTY, ZERO, BACKSPACE]),
            });
            this.selfOrder.currentOrder.contact_number = result;
        }
        return await super.pay(...arguments);
    },
});
