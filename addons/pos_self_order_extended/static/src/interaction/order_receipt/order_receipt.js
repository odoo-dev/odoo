import { Component } from "@odoo/owl";

export class OrderReceipt extends Component {
    static template = "pos_self_order_extended.OrderReceipt";
    static props = {
        order: { type: Object },
    };
}
