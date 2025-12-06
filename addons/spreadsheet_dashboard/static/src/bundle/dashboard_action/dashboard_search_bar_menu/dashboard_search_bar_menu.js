import { FilterValuesList } from "@spreadsheet/global_filters/components/filter_values_list/filter_values_list";
import { FACET_ICONS } from "@web/search/utils/misc";
import { CheckboxItem } from "@web/core/dropdown/checkbox_item";
import { DashboardCustomFavoriteItem } from "./dashboard_custom_favorite_item";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

export class DashboardSearchBarMenu extends FilterValuesList {
    static template = "spreadsheet_dashboard.DashboardSearchBarMenu";
    static components = {
        ...FilterValuesList.components,
        CheckboxItem,
        DashboardCustomFavoriteItem,
        DropdownItem,
    };
    setup() {
        super.setup();
        this.facet_icons = FACET_ICONS;
        this.actionService = useService("action");
        this.loader = useService("spreadsheet_dashboard_loader");
        this.searchModel = this.loader.getDashboard(this.loader.activeDashboardId).searchModel;
        this.sharedFavoritesExpanded = useState({ value: false });
    }

    get favorites() {
        return this.searchModel.getFavoriteList((item) => item.userIds.length === 1);
    }

    get sharedFavorites() {
        const sharedFavorites = this.searchModel.getFavoriteList(
            (item) => item.userIds.length !== 1
        );

        if (sharedFavorites.length <= 4 || this.sharedFavoritesExpanded.value) {
            this.sharedFavoritesExpanded.value = true;
        } else {
            sharedFavorites.length = 3;
        }
        return sharedFavorites;
    }

    onConfirm() {
        super.onConfirm();
        this.searchModel.handleManualFilterConfirm(this.state.filtersAndValues);
    }

    onFavoriteSelected(itemId) {
        this.state.filtersAndValues = this.searchModel.toggleFavorite(itemId);
    }

    editFavorite(itemId) {
        this.actionService.doAction({
            type: "ir.actions.act_window",
            res_model: "spreadsheet.dashboard.favorite.filters",
            views: [[false, "form"]],
            context: {
                form_view_ref:
                    "spreadsheet_dashboard.spreadsheet_dashboard_favorite_filters_view_edit_form",
            },
            res_id: itemId,
        });
    }
}
