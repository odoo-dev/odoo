import { kanbanView } from "@web/views/kanban/kanban_view";
import { registry } from "@web/core/registry";
import { KanbanController } from "@web/views/kanban/kanban_controller";
import { IrAttachmentControllerMixin } from "@mail/views/web/ir_attachment_controller_mixin";


class IrAttachmentKanbanController extends IrAttachmentControllerMixin(KanbanController) {}

export const irAttachmentKanbanView = {
    ...kanbanView,
    Controller: IrAttachmentKanbanController,
};

registry.category("views").add("ir_attachment_kanban", irAttachmentKanbanView);
