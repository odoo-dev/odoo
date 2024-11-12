import { AbstractHeaderAnimated } from "@website/interactions/header_and_menu/abstract_header_animated";

import { registry } from "@web/core/registry";

export class HeaderFixed extends AbstractHeaderAnimated {

    static selector = 'header.o_header_fixed:not(.o_header_sidebar)'

    start() {
        this.dropdownToggleEls = [];
        if (this.hiddenOnScrollEl) {
            this.dropdownToggleEls = this.hiddenOnScrollEl.querySelectorAll(".dropdown-toggle");
            for (const dropdownToggleEl of this.dropdownToggleEls) {
                this.onDropdownShowBound = this.onDropdownShow.bind(this);
                dropdownToggleEl.addEventListener("show.bs.dropdown", this.onDropdownShowBound);
            }
            this.searchbarEl = this.hiddenOnScrollEl
                .querySelector(":not(.modal-content) > .o_searchbar_form");
            if (this.searchbarEl) {
                this.onSearchbarInputBound = this._onSearchbarInput.bind(this);
                this.searchbarEl.addEventListener("input", this.onSearchbarInputBound);
            }
        }
    }

    destroy() {
        for (const dropdownToggleEl of this.dropdownToggleEls) {
            dropdownToggleEl.removeEventListener("show.bs.dropdown", this.onDropdownShowBound);
        }
        if (this.searchbarEl) {
            this.searchbarEl.removeEventListener("input", this.onSearchbarInputBound);
        }
    }
    
    /**
     * @param {integer} scroll
     */
    onScroll(scroll) {
        if (scroll > (this.scrolledPoint + this.topGap)) {
            if (!this.el.classList.contains('o_header_affixed')) {
                this.el.style.setProperty('transform', `translate(0, -${this.topGap}px)`);
                void this.el.offsetWidth; // Force a paint refresh
                this.toggleFixedHeader(true);
            }
        } else {
            this.toggleFixedHeader(false);
            void this.el.offsetWidth; // Force a paint refresh
            this.el.style.removeProperty('transform');
        }

        if (this.hiddenOnScrollEl) {
            let elHeight = 0;
            if (this.fixedHeader && this.searchbarEl?.matches(".show")) {
                this.searchbarEl.querySelector("input").blur();
                elHeight = this.hiddenOnScrollEl.offsetHeight;
            } else {
                elHeight = this.hiddenOnScrollEl.scrollHeight;
            }
            const scrollDelta = window.matchMedia(`(prefers-reduced-motion: reduce)`).matches ?
                scroll : Math.floor(scroll / 4);
            elHeight = Math.max(0, elHeight - scrollDelta);
            this.hiddenOnScrollEl.classList.toggle("hidden", elHeight === 0);
            if (elHeight === 0) {
                this.hiddenOnScrollEl.removeAttribute("style");
            } else {
                // When the page hasn't been scrolled yet, we don't set overflow
                // to hidden. Without this, the dropdowns would be invisible.
                // (e.g., "user menu" dropdown).
                this.hiddenOnScrollEl.style.overflow = this.fixedHeader ? "hidden" : "";
                this.hiddenOnScrollEl.style.height = this.fixedHeader ? `${elHeight}px` : "";
                let elPadding = parseInt(getComputedStyle(this.hiddenOnScrollEl).paddingBlock);
                if (elHeight < elPadding * 2) {
                    const heightDifference = elPadding * 2 - elHeight;
                    elPadding = Math.max(0, elPadding - Math.floor(heightDifference / 2));
                    this.hiddenOnScrollEl.style
                        .setProperty("padding-block", `${elPadding}px`, "important");
                } else {
                    this.hiddenOnScrollEl.style.paddingBlock = "";
                }
                if (this.fixedHeader) {
                    this.updateMainPaddingTop();
                }
            }
            if (!this.fixedHeader && this.dropdownClickedEl) {
                const dropdown = Dropdown.getOrCreateInstance(this.dropdownClickedEl);
                dropdown.show();
                this.dropdownClickedEl = null;
            }
        }
    }

    /**
     * @param {Event} ev
     */
    onDropdownShow(ev) {
        if (this.fixedHeader) {
            ev.preventDefault();
            this.scrollableEl.scrollTo({ top: 0, behavior: "smooth" });
            this.dropdownClickedEl = ev.currentTarget;
        }
    }

    /**
     * @param {Event} ev
     */
    onSearchbarInput(ev) {
        if (this.fixedHeader) {
            this.scrollableEl.scrollTo({ top: 0 });
        }
    }
}

registry.category("website.active_elements").add("website.header_fixed", HeaderFixed);
