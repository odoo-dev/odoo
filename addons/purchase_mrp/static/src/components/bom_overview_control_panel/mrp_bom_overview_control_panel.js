import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { x2ManyCommands } from "@web/core/orm_plugin";
import { BomOverviewControlPanel } from "@mrp/components/bom_overview_control_panel/mrp_bom_overview_control_panel";

patch(BomOverviewControlPanel.prototype, {
    async actionFromBoM() {
        if (this.props.data.route_name === "Buy") {
            return this.action.doAction({
                res_model: "purchase.order",
                name: _t("Request for Quotation"),
                type: "ir.actions.act_window",
                views: [[false, "form"]],
                target: "current",
                context: {
                    default_partner_id:  this.props.data.partner_id,
                    default_order_line: [
                        x2ManyCommands.create(false ,{
                            product_id: this.props.data.product_id,
                            product_qty: this.props.bomQuantity,
                        }),
                    ],
                },
            });
        }
        return super.actionFromBoM();
    }
    },
);
