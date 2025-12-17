/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ListRenderer } from "@web/views/list/list_renderer";

// Hide the Activities column only in POS when selecting sale orders:
patch(ListRenderer.prototype, {
    getActiveColumns(list) {
        const cols = super.getActiveColumns(list);
        if (this.props.list?.resModel === "sale.order") {
            return cols.filter((col) => col.name !== "activity_ids");
        }
        return cols;
    },
});
