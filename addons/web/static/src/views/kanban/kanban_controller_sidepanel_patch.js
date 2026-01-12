/** @odoo-module **/

import { KanbanController } from "@web/views/kanban/kanban_controller";
import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";

patch(KanbanController.prototype, {
    setup() {
        super.setup(...arguments);
        this.sidepanel = useService("sidepanel");
    },

    async openRecord(record, mode) {
        if (!this.isAlreadyOpened(record) && !this.sidepanel.state.isFolded && !this.sidepanel.state.isPinned) {
            this.sidepanel.open(
                this.props.resModel,
                record.resId,
                this.props.context,
                false
            );
        } else {
            return super.openRecord(...arguments);
        }
    },

    isAlreadyOpened(record) {
        if (!this.sidepanel.state.resModel || !this.sidepanel.state.resId) {
            return false;
        } else if (this.sidepanel.state.resModel === this.props.resModel && this.sidepanel.state.resId === record.resId) {
            return true;
        } else {
            return false;
        }
    }
});
