import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

export class MegaMenuDropdown extends Interaction {
    static selector = "header#top";
    dynamicContent = {
        ".o_mega_menu_toggle": {
            "t-on-mouseenter.withTarget": this.onHoverMegaMenu,
            "t-on-mousedown.withTarget": this.onTriggerMegaMenu,
            "t-on-keyup.withTarget": this.onTriggerMegaMenu,
        },
        _root: {
            "t-on-mousedown": this.onTriggerExtraMenu, // delegated to ".o_extra_menu_items"
            "t-on-keyup": this.onTriggerExtraMenu, // delegated to ".o_extra_menu_items"
        },
    };

    setup() {
        this.mobileMegaMenuToggleEls = [];
        this.desktopMegaMenuToggleEls = [];
        const megaMenuToggleEls = this.el.querySelectorAll(".o_mega_menu_toggle");
        for (const megaMenuToggleEl of megaMenuToggleEls) {
            if (megaMenuToggleEl.closest(".o_header_mobile")) {
                this.mobileMegaMenuToggleEls.push(megaMenuToggleEl);
            } else {
                this.desktopMegaMenuToggleEls.push(megaMenuToggleEl);
            }
        }
    }

    /**
     * If the mega menu dropdown on which we are clicking/hovering does not have
     * a mega menu (i.e. it is in the other navbar), brings the corresponding
     * mega menu into it.
     *
     * @param {HTMLElement} megaMenuToggleEl
     */
    moveMegaMenu(megaMenuToggleEl) {
        const hasMegaMenu = !!megaMenuToggleEl.parentElement.querySelector(".o_mega_menu");
        if (hasMegaMenu) {
            return;
        }
        const isMobileNavbar = !!megaMenuToggleEl.closest(".o_header_mobile");
        const currentNavbarToggleEls = isMobileNavbar
            ? this.mobileMegaMenuToggleEls
            : this.desktopMegaMenuToggleEls;
        const otherNavbarToggleEls = isMobileNavbar
            ? this.desktopMegaMenuToggleEls
            : this.mobileMegaMenuToggleEls;

        const megaMenuToggleIndex = currentNavbarToggleEls.indexOf(megaMenuToggleEl);
        const previousMegaMenuToggleEl = otherNavbarToggleEls[megaMenuToggleIndex];
        const megaMenuEl = previousMegaMenuToggleEl.parentElement.querySelector(".o_mega_menu");

        // Hiding the dropdown where the mega menu comes from before moving it,
        // so everything is in a consistent state.
        Dropdown.getOrCreateInstance(previousMegaMenuToggleEl).hide();
        megaMenuToggleEl.insertAdjacentElement("afterend", megaMenuEl);
    }

    /**
     * @param {Event} ev
     * @param {HTMLElement} currentTargetEl
     */
    onTriggerMegaMenu(ev, currentTargetEl) {
        // Hoverable menus are clicked in mobile view
        if (
            this.el.classList.contains("o_hoverable_dropdown")
            && !currentTargetEl.closest(".o_header_mobile")
            && ev.type !== "keyup"
        ) {
            return;
        }
        this.moveMegaMenu(currentTargetEl);
    }

    /**
     * @param {Event} ev
     * @param {HTMLElement} currentTargetEl
     */
    onHoverMegaMenu(ev, currentTargetEl) {
        // Hoverable menus are clicked in mobile view
        if (
            !this.el.classList.contains("o_hoverable_dropdown")
            || currentTargetEl.closest(".o_header_mobile")
        ) {
            return;
        }
        this.moveMegaMenu(currentTargetEl);
    }

    /**
     * Delegatation to the ".o_extra_menu_items" element(s)
     * The ".o_extra_menu_items" elements may not be on the page at all time
     *
     * @param {Event} ev
     */
    onTriggerExtraMenu(ev) {
        if (!ev.target.closest(".o_extra_menu_items")) {
            return;
        }
        const megaMenuToggleEls = ev.target
            .closest(".o_extra_menu_items")
            .querySelectorAll(".o_mega_menu_toggle");
        megaMenuToggleEls.forEach(el => this.moveMegaMenu(el));
    }
}

registry
    .category("public.interactions")
    .add("website.mega_menu_dropdown", MegaMenuDropdown);

registry
    .category("public.interactions.edit")
    .add("website.mega_menu_dropdown", {
        Interaction: MegaMenuDropdown,
    });
