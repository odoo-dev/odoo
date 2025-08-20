import { registry } from "@web/core/registry";
import { kanbanView } from "@web/views/kanban/kanban_view";
import { PosSearchModel } from "@point_of_sale/backend/views/search_groupby_hour";

export const posKanbanView = {
    ...kanbanView,
    SearchModel: PosSearchModel,
};

registry.category("views").add("pos_kanban", posKanbanView);
