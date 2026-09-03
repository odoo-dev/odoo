import { patch } from "@web/core/utils/patch";
import { PosOrder } from "@point_of_sale/app/models/pos_order";

patch(PosOrder.prototype, {
    removeOrderline(line) {
        // The linked line is either the deposit line or the main product line
        const linkedLine = line._depositLine || line._mainLine;

        if (linkedLine) {
            // Break the link on both sides first to avoid infinite recursion
            line._depositLine = line._mainLine = undefined;
            linkedLine._depositLine = linkedLine._mainLine = undefined;
        }

        const result = super.removeOrderline(line);

        if (linkedLine && this.lines.includes(linkedLine)) {
            super.removeOrderline(linkedLine);
        }
        return result;
    },
});
