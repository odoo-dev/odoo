import { Component } from "@odoo/owl";

export class MissingRequireds extends Component {
    static template = "pos_self_order.MissingRequireds";
    static props = ["scrollUpToRequired"];
}
