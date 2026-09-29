import { Component, usePlugin } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { UIPlugin } from "@web/core/ui/ui_plugin";

// Previously UsernameWidget
export class CashierName extends Component {
    static template = "point_of_sale.CashierName";

    setup() {
        this.pos = usePos();
        this.ui = usePlugin(UIPlugin);
    }
    get avatar() {
        const user_id = this.pos.accessRight.cashierUserId;
        const id = user_id ? user_id : -1;
        return `/web/image/res.users/${id}/avatar_128`;
    }
    get cssClass() {
        return { "not-clickable pe-none": true };
    }
}
