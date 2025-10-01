import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { OrderReceiptHeader } from "./order_receipt_header/order_receipt_header";
import { OrderDisplay } from "../order_display/order_display";
import { Orderline } from "../orderline/orderline";
import { formatCurrency } from "@web/core/currency";

export class POSOrderReceipt extends Component {
    static components = { OrderReceiptHeader, OrderDisplay, Orderline };
    static template = "point_of_sale.POSOrderReceipt";
    setup() {
        this.data = this.props.data || this.props.action.params.data;
    }
    formatOrderCurrency(val) {
        return formatCurrency(val, this.data.order.currency.id);
    }
}

registry.category("actions").add("pos_order_receipt", POSOrderReceipt);
