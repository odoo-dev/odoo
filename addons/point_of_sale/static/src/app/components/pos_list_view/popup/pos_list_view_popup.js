import { Dialog } from "@web/core/dialog/dialog";
import { useService } from "@web/core/utils/hooks";
import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { PosListView } from "../../pos_list_view/pos_list_view";

export class PosListViewPopup extends Component {
    static components = { Dialog, PosListView };
    static template = "point_of_sale.PosListViewPopup";
    static props = {
        ...PosListView.props,
        close: { type: Function },
        getPayload: { type: Function },
    };

    setup() {
        this.pos = usePos();
        this.dialog = useService("dialog");
    }

    get listProps() {
        const props = Object.entries(this.props).reduce((acc, [key, val]) => {
            if (key in PosListView.props) {
                acc[key] = val;
            }
            return acc;
        }, {});

        props.close = this.props.close;
        props.onClick = (record) => {
            this.props.getPayload(record);
            this.props.close();
        };

        return props;
    }
}
