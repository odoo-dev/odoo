import { Component } from "@odoo/owl";
import { cellProps } from "../pos_list_view";

export class PartnerInfoCell extends Component {
    static props = cellProps;
    static template = "point_of_sale.PartnerInfoCell";
}
