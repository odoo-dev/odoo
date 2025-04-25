import { registry } from "@web/core/registry";
import { listView } from "@web/views/list/list_view";

class TourListController extends listView.Controller {
    get staticControlPanelButtons() {
        return {
            ...super.staticControlPanelButtons,
            record: {
                template: "web_tour.TourListController.Buttons.Record",
            },
        };
    }
}

registry.category("views").add("tour_list", {
    ...listView,
    Controller: TourListController,
});
