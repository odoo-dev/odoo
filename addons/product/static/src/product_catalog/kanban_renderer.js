import { usePlugin } from "@odoo/owl";
import { KanbanRenderer } from "@web/views/kanban/kanban_renderer";

import { ProductCatalogKanbanRecord } from "./kanban_record";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";

export class ProductCatalogKanbanRenderer extends KanbanRenderer {
    static template = "ProductCatalogKanbanRenderer";
    static components = {
        ...KanbanRenderer.components,
        KanbanRecord: ProductCatalogKanbanRecord,
    };

    setup() {
        super.setup();
        this.action = usePlugin(ActionPlugin);
    }

    get createProductContext() {
        return {};
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
                onClose: () => this.props.list.model.load(),
            }
        );
    }
}
