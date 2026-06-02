import { patch } from "@web/core/utils/patch";
import { StockPickFrom } from "@stock/widgets/stock_pick_from";

patch(StockPickFrom.prototype, {
    get lotId() {
        const visual_lot_name = this.props.record.data.visual_lot_name;
        if (visual_lot_name) {
            return { display_name: visual_lot_name };
        }
        return super.lotId;
    },
});
