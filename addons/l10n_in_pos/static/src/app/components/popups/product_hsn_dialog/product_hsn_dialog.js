import { Dialog } from "@web/core/dialog/dialog";
import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";

export class productHsnDialog extends Component {
    static components = { Dialog };
    static template = "l10n_in_pos.productHsnDialog";
    static props = {
        close: Function,
    };

    setup() {
        this.pos = usePos();
    }

    redirect() {
        return this.actionService.doAction({
            type: "ir.actions.act_window",
            res_model: this.data.link_model,
            res_id: this.data.link_id,
            views: [[false, "form"]],
            target: "current",
            context: {
                active_id: this.data.link_id,
            },
        });
    }

    onClose() {
        this.props.close();
    }
}
