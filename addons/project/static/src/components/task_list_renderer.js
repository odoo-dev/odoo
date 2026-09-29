import { onPatched, usePlugin } from "@odoo/owl";
import { DialogPlugin } from "@web/core/dialog/dialog_plugin";
import { ListRenderer } from "@web/views/list/list_renderer";

export class TaskListRenderer extends ListRenderer {
    setup() {
        super.setup();
        this.dialog = usePlugin(DialogPlugin);
        onPatched(() => {
            this.focusName(this.editedRecord());
        });
    }

    focusName(editedRecord) {
        if (editedRecord?.isNew && !editedRecord.dirty) {
            const col = this.columns.find((c) => c.name === "name");
            this.focusCell(col);
        }
    }
}
