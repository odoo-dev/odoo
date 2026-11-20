import { FeedbackScreen } from "@point_of_sale/app/screens/feedback_screen/feedback_screen";
import { patch } from "@web/core/utils/patch";

patch(FeedbackScreen.prototype, {
    isContinueSplitting() {
        // Orders of a table are paid from the floor plan.
        if (this.pos.config.module_pos_restaurant && this.pos.selectedTable) {
            return false;
        }
        return super.isContinueSplitting(...arguments);
    },
});
