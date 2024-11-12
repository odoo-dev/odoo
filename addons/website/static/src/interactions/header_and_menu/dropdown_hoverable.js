import { Animation } from "@website/core/animation";
import { registry } from "@web/core/registry";

import { SIZES, utils as uiUtils } from "@web/core/ui/ui_service";

class HoverableDropdown extends Animation { // Is Animation really useful here ?

    static selector = 'header.o_hoverable_dropdown'
    static dynamicContent = {
        ".dropdown": {
            "t-on-mouseenter": "onEnter",
            "t-on-mouseleave": "onLeave",
        },
        "_window": {
            "t-on-resize": "onResize",
        },
    }

    setup() {
        this.dropdownMenus = this.el.querySelectorAll('.dropdown-menu');
        this.dropdownToggles = this.el.querySelectorAll('.dropdown-toggle');
        this.onResize();
    }

    /**
     * @param {Event} ev
     * @param {boolean} [show = true]
     */
    updateDropdownVisibility(ev, show = true) {
        if (
            uiUtils.getSize() < SIZES.LG
            || ev.currentTarget.closest('.o_extra_menu_items')
        ) {
            return;
        }
        const dropdownToggleEl = ev.currentTarget.querySelector('.dropdown-toggle');
        if (!dropdownToggleEl) {
            return;
        }
        const dropdown = Dropdown.getOrCreateInstance(dropdownToggleEl);
        show ? dropdown.show() : dropdown.hide();
    }

    /**
     * @param {Event} ev
     */
    onEnter(ev) {
        if (
            this.editableMode 
            && this.el.querySelector('.dropdown-toggle.show')
        ) {
            return;
        }
        const focusedEl = this.el.ownerDocument.querySelector(":focus")
            || window.frameElement && window.frameElement.ownerDocument.querySelector(":focus");
        this.updateDropdownVisibility(ev, true);
        if (focusedEl) {
            focusedEl.focus({preventScroll: true});
        } else {
            const dropdownToggleEl = ev.currentTarget.querySelector(".dropdown-toggle");
            if (dropdownToggleEl) {
                dropdownToggleEl.blur();
            }
        }
    }

    /**
     * @param {Event} ev
     */
    onLeave(ev) {
        if (this.editableMode) {
            return;
        }
        this.updateDropdownVisibility(ev, false);
    }

    /**
     * @param {Event} ev
     */
    onResize(ev) {
        for (const dropdownMenu of this.dropdownMenus) {
            dropdownMenu.style.setProperty('data-bs-popper', 'none');
        }
        if (uiUtils.getSize() >= SIZES.LG) {
            for (const dropdownMenu of this.dropdownMenus) {
                dropdownMenu.style.setProperty('margin-top', '0');
                dropdownMenu.style.setProperty('top', 'unset');
            }
        } else {
            for (const dropdownMenu of this.dropdownMenus) {
                dropdownMenu.style.removeProperty('margin-top');
                dropdownMenu.style.removeProperty('top');
            }
        }
    }
}

registry.category("website.active_elements").add("website.hoverable_dropdown", HoverableDropdown);
