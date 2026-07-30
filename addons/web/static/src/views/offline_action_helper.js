import { Component, onWillStart, plugin } from "@odoo/owl";
import { OfflinePlugin } from "@web/core/offline/offline_plugin";
import { useSearchModel } from "@web/search/search_model";

export class OfflineActionHelper extends Component {
    static template = "web.OfflineActionHelper";

    searchModel = useSearchModel();

    setup() {
        const offlinePlugin = plugin(OfflinePlugin);

        this.searches = null;
        onWillStart(async () => {
            const { actionId, viewType } = this.env.config;
            this.searches = await offlinePlugin.getAvailableSearches(actionId, viewType);
        });
    }

    onResetFilters() {
        this.searchModel.applySearch(this.searches[0]);
    }
}
