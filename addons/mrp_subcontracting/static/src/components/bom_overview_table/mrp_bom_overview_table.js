import { patch } from "@web/core/utils/patch";
import { BomOverviewTable } from "@mrp/components/bom_overview_table/mrp_bom_overview_table";

patch(BomOverviewTable.prototype, {
    get isSubcontract() {
        return this._hasSubcontractBom(this.data);
    },

    _hasSubcontractBom(data) {
        if (data.route_type == "subcontract") {
            return true;
        }
        for (const component of data.components || []) {
            if (this._hasSubcontractBom(component)) {
                return true;
            }
        }
        return false;
    },
});
