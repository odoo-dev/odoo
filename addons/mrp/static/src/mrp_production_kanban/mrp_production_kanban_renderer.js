import { KanbanRecord } from "@web/views/kanban/kanban_record";
import { KanbanRenderer } from "@web/views/kanban/kanban_renderer";
import { MrpProductionKanbanHeader } from "./mrp_production_kanban_header";

export class MrpProductionKanbanRecord extends KanbanRecord {
    getCardClasses() {
        const { record } = this.props;
        let classes = super.getCardClasses();
        if (record.data.is_operations_done) {
            // all the operations of the order are done: it is ready to be closed
            classes += " o_mrp_operations_done bg-success-subtle";
        } else if (this.openWorkcenterCount > 1) {
            // at several work centers at once: the same color on all its cards
            classes += ` o_kanban_record_colored o_kanban_color_${record.resId % 10}`;
        }
        return classes;
    }

    /** number of work centers the order has work orders to process at */
    get openWorkcenterCount() {
        const states = this.props.record.data.workcenter_states || {};
        return Object.keys(states).filter((key) => key !== "0").length;
    }

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
