import { registry } from "@web/core/registry";
import { pivotView } from "@web/views/pivot/pivot_view";
import { PosSearchModel } from "@point_of_sale/backend/views/search_groupby_hour";

export const posPivotView = {
    ...pivotView,
    SearchModel: PosSearchModel,
};

registry.category("views").add("pos_pivot", posPivotView);
