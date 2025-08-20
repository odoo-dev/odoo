import { registry } from "@web/core/registry";
import { graphView } from "@web/views/graph/graph_view";
import { PosSearchModel } from "@point_of_sale/backend/views/search_groupby_hour";

export const posGraphView = {
    ...graphView,
    SearchModel: PosSearchModel,
};

registry.category("views").add("pos_graph", posGraphView);
