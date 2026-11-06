import { registry } from "@web/core/registry";
import { KanbanRecord } from "@web/views/kanban/kanban_record";
import { KanbanRenderer } from "@web/views/kanban/kanban_renderer";
import { kanbanView } from "@web/views/kanban/kanban_view";

/**
 * Gives each update the class of its status, whose color replaces the one of the
 * color list the status computes.
 */
export class ProjectUpdateKanbanRecord extends KanbanRecord {
    getCardClasses() {
        return `${super.getCardClasses()} o_project_update_${this.props.record.data.status}`;
    }
}

export class ProjectUpdateKanbanRenderer extends KanbanRenderer {
    static components = {
        ...KanbanRenderer.components,
        KanbanRecord: ProjectUpdateKanbanRecord,
    };
}

export const projectUpdateKanbanView = {
    ...kanbanView,
    Renderer: ProjectUpdateKanbanRenderer,
};

registry.category("views").add("project_update_kanban", projectUpdateKanbanView);
