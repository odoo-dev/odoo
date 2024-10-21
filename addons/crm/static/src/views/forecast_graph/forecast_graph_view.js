import { ForecastSearchModel } from "@crm/views/forecast_search_model";
import { GraphController } from "@web/views/graph/graph_controller";
import { registry } from "@web/core/registry";

class ForecastGraphSearchModel extends ForecastSearchModel {
    _getIrFilterDescription() {
        this.preparingIrFilterDescription = true;
        const result = super._getIrFilterDescription(...arguments);
        this.preparingIrFilterDescription = false;
        return result;
    }

    _getSearchItemGroupBys(activeItem) {
        const { searchItemId } = activeItem;
        const { context, type } = this.searchItems[searchItemId];
        if (!this.preparingIrFilterDescription && type === "favorite" && context.graph_groupbys) {
            return context.graph_groupbys;
        }
        return super._getSearchItemGroupBys(...arguments);
    }
}

class ForecastGraphController extends GraphController {
    static SearchModel = ForecastGraphSearchModel;
}

registry.category("views_new").add("forecast_graph", ForecastGraphController);
