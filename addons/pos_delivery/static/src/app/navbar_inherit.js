/* @odoo-module */

import { Navbar } from "@point_of_sale/app/components/navbar/navbar";
import { patch } from "@web/core/utils/patch";

patch(Navbar.prototype, {
    get showDeliveries() {
        return this.pos.config.iface_pos_delivery && this.pos.config.iface_pos_delivery !== false;
    },
    onClickDeliveries() {
        this.pos.navigate("DeliveryScreen");
    },

    get mainButton() {
        if (this.pos.router.state.current === "DeliveryScreen") {
            return "delivery";
        }
        const screens = ["ProductScreen", "PaymentScreen", "TipScreen"];
        return screens.includes(this.pos.router.state.current) ? "register" : "order";
    },
});
