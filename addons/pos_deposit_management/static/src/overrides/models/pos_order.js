import { patch } from "@web/core/utils/patch";
import { PosOrder } from "@point_of_sale/app/models/pos_order";

patch(PosOrder.prototype, {
    removeOrderline(line, deep = true) {
        if (line.deposit_parent_line_id) {
            return super.removeOrderline(line.deposit_parent_line_id, deep);
        }

        for (const comboLine of deep ? line.getAllLinesInCombo() : [line]) {
            comboLine.deposit_line_id?.delete();
            comboLine.deposit_line_id = false;
        }

        return super.removeOrderline(line, deep);
    },
});
