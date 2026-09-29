import { usePlugin } from "@odoo/owl";
import { x2ManyCommands } from "@web/core/orm_plugin";

import { ProductCatalogKanbanRenderer } from "@product/product_catalog/kanban_renderer";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";

export class PurchaseProductCatalogKanbanRenderer extends ProductCatalogKanbanRenderer {
    static template = "PurchaseProductCatalogKanbanRenderer";

    setup() {
        super.setup();
        this.action = usePlugin(ActionPlugin);
    }

    get createProductContext() {
        return {
            default_seller_ids: [
                x2ManyCommands.create(false, {
                    partner_id: this.props.list._config.context.partner_id,
                }),
            ],
        };
    }

    async createProduct() {
        await this.action.doAction(
            {
                type: "ir.actions.act_window",
                res_model: "product.product",
                target: "new",
                views: [[false, "form"]],
                view_mode: "form",
                context: this.createProductContext,
            },
            {
                props: {
                    onSave: async (record, params) => {
                        await this.props.list.model.load();
                        this.props.list.model.useSampleModel = false;
                        this.action.doAction({
                            type: "ir.actions.act_window_close",
                        });
                    },
                },
            }
        );
    }
}
