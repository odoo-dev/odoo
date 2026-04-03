import { registry } from "@web/core/registry";
import { kanbanView } from "@web/views/kanban/kanban_view";

import { ProductImageKanbanRenderer } from "./product_image_kanban_renderer";

export const productImageKanbanView = {
    ...kanbanView,
    Renderer: ProductImageKanbanRenderer,
};

registry.category("views").add("product_kanban_image", productImageKanbanView);
