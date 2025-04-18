import { Component } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";

export class CustomerFacingQR extends Component {
    static template = "point_of_sale.CustomerFacingQR";
    static components = { Dialog };
    static props = {
        qrCode: String,
        name: String,
        amount: String,
        order: Object,
        close: Function,
    };
}
