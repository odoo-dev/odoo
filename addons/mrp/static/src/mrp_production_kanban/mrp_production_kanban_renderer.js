import { KanbanRecord } from "@web/views/kanban/kanban_record";
import { KanbanRenderer } from "@web/views/kanban/kanban_renderer";
import { MrpProductionKanbanHeader } from "./mrp_production_kanban_header";

export class MrpProductionKanbanRecord extends KanbanRecord {
    get renderingContext() {
        // lets cards adapt to the grouping, e.g. not repeat the work center of their column
        return {
            ...super.renderingContext,
            group_by_field: this.props.groupByField?.name || false,
        };
    }
}

export class MrpProductionKanbanRenderer extends KanbanRenderer {
    static components = {
        ...KanbanRenderer.components,
        KanbanHeader: MrpProductionKanbanHeader,
        KanbanRecord: MrpProductionKanbanRecord,
    };
}
