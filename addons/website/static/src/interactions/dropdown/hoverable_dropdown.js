import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { SIZES, utils as uiUtils } from "@web/core/ui/ui_service";

export class HoverableDropdown extends Interaction {
    static selector = "header.o_hoverable_dropdown";
    dynamicContent = {
        ".dropdown": {
            "t-on-mouseenter.withTarget": this.onMouseEnter,
            "t-on-mouseleave.withTarget": this.onMouseLeave,
        },
        ".dropdown-menu": {
            "t-att-style": () => ({
                "top": this.isSmall ? "" : "unset",
                "margin-top": this.isSmall ? "" : "0",
            }),
        },
        _window: {
            "t-on-resize": this.onResize,
        },
    };

    setup() {
        this.isSmall = undefined;
        this.dropdownMenuEls = this.el.querySelectorAll(".dropdown-menu");
    }

    start() {
        this.onResize();
    }

    /**
     * @param {Event} dropdownEl
     * @param {boolean} show
     */
    updateDropdownVisibility(dropdownEl, show) {
        const dropdownToggleEl = dropdownEl.querySelector(".dropdown-toggle");
        if (
            this.isSmall
            || !dropdownToggleEl
            || dropdownEl.closest(".o_extra_menu_items")
        ) {
            return;
        }
        const dropdown = Dropdown.getOrCreateInstance(dropdownToggleEl);
        show ? dropdown.show() : dropdown.hide();
    }

    /**
     * @param {Event} ev
     * @param {HTMLElement} targetEl
     */
    onMouseEnter(ev, targetEl) {
        const focusedEl = this.el.ownerDocument.querySelector(":focus")
            || window.frameElement?.ownerDocument.querySelector(":focus");

        // The user must click on the dropdown if he is on mobile (no way to
        // hover) or if the dropdown is the (or in the) extra menu ('+').
        this.updateDropdownVisibility(targetEl, true);

        // Keep the focus on the previously focused element if any, otherwise do
        // not focus the dropdown on hover.
        if (focusedEl) {
            focusedEl.focus({ preventScroll: true });
        } else {
            const dropdownToggleEl = ev.currentTarget.querySelector(".dropdown-toggle");
            if (dropdownToggleEl) {
                dropdownToggleEl.blur();
            }
        }
    }

    /**
     * @param {Event} ev
     * @param {HTMLElement} targetEl
     */
    onMouseLeave(ev, targelEl) {
        this.updateDropdownVisibility(targelEl, false);
    }

    onResize() {
        this.isSmall = uiUtils.getSize() < SIZES.LG;
        for (const dropdownMenuEl of this.dropdownMenuEls) {
            dropdownMenuEl.setAttribute("data-bs-popper", "none");
        }
    }
}

registry
    .category("public.interactions")
    .add("website.hoverable_dropdown", HoverableDropdown);
