import { patch } from "@web/core/utils/patch";
import { PosOrder } from "@point_of_sale/../tests/unit/data/pos_order.data";

patch(PosOrder.prototype, {
    read_pos_data(orderIds, data, config_id) {
        const result = super.read_pos_data(...arguments);
        const courseIds = this.read(orderIds, ["course_ids"], false).flatMap(
            (order) => order.course_ids
        );
        result["restaurant.order.course"] = this.env["restaurant.order.course"].read(
            courseIds,
            this.env["restaurant.order.course"]._load_pos_data_fields(config_id),
            false
        );
        return result;
    },
});
