import { _t } from "@web/core/l10n/translation";
import { KanbanHeader } from "@web/views/kanban/kanban_header";
import { MrpProductionColumnProgress } from "./mrp_production_kanban_column_progress";

export class MrpProductionKanbanHeader extends KanbanHeader {
    static components = {
        ...KanbanHeader.components,
        ColumnProgress: MrpProductionColumnProgress,
    };
    /**
     * Remaining time of the column: when grouped by work center, of the work orders
     * at the column's work center only.
     */
    get groupAggregate() {
        const byWorkcenter = this.group.groupByField?.name === "workcenter_ids";
        const key = String(this.group.value || 0);
        const value = this.props.group.list.records.reduce((sum, record) => {
            const remaining = byWorkcenter
                ? record.data.workcenter_states?.[key]?.remaining_time || 0
                : record.data.remaining_time;
            return sum + Math.max(0, remaining);
        }, 0);
        return { value, title: _t("Total Remaining Time") };
    }
}
