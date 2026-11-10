import { registry } from "@web/core/registry";
import { listView } from "@web/views/list/list_view";
import { StockLocationListModel } from "./stock_location_list_model";
import { StockLocationListRenderer } from "./stock_location_list_renderer";

export const StockLocationListView = {
    ...listView,
    Model: StockLocationListModel,
    Renderer: StockLocationListRenderer,
};

registry.category("views").add("stock_location_list_view", StockLocationListView);
