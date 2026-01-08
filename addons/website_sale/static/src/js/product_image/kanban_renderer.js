import { patch } from "@web/core/utils/patch";
import { KanbanRenderer } from "@web/views/kanban/kanban_renderer";

patch(KanbanRenderer.prototype, {
    get resequenceOrderIndex() {
        return this.props.list.resModel === 'product.image' ? 1 : super.resequenceOrderIndex;
    }
});
