import { BaseHeader } from "@website/interactions/header/base_header";

export class BaseHeaderSpecial extends BaseHeader {
    dynamicContent = {
        ...this.dynamicContent,
        ".o_header_hide_on_scroll .dropdown-toggle": {
            "t-on-show.bs.dropdown": this.onDropdownShow,
        },
        ".o_header_hide_on_scroll :not(.modal-content) > .o_searchbar_form": {
            "t-on-input": this.onSearchbarInput,
        },
    }

    setup() {
        super.setup();
        this.isAnimated = false;

        this.position = 0;
        this.checkpoint = 0;
        this.scrollOffset = 200;
        this.scrollingDownward = true;

        this.dropdownClickedEl = null;
    }

    start() {
        if (this.isAnimated) {
            this.transitionActive = false;
        }
        this.onScroll();
        this.transitionActive = true;
    }

    onDropdownShow(ev) {
        if (this.cssAffixed) {
            ev.preventDefault();
            document.scrollingElement.scrollTo({ top: 0, behavior: "smooth" });
            this.dropdownClickedEl = ev.currentTarget;
        }
    }

    onSearchbarInput() {
        if (this.cssAffixed) {
            document.scrollingElement.scroll({ top: 0 });
        }
    }

    onScroll() {
        super.onScroll();

        const scroll = document.scrollingElement.scrollTop;

        this.atTop = (scroll <= this.topGap);
        this.isScrolled = (scroll > this.topGap);

        if (scroll > this.topGap) {
            if (!this.cssAffixed) {
                this.transformShow();
                void this.el.offsetWidth;
                this.toggleCSSAffixed(true);
            }
        } else {
            this.transformShow();
            void this.el.offsetWidth;
            this.toggleCSSAffixed(false);
        }

        if (this.hiddenOnScrollEl) {
            //
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
                if (this.isVisible && (this.position - this.checkpoint) > (this.scrollOffset + this.topGap)) {
                    this.transformHide();
                }
            } else {
                if (!this.isVisible && (this.checkpoint - this.position) > ((this.scrollOffset + this.topGap) / 2)) {
                    this.transformShow();
                }
            }
        }
    }
}
