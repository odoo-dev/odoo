import { Component, useState } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { cellProps } from "../pos_list_view";
import { useService } from "@web/core/utils/hooks";

export class PartnerActionCell extends Component {
    static props = cellProps;
    static components = { Dropdown, DropdownItem };
    static template = "point_of_sale.PartnerActionCell";

    setup() {
        super.setup();
        this.pos = usePos();
        this.ui = useState(useService("ui"));
    }

    editDetails() {
        this.pos.editPartner(this.props.record);
    }

    viewOrders() {
        const partnerHasActiveOrders = this.pos
            .getOpenOrders()
            .some((order) => order.partner?.id === this.props.record.id);
        const stateOverride = {
            search: {
                fieldName: "PARTNER",
                searchTerm: this.props.record.name,
                partnerId: this.props.record.id,
            },
            filter: partnerHasActiveOrders ? "" : "SYNCED",
        };
        this.props.close && this.props.close();
        this.pos.navigate("TicketScreen", { stateOverride });
    }
}
