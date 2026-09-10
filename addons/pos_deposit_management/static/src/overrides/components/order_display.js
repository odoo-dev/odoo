import { patch } from "@web/core/utils/patch";
import { OrderDisplay } from "@point_of_sale/app/components/order_display/order_display";

patch(OrderDisplay.prototype, {
    get comboSortedLines() {
        return this.order.getOrderlines().reduce((acc, line) => {
            if (line.combo_line_ids?.length > 0) {
                acc.push(line);
                if (line.deposit_line_id) {
                    acc.push(line.deposit_line_id);
                }
                for (const comboLine of line.combo_line_ids) {
                    acc.push(comboLine);
                    if (comboLine.deposit_line_id) {
                        acc.push(comboLine.deposit_line_id);
                    }
                }
            } else if (!line.combo_parent_id && !line.deposit_parent_line_id?.combo_parent_id) {
                acc.push(line);
            }
            return acc;
        }, []);
    },
});
