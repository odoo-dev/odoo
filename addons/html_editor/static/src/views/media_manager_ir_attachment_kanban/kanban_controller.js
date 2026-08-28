import { KanbanController, kanbanControllerProps } from "@web/views/kanban/kanban_controller";
import { t, useProps } from "@odoo/owl";

export const MediaManagerKanbanControllerProps = {
    ...kanbanControllerProps,
    baseResModel: t.string(),
    baseResId: t.number().optional(),
};
export class MediaManagerKanbanController extends KanbanController {
    static template = "ir.attachment.MediaManagerKanbanView";
    props = useProps(MediaManagerKanbanControllerProps);

    setup() {
        console.warn("MediaManagerKanbanController :: setup()");
        console.log("this", this);
        console.log("props", this.props);
        super.setup();
    }

    async onSelectionChanged() {
        if (this.props.onSelectionChanged) {
            const resIds = await this.model.root.getResIds(true);
            console.log("resIds", resIds);
            const records = this.model.root.records
                .filter((record) => resIds.includes(record.data.id))
                .map((rec) => rec.data);
            console.log("records", JSON.parse(JSON.stringify(records)));
            this.props.onSelectionChanged(records);
        }
    }
}
