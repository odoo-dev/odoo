/** @odoo-module **/

import { registry } from "@web/core/registry";

import { kanbanView } from "@web/views/kanban/kanban_view";
import { ProductDocumentKanbanController } from "@product/js/product_document_kanban/product_document_kanban_controller";
import { ProductDocumentKanbanRenderer } from "@product/js/product_document_kanban/product_document_kanban_renderer";
import { ProductDocumentKanbanRecord } from "@product/js/product_document_kanban/product_document_kanban_record";

export const productDocumentKanbanView = {
    ...kanbanView,
    Controller: ProductDocumentKanbanController,
    Renderer: ProductDocumentKanbanRenderer,
    RecordLegacy: ProductDocumentKanbanRecord,
    buttonTemplate: "product.ProductDocumentKanbanView.Buttons",
};

registry.category("views").add("product_documents_kanban", productDocumentKanbanView);
