/** @odoo-module **/

import { registry } from "@web/core/registry";
import { kanbanView } from "@web/views/kanban/kanban_view";
import { MrpWorkorderKanbanController } from "./mrp_workorder_kanban_controller";
import { MrpWorkorderKanbanRenderer } from "./mrp_workorder_kanban_renderer";
import { MrpProductionModel } from "../mrp_production_model";

export const mrpWorkorderKanbanView = {
    ...kanbanView,
    Controller: MrpWorkorderKanbanController,
    Renderer: MrpWorkorderKanbanRenderer,
    // reordering work orders reschedules their MOs: reload to sort them by their new MO start
    Model: MrpProductionModel,
    buttonTemplate: "mrp.MrpWorkorderKanbanController.Buttons",
};

registry.category("views").add("mrp_workorder_kanban", mrpWorkorderKanbanView);
