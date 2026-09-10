import { patch } from "@web/core/utils/patch";
import { PosOrder } from "@point_of_sale/app/models/pos_order";

patch(PosOrder.prototype, {
    removeOrderline(line, deep = true) {
        if (line.deposit_parent_line_id) {
            const mainLine = line.deposit_parent_line_id;
            line.delete();
            mainLine.deposit_line_id = false;
            return this.removeOrderline(mainLine, deep);
        }

        const linesToProcess = deep ? line.getAllLinesInCombo() : [line];
        for (const mainLine of linesToProcess) {
            if (mainLine.deposit_line_id) {
                mainLine.deposit_line_id.delete();
                mainLine.deposit_line_id = false;
            }
        }
        return super.removeOrderline(line, deep);
    },
});
