import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import {
    BomOverviewControlPanel,
} from "@mrp/components/bom_overview_control_panel/mrp_bom_overview_control_panel";


patch(BomOverviewControlPanel.prototype, {
    async manufactureFromBoM() {
        if (this.props.actionName === 'Buy') {
            const action = {
                res_model: "purchase.order",
                name: "Purchase Orders",
                type: "ir.actions.act_window",
                views: [[false, "form"]],
                target: "current",
            };
            return this.action.doAction(action);
        }
        return super.manufactureFromBoM(...arguments);
    },
});