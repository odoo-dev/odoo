import { SearchModal } from "@website/interactions/search_modal";
import { registry } from "@web/core/registry";

class SearchModalEdit extends SearchModal {

    /**
     * @param {Event} ev
     */
    onSearchModalShow(ev) {
        ev.preventDefault();
    }

}

registry
    .category("website.edit_active_elements")
    .add("website.search_modal", SearchModalEdit);
