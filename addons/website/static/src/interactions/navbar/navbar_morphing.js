/** @odoo-module **/
import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";
import { SIZES, utils as uiUtils } from "@web/core/ui/ui_service";

export class NavbarMorphingInteraction extends Interaction {
    static selector = "header#top .navbar-nav";

    dynamicContent = {
        "li.dropdown .dropdown-toggle": {
            "t-on-mouseenter.withTarget": this.onHoverTrigger,
            // Prevent Bootstrap from opening the dropdown on desktop only.
            // On mobile Bootstrap must handle it normally (mega_menu_dropdown.js
            // depends on the dropdown showing to display mega menu content).
            "t-on-show.bs.dropdown": (ev) => {
                if (this.isSmall()) return;
                ev.preventDefault();
                this.onHoverTrigger(ev);
            },
        },
        "li:not(.dropdown)": {
            "t-on-mouseenter": this.handleNavItemMouseenter,
        },
        ".o_navbar_morphing_container": {
            "t-on-mouseleave": this.handleMorphMouseleave,
        },
        _root: {
            "t-on-mouseleave": this.handleNavMouseleave,
            "t-on-click": this.onMorphingContainerClick,
            "t-on-navbar:autohide:adapted": this.onAutoHideAdapted,
        },
        _window: {
            "t-on-resize": this.onWindowResize,
        },
    };

    setup(env) {
        this.navbarMorphingService = this.env.services.navbar_morphing_service;
        this.navbarEl = this.el;
        this.breakpointSize = SIZES.LG;
    }

    isSmall() {
        // console.log('isSmall', uiUtils.getSize() < this.breakpointSize);
        return uiUtils.getSize() < this.breakpointSize;
    }

    onHoverTrigger(ev, toggleEl) {
        if (this.isSmall()) return;
        // toggleEl is the matched a.dropdown-toggle from .withTarget.
        // For the show.bs.dropdown path there is no second arg, so fall back
        // to ev.target (which Bootstrap guarantees is the toggle element itself).
        const toggle = toggleEl ?? ev.target;
        // Cloned toggles inside the morphing container must not trigger hover-open;
        // they are handled exclusively by the click handler (onMorphingContainerClick).
        if (toggle.closest('.o_navbar_morphing_container')) return;
        // Items relocated into the auto-hide overflow dropdown are handled by
        // Bootstrap as a regular nested dropdown; morphing must not intercept them.
        // if (toggle.closest('.o_extra_menu_items')) return;
        const menu = toggle.closest('li.dropdown')?.querySelector(':scope > .dropdown-menu');
        if (menu) {
            this.navbarMorphingService.open(toggle, menu, this.navbarEl);
            this.setLinksActiveState(toggle);
        }
    }

    /**
     * Delegated click handler on the navbar root.
     * Handles back-button and submenu-toggle clicks inside the morphing container.
     */
    onMorphingContainerClick(ev) {
        if (this.isSmall()) return;
        // Only act on clicks that originate inside the morphing container
        if (!ev.target.closest('.o_navbar_morphing_container')) {
            return;
        }
        // Any deliberate click inside the panel switches to click-to-dismiss mode.
        this.navbarMorphingService.lockClick();
        // Back button → go up one level
        if (ev.target.closest('.o_navbar_morphing_back_btn')) {
            ev.preventDefault();
            ev.stopPropagation();
            this.navbarMorphingService.drillBack();
            return;
        }
        // Submenu toggle → drill into the nested menu
        const toggle = ev.target.closest('.dropdown-toggle');
        if (toggle) {
            const parentLi = toggle.closest('li.dropdown');
            const subMenu = parentLi?.querySelector(':scope > .dropdown-menu');
            if (subMenu) {
                ev.preventDefault();
                // Prevent Bootstrap's document-level dropdown handler from firing
                ev.stopPropagation();
                const label = toggle.querySelector('span')?.textContent?.trim()
                    || toggle.textContent.trim();
                this.navbarMorphingService.drillIn(subMenu, label);
            }
        }
    }

    setLinksActiveState(activeLink) {
        this.el.querySelectorAll('li.dropdown .dropdown-toggle')
            .forEach( (link) => {
                link.classList.toggle(
                    'o_enforced_active',
                    activeLink ? link === activeLink : false
                );
            })
    }

    handleNavItemMouseenter(ev) {
        // Ignore list items that are inside the morphing container.
        if (ev.target.closest('.o_navbar_morphing_container')) return;
        this.handleDismiss();
    }

    onWindowResize() {
        this.handleDismiss(true);
    }

    onAutoHideAdapted() {
        this.setLinksActiveState();
        this.navbarMorphingService.reset();
    }

    handleMorphMouseleave(ev) {
        // If moving to a nav-link, do nothing (the nav-link's mouseenter will
        // handle it)
        if (ev.relatedTarget?.closest('.nav-link')) {
            return;
        }
        this.handleDismiss()
    }

    handleNavMouseleave(ev) {
        // Handle leaving the entire navbar
        // Only close if we didn't move into the morphing container
        const isMorphContainer = ev.relatedTarget?.classList.contains('o_navbar_morphing_container');
        const isMorphContainerChild = ev.relatedTarget?.closest('.o_navbar_morphing_container');

        if (!isMorphContainer && !isMorphContainerChild) {
            this.handleDismiss()
        }
    }

    handleDismiss(forceClose) {
        this.setLinksActiveState();
        this.navbarMorphingService.close(forceClose)
    }
}

registry.category("public.interactions").add(
    "website.navbar_morphing_interaction",
    NavbarMorphingInteraction
);