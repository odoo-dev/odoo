import { registry } from "@web/core/registry";
import { kanbanView } from "@web/views/kanban/kanban_view";
import { MrpProductionKanbanRenderer } from "./mrp_production_kanban_renderer";
import { MrpProductionModel } from "../views/mrp_production_model";

export const mrpProductionKanbanView = {
    ...kanbanView,
    Renderer: MrpProductionKanbanRenderer,
    Model: MrpProductionModel,
};

registry.category("views").add("mrp_production_kanban", mrpProductionKanbanView);
