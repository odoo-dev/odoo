import { registry } from "@web/core/registry";
import { kanbanView } from "@web/views/kanban/kanban_view";
import { HrFleetKanbanController } from "@hr_fleet/views/hr_fleet_kanban/hr_fleet_kanban_controller";

export const hrFleetKanbanView = {
    ...kanbanView,
    Controller: HrFleetKanbanController,
};
registry.category("views").add("hr_fleet_kanban_view", hrFleetKanbanView);
