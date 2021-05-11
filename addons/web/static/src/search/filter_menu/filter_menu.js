/** @odoo-module **/

import { CustomFilterItem } from "./custom_filter_item";
import { FACET_ICONS } from "../search_utils";
import { SearchComponent } from "../search_component";

const { QWeb } = owl;

export class FilterMenu extends SearchComponent {
    setup() {
        super.setup();
        this.icon = FACET_ICONS.filter;
    }

    /**
     * @returns {Object[]}
     */
    get items() {
        return this.env.searchModel.getSearchItems((searchItem) =>
            ["filter", "dateFilter"].includes(searchItem.type)
        );
    }

    /**
     * @param {CustomEvent} ev
     */
    onFilterSelected(ev) {
        const { itemId, optionId } = ev.detail.payload;
        if (optionId) {
            this.env.searchModel.toggleDateFilter(itemId, optionId);
        } else {
            this.env.searchModel.toggleSearchItem(itemId);
        }
    }
}

FilterMenu.components = { CustomFilterItem };
FilterMenu.template = "wowl.FilterMenu";

QWeb.registerComponent("FilterMenu", FilterMenu);
