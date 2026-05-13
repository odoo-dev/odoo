import { patch } from "@web/core/utils/patch";
import { BomOverviewLine } from "@mrp/components/bom_overview_line/mrp_bom_overview_line";

patch(BomOverviewLine, {
    props: {
        ...BomOverviewLine.props,
        hasSubcontractCol: { type: Boolean, optional: true },
    },
});

patch(BomOverviewLine.prototype, {
    get isSubcontract() {
        if (this.data.type == "bom") {
            return this.data.route_type == "subcontract";
        }
        return this.data.subcontract_qty_available !== undefined;
    },

    get hasSubcontractCol() {
        return this.props.hasSubcontractCol ?? true;
    },
});
