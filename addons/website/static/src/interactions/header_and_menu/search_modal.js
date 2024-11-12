import { Interaction } from "@website/core/interaction";
import { registry } from "@web/core/registry";

class SearchModal extends Interaction {

    static selector = "#o_search_modal_block #o_search_modal";

    start() {
        this.el.addEventListener("show.bs.modal", this.onSearchModalShow)
        this.el.addEventListener("shown.bs.modal", this.onSearchModalShown)

    }

    destroy() {
        this.el.removeEventListener("show.bs.modal")
        this.el.removeEventListener("shown.bs.modal")
    }

    /**
     * @param {Event} ev
     */
    onSearchModalShow(ev) {
       if (this.editableMode) {
            ev.preventDefault();
        }
    }

    /**
     * @param {Event} ev
     */
    onSearchModalShown(ev) {
        this.el.querySelector(".search-query").focus();
    }
}

registry.category("website.active_elements").add("website.search_modal", SearchModal);
