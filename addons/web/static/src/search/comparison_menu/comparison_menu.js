/** @odoo-module **/

import { FACET_ICONS } from "../search_utils";
import { SearchComponent } from "../search_component";

const { QWeb } = owl;

export class ComparisonMenu extends SearchComponent {
    setup() {
        super.setup();
        this.icon = FACET_ICONS.comparison;
    }

    /**
     * @returns {Object[]}
     */
    get items() {
        return this.env.searchModel.getSearchItems(
            (searchItem) => searchItem.type === "comparison"
        );
    }

    /**
     * @param {CustomEvent}
     */
    onComparisonSelected(ev) {
        const { itemId } = ev.detail.payload;
        this.env.searchModel.toggleSearchItem(itemId);
    }
}

ComparisonMenu.template = "web.ComparisonMenu";

QWeb.registerComponent("ComparisonMenu", ComparisonMenu);
