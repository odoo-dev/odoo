import { Dialog } from "@web/core/dialog/dialog";
import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { useService } from "@web/core/utils/hooks";

export class productHsnDialog extends Component {
    static components = { Dialog };
    static template = "l10n_in_pos.productHsnDialog";
    static props = {
        close: Function,
    };

    setup() {
        this.pos = usePos();
        this.action = useService("action");
    }

    redirect() {
        this.props.close();

        const domain = [
            ["available_in_pos", "=", true],
            ["l10n_in_hsn_code", "=", false],
            ["taxes_id", "!=", false],
        ];

        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "product.template",
            domain: domain,
            views: [[false, "list"]],
            target: "current",
        });
        return;
    }

    onClose() {
        this.props.close();
    }
}
