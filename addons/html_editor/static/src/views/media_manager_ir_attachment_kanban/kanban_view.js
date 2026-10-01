import { registry } from "@web/core/registry";
import { kanbanView } from "@web/views/kanban/kanban_view";
import { MediaManagerKanbanRenderer } from "./kanban_renderer";
import { MediaManagerKanbanController } from "./kanban_controller";

export const mediaManagerKanbanView = {
    ...kanbanView,
    Renderer: MediaManagerKanbanRenderer,
    Controller: MediaManagerKanbanController,
};

registry.category("views").add("media_manager_kanban", mediaManagerKanbanView);
