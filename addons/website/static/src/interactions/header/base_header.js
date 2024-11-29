import { Interaction } from "@website/core/interaction";
import { compensateScrollbar } from "@web/core/utils/scrolling";
import { SIZES, utils as uiUtils } from "@web/core/ui/ui_service";

export class BaseHeader extends Interaction {
    dynamicContent = {
        _document: {
            "t-on-scroll": this.onScroll,
        },
        _window: {
            "t-on-resize": this.onResize,
        },
        _body: {
            "t-att-class": () => ({
                "overflow-hidden": this.bodyNoScroll,
            }),
        },
        _root: {
            "t-on-transitionend": () => this.adaptToHeaderChangeLoop(-1),
            "t-att-class": () => ({
                "o_top_fixed_element": this.isVisible,
                "o_header_affixed": this.cssAffixed,
                "o_header_is_scrolled": this.isScrolled,
                "o_header_no_transition": !this.transitionActive,
            })
        },
        ".offcanvas": {
            "t-on-show.bs.offcanvas": this.disableScroll,
            "t-on-hide.bs.offcanvas": this.enableScroll,
        },
        ".navbar-collapse": {
            "t-on-show.bs.collapse": this.disableScroll,
            "t-on-hide.bs.collapse": this.enableScroll,
        },
    }

    //--------------------------------------------------------------
    // Life Cycle
    //--------------------------------------------------------------

    setup() {
        this.topGap = 0;
        this.atTop = false;

        this.cssAffixed = false;
        this.bodyNoScroll = false;

        this.transitionCount = 0;
        this.transitionActive = true;

        this.isVisible = true;
        this.isScrolled = false;
        this.hasScrolled = false;
        this.closeDropdowns = false;

        this.isOverlay = !!this.el.closest(".o_header_overlay, .o_header_overlay_theme")

        this.mainEl = this.el.parentElement.querySelector("main");
        this.hideEl = this.el.querySelector(".o_header_hide_on_scroll");
    }

    //--------------------------------------------------------------
    // Event Handlers
    //--------------------------------------------------------------

    disableScroll() {
        if (uiUtils.getSize() < SIZES.LG) {
            this.bodyNoScroll = true;
        }
    };

    enableScroll() {
        this.bodyNoScroll = false;
    };

    onScroll() {

        const scroll = document.scrollingElement.scrollTop;

        if (!this.hasScrolled) {
            this.hasScrolled = true;
            if (scroll > 0) {
                this.adjustPosition();
            }
        } else {
            this.closeDropdowns = true;
        }

        if (this.closeDropdowns) {
            const dropdownToggleEls = this.el.querySelectorAll(".dropdown-toggle.show");
            for (const dropdownToggleEl of dropdownToggleEls) {
                Dropdown.getOrCreateInstance(dropdownToggleEl).hide();
            }
        }
    };

    onResize() {
        this.adjustScrollbar();
        if (
            document.body.classList.contains('overflow-hidden')
            && uiUtils.getSize() >= SIZES.LG
        ) {
            const offCanvasEls = this.el.querySelectorAll(".offcanvas.show");
            for (const offCanvasEl of offCanvasEls) {
                Offcanvas.getOrCreateInstance(offCanvasEl).hide();
            }
            const collapseEls = this.el.querySelectorAll(".navbar-collapse.show");
            for (const collapseEl of collapseEls) {
                Collapse.getOrCreateInstance(collapseEl).hide();
            }
        }
    };

    //--------------------------------------------------------------
    // Animation Handlers
    //--------------------------------------------------------------

    adaptToHeaderChange() {
        this.adjustMainPadding();
    }

    adaptToHeaderChangeLoop(addCount = 0) {
        this.adaptToHeaderChange();
        this.transitionCount = Math.max(0, this.transitionCount + addCount);
        if (this.transitionCount > 0) {
            this.el.classList.add("o_transitioning");
            window.requestAnimationFrame(() => this.adaptToHeaderChangeLoop());
            if (addCount !== 0) {
                clearTimeout(this.loopTimer);
                this.loopTimer = setTimeout(() => this.adaptToHeaderChangeLoop(- this.transitionCount), 500);
            }
        } else {
            this.el.classList.remove("o_transitioning");
            clearTimeout(this.loopTimer);
        }
    }

    //--------------------------------------------------------------
    // Animation Trigger
    //--------------------------------------------------------------

    transformShow() {
        this.isVisible = true;
        this.el.style.transform = this.atTop ? "" : `translate(0, -${this.topGap}px)`;
        this.adaptToHeaderChangeLoop(1);
    }

    transformHide() {
        this.isVisible = false;
        this.el.style.transform = "translate(0, -100%)";
        this.adaptToHeaderChangeLoop(1);
    }

    //--------------------------------------------------------------
    // Change Handlers
    //--------------------------------------------------------------

    adjustPosition() {
        document.scrollingElement.scrollBy(0, - this.el.offsetHeight);
    }

    adjustScrollbar() {
        compensateScrollbar(this.el, this.cssAffixed, false, 'right');
    }

    adjustMainPadding() {
        if (this.isOverlay) {
            return;
        }
        this.mainEl.style.setProperty("padding-top", this.cssAffixed ? this.getHeaderHeight() + "px" : "");
    }

    //--------------------------------------------------------------
    // Utils
    //--------------------------------------------------------------

    getHeaderHeight() {
        return this.el.getBoundingClientRect().height;
    }

    toggleCSSAffixed(useAffixed) {
        this.cssAffixed = useAffixed;
        this.adaptToHeaderChange();
        this.adjustScrollbar();
    }
}
