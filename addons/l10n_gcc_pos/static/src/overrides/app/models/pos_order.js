/* eslint { "no-restricted-syntax": [ "error", {
    "selector": "MemberExpression[object.type=ThisExpression][property.name=pos]",
    "message": "Using this.pos in models is deprecated and about to be removed, for any question ask PoS team." }]}*/

import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    export_for_printing() {
        return {
            ...super.export_for_printing(),
            is_gcc_country: ["SA", "AE", "BH", "OM", "QA", "KW"].includes(
                this.company.country_id?.code
            ),
        };
    },
});
