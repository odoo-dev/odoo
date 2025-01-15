import { BaseHeader } from "@website/interactions/header/base_header";
import { registry } from "@web/core/registry";

export class BaseHeaderSpecial extends BaseHeader {
    dynamicSelectors = {
        ...this.dynamicSelectors,
        _dropdown: () => this.hideEl?.querySelector(".dropdown-toggle"),
        _searchbar: () => this.searchbarEl,
    };
    dynamicContent = {
        ...this.dynamicContent,
        _dropdown: {
            "t-on-show.bs.dropdown": this.onDropdownShow,
        },
        _searchbar: {
            "t-on-input": this.onSearchbarInput,
        },
    };

    setup() {
        super.setup();
        this.isAnimated = false;

        this.position = 0;
        this.checkpoint = 0;
        this.scrollOffset = 200;
        this.scrollingDownward = true;

        this.dropdownClickedEl = null;

        if (this.hideEl) {
            this.searchbarEl = this.hideEl.querySelector(":not(.modal-content) > .o_searchbar_form");
            this.isHideElTop = this.hideEl.matches(":first-child");
            if (!this.isHideElTop) {
                // If the hideEl is not the top element, we need to set the 
                // z-index in order to hide it behind the top element (showEl).
                // The z-index property is not active with position: static, 
                // which is the default value.
                const showEl = this.hideEl.previousElementSibling;
                showEl.style.position = "relative";
                showEl.style.setProperty("z-index", 1);
                this.hideEl.style.position = "relative";
                this.hideEl.style.setProperty("z-index", 0);
            }
        }
    }

    onDropdownShow(ev) {
        // If a dropdown inside the element 'this.hideEl' is clicked while the 
        // header is fixed, we need to scroll the page up so that the 
        // 'this.hideEl' element is no longer overflow hidden. Without
        // this, the dropdown would be invisible.
        if (this.cssAffixed) {
            ev.preventDefault();
            this.scrollingElement.scrollTo({ top: 0, behavior: "smooth" });
            this.dropdownClickedEl = ev.currentTarget;
        }
    }

    onSearchbarInput() {
        // Prevents the dropdown with search results from being hidden when the
        // header is fixed.
        // The scroll animation is instantaneous because the dropdown could open
        // before reaching the top of the page, which would result in an
        // incorrect calculated height of the header.
        if (this.cssAffixed) {
            this.scrollingElement.scroll({ top: 0 });
        }
    }

    onScroll() {
        const scroll = this.scrollingElement.scrollTop;

        this.atTop = (scroll <= this.topGap);
        this.isScrolled = (scroll > this.topGap);

        // Need to be 'unfixed' when the window is not scrolled so that the
        // transparent menu option still works.
        if (scroll > this.topGap) {
            if (!this.cssAffixed) {
                this.transformShow();
                void this.el.offsetWidth; // Force a paint refresh
                this.toggleCSSAffixed(true);
            }
        } else {
            this.transformShow();
            void this.el.offsetWidth; // Force a paint refresh
            this.toggleCSSAffixed(false);
        }

        if (this.hideEl && this.isVisible) {
            // We check if we are hiding the scrollingElement to deactivate the 
            // transition and avoid the translate animation. Otherwise, we need 
            // to reactivate it for transformShow / transformHide.
            this.isHiding = scroll < this.hideEl.getBoundingClientRect().height;
            this.hiddenQuantity = Math.min(scroll, this.hideEl.getBoundingClientRect().height);
            if (this.isHideElTop) {
                // If the hideEl is at the top, we move the whole header element.
                this.forcedScroll = this.hiddenQuantity;
                this.transformShow();
            } else {
                // If the hideEl is at the bottom, we only move the hideEl and
                // it will be hidden behind the other part of the header.
                this.hideEl.style.marginTop = `-${this.hiddenQuantity}px`;
                this.adaptToHeaderChange();
            }
        }

        if (!this.cssAffixed && this.dropdownClickedEl) {
            const dropdown = Dropdown.getOrCreateInstance(this.dropdownClickedEl);
            dropdown.show();
            this.dropdownClickedEl = null;
        }

        if (this.isAnimated && this.transitionActive) {
            const scrollingDownward = (scroll > this.position);
            this.position = scroll;
            if (this.scrollingDownward !== scrollingDownward) {
                this.checkpoint = scroll;
            }
            this.scrollingDownward = scrollingDownward;

            if (scrollingDownward) {
                const movement = (this.position - this.checkpoint);
                if (this.isVisible && movement > (this.scrollOffset + this.topGap)) {
                    this.transformHide();
                }
            } else {
                const movement = (this.checkpoint - this.position);
                if (!this.isVisible && movement > ((this.scrollOffset + this.topGap) / 2)) {
                    this.transformShow();
                }
            }
        }
    }
}

registry
    .category("public.interactions.edit")
    .add("website.base_header_special", {
        Interaction: BaseHeaderSpecial,
        isAbstract: true,
    });
