import { PosOrderline } from "@point_of_sale/app/models/pos_order_line";
import { patch } from "@web/core/utils/patch";

patch(PosOrderline.prototype, {
    setup() {
        super.setup(...arguments);
        this.note = this.note || "";
    },
    //@override
    clone() {
        const orderline = super.clone(...arguments);
        orderline.note = this.note;
        return orderline;
    },
    canBeMergedWith(orderline) {
        if (this.course_id) {
            if (this.course_id.uuid !== orderline.course_id?.uuid) {
                return false;
            }
        } else if (orderline.course_id?.uuid) {
            // In case of order merge
            return false;
        }
        return super.canBeMergedWith(orderline);
    },
});
