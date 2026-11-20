import { KanbanController, kanbanControllerProps } from "@web/views/kanban/kanban_controller";
import { t, useProps } from "@odoo/owl";

export const MediaManagerKanbanControllerProps = {
    ...kanbanControllerProps,
    baseResModel: t.string(),
    baseResId: t.number().optional(),
    filters: t.array().optional(),
};
export class MediaManagerKanbanController extends KanbanController {
    static template = "ir.attachment.MediaManagerKanbanView";
    props = useProps(MediaManagerKanbanControllerProps);

    async onSelectionChanged() {
        if (this.props.onSelectionChanged) {
            const resIds = await this.model.root.getResIds(true);
            const records = this.model.root.records
                .filter((record) => resIds.includes(record.data.id))
                .map((rec) => rec.data);
            this.props.onSelectionChanged(resIds, records);
        }
    }
}
