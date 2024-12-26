import { HoverableDropdown } from "@website/interactions/dropdown/hoverable_dropdown";
import { registry } from "@web/core/registry";

const HoverableDropdownEdit = I => class extends I {
    /**
     * @param {Event} ev
     * @param {HTMLElement} targetEl
     */
    onMouseEnter(ev, targetEl) {
        if (this.el.querySelector(".dropdown-toggle.show")) {
            return;
        } else {
            super.onMouseEnter(ev, targetEl);
        }
    }

    /**
     * @param {Event} ev
     * @param {HTMLElement} targelEl
     */
    onMouseLeave(ev, targelEl) { }
};

registry
    .category("public.interactions.edit")
    .add("website.hoverable_dropdown", {
        Interaction: HoverableDropdown,
        mixin: HoverableDropdownEdit
    });
