import { useService } from "@web/core/utils/hooks";
import { KanbanRenderer } from "@web/views/kanban/kanban_renderer";
import { MrpProductionKanbanHeader } from "./mrp_production_kanban_header";

export class MrpProductionKanbanRenderer extends KanbanRenderer {
    static components = {
        ...KanbanRenderer.components,
        KanbanHeader: MrpProductionKanbanHeader,
    };

    setup() {
        super.setup();
        this.orm = useService("orm");
    }

    /**
     * The manufacturing orders are scheduled one after the other by sequence: when grouped by
     * their start date, dropping a card in another column reorders the MOs (their dates then
     * follow), instead of writing the date of the column.
     */
    get isGroupedByStartDate() {
        return this.props.list.isGrouped && this.props.list.groupByField.name === "date_start";
    }

    isMovableField(field) {
        return field.name === "date_start" || super.isMovableField(field);
    }

    async sortRecordDrop(dataRecordId, params) {
        const { element, parent, previous } = params;
        const sourceGroupId = this.props.list.groups.find((group) =>
            group.list.records.some((record) => record.id === dataRecordId)
        )?.id;
        if (!this.isGroupedByStartDate || !parent || parent.dataset.id === sourceGroupId) {
            return super.sortRecordDrop(dataRecordId, params);
        }
        parent.classList.remove("o_kanban_hover");
        const recordIds = this.multiDragRecordIds || [dataRecordId];
        // all the loaded MOs, in their displayed (sequence) order
        const ordered = this.props.list.groups.flatMap((group) => group.list.records);
        const moved = ordered.filter((record) => recordIds.includes(record.id));
        const others = ordered.filter((record) => !recordIds.includes(record.id));
        let refElement = previous;
        while (refElement && (!refElement.dataset.id || recordIds.includes(refElement.dataset.id))) {
            refElement = refElement.previousElementSibling;
        }
        let insertIndex;
        if (refElement) {
            insertIndex = others.findIndex((record) => record.id === refElement.dataset.id) + 1;
        } else {
            // dropped first in its column: after the last MO of the previous columns
            const targetGroupIndex = this.props.list.groups.findIndex((g) => g.id === parent.dataset.id);
            insertIndex = this.props.list.groups
                .slice(0, targetGroupIndex)
                .reduce((count, group) => count + group.list.records.filter((r) => !recordIds.includes(r.id)).length, 0);
        }
        const newOrder = [...others.slice(0, insertIndex), ...moved, ...others.slice(insertIndex)];
        // only the MOs between the old and the new positions are resequenced
        const indexes = moved.flatMap((record) => [ordered.indexOf(record), newOrder.indexOf(record)]);
        const toResequence = newOrder.slice(Math.min(...indexes), Math.max(...indexes) + 1);
        recordIds.forEach((id) => this.toggleProcessing(id, true));
        try {
            await this.orm.webResequence(
                "mrp.production",
                toResequence.map((record) => record.resId),
                { field_name: "sequence", specification: {}, context: this.props.list.context }
            );
        } finally {
            recordIds.forEach((id) => this.toggleProcessing(id, false));
        }
        await this.props.list.model.load();
    }
}
