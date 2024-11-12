import { Animation } from "@website/core/animation";

import { SIZES, utils as uiUtils } from "@web/core/ui/ui_service";
import { compensateScrollbar } from "@web/core/utils/scrolling";
import { extraMenuUpdateCallbacks } from './extra_menu_update_callback.js';
/*
 * ABSTRACT INTERACTION
 */
export class AbstractHeaderAnimated extends Animation {

    static dynamicContent = {
        "_root": {
            "t-on-scroll": "onScroll",
        },
        // "_body": {
        //     "t-on-resize": "onResize",
        // },
    }

    setup() {
        this.fixedHeader = false;
        this.scrolledPoint = 0;
        this.hasScrolled = false;
        this.closeOpenedMenus = false;
        this.scrollHeightTooShort = false;
        this.scrollableEl = document.scrollingElement;
    }

    start() {
        const siblings = this.el.parentElement.children;
        this.main;
        for (const sibling in siblings) {
            if (sibling.tagName?.toLowerCase() == 'main') {
                this.main = sibling;
                break;
            }
        }
        
        this.isOverlayHeader = !!this.el.closest('.o_header_overlay, .o_header_overlay_theme');
        this.hiddenOnScrollEl = this.el.querySelector(".o_header_hide_on_scroll");

        this.navbarOffcanvases = this.el.querySelectorAll(".offcanvas");
        for (const navbarOffcanvas of this.navbarOffcanvases) {
            navbarOffcanvas.addEventListener("show.bs.offcanvas.BaseAnimatedHeader", this.disableScroll);
            navbarOffcanvas.addEventListener("hide.bs.offcanvas.BaseAnimatedHeader", this.disableScrollenableScroll);
        }

        this.navbarCollapses = this.el.querySelectorAll('.navbar-collapse');
        for (const navbarCollapse of this.navbarCollapses) {
            navbarCollapse.addEventListener("show.bs.collapse.BaseAnimatedHeader", this.disableScrolldisableScroll);
            navbarCollapse.addEventListener("hide.bs.collapse.BaseAnimatedHeader", this.disableScrollenableScroll);
        }

        this.transitionCount = 0;
        this.el.addEventListener('odoo-transitionstart.BaseAnimatedHeader', () => {
            this.el.classList.add('o_transitioning');
            this.adaptToHeaderChangeLoop(1);
        });
        this.el.addEventListener('transitionend.BaseAnimatedHeader', () => this.adaptToHeaderChangeLoop(-1));

    }

    destroy() {
        this.toggleFixedHeader(false);
        this.el.removeClass('o_header_affixed o_header_is_scrolled o_header_no_transition o_transitioning');
        for (const navbarOffcanvas of this.navbarOffcanvases) {
            navbarOffcanvas.removeEventListener(".BaseAnimatedHeader");
        }
        for (const navbarCollapse of this.navbarCollapses) {
            navbarCollapse.removeEventListener(".BaseAnimatedHeader");
        }
        this.el.removeEventListener('.BaseAnimatedHeader');
    }

    disableScroll() {
        if (uiUtils.getSize() < SIZES.LG) {
            document.body.classList.add('overflow-hidden');
        }
    }

    enableScroll() {
        document.body.classList.remove('overflow-hidden');
    }

    isShown() {
        return true;
    }

    computeTopGap() {
        return 0;
    }

    adaptFixedHeaderPosition() {
        compensateScrollbar(this.el, this.fixedHeader, false, 'right');
    }

    adaptToHeaderChange() {
        this.updateMainPaddingTop();
        this.el.classList.toggle('o_top_fixed_element', this.isShown());

        for (const callback of extraMenuUpdateCallbacks) {
            callback();
        }
    }

    /**
     * @param {integer} [addCount=0]
     */
    adaptToHeaderChangeLoop(addCount = 0) {
        this.adaptToHeaderChange();

        this.transitionCount += addCount;
        this.transitionCount = Math.max(0, this.transitionCount);

        if (this.transitionCount > 0) {
            window.requestAnimationFrame(() => this.adaptToHeaderChangeLoop());

            if (addCount !== 0) {
                clearTimeout(this.changeLoopTimer);
                this.changeLoopTimer = setTimeout(() => {
                    this.adaptToHeaderChangeLoop(-this.transitionCount);
                }, 500);
            }
        } else {
            clearTimeout(this.changeLoopTimer);
            this.el.classList.remove('o_transitioning');
        }
    }

    adjustURLAutoScroll() {
        if (!this.editableMode) {
            this.scrollableEl.scrollBy(0, -this.el.offsetHeight);
        }
    }

    /**
     * @param {boolean} [useFixed=true]
     */
    toggleFixedHeader(useFixed = true) {
        this.fixedHeader = useFixed;
        this.adaptToHeaderChange();
        this.el.classList.toggle('o_header_affixed', useFixed);
        this.adaptFixedHeaderPosition();
    }

    updateMainPaddingTop() {
        this.topGap = this.computeTopGap();

        if (this.isOverlayHeader) {
            return;
        }
        this.main.style.paddingTop = this.fixedHeader ? this.el.getBoundingClientRect().height : '';
    }

    /**
     * @returns {boolean}
     */
    scrollHeightTooShort() {
        const scrollEl = this.scrollableEl;
        const remainingScroll = (scrollEl.scrollHeight - scrollEl.clientHeight) - this.scrolledPoint;
        const clonedHeader = this.el.cloneNode(true);
        scrollEl.append(clonedHeader);
        clonedHeader.classList.add('o_header_is_scrolled', 'o_header_affixed', 'o_header_no_transition');
        const endHeaderHeight = clonedHeader.offsetHeight;
        clonedHeader.remove();
        const heightDiff = this.el.getBoundingClientRect().height - endHeaderHeight;
        return heightDiff > 0 ? remainingScroll <= heightDiff : false;
    }

    /**
     * @param {integer} scroll
     */
    onScroll(scroll) {
        // Disable css transition if refresh with scrollTop > 0
        if (!this.hasScrolled) {
            this.hasScrolled = true;
            if (scroll > 0) {
                this.el.classList.add('o_header_no_transition');
                this.adjustURLAutoScroll();
            }
        } else {
            this.el.classList.remove('o_header_no_transition');
            this.closeOpenedMenus = true;
        }

        // Indicates the page is scrolled, the logo size is changed.
        const headerIsScrolled = (scroll > this.scrolledPoint);
        if (this.headerIsScrolled !== headerIsScrolled) {
            this.scrollHeightTooShort = headerIsScrolled && this.scrollHeightTooShort();
            if (!this.scrollHeightTooShort) {
                this.el.classList.toggle('o_header_is_scrolled', headerIsScrolled);
                // TODO OULAIDE
                //this.$el.trigger('odoo-transitionstart');
                this.headerIsScrolled = headerIsScrolled;
            }
        }

        if (this.closeOpenedMenus) {
            // Hide only the open dropdowns.
            this.el.querySelectorAll(".dropdown-toggle.show").forEach(dropdownToggleEl => {
                Dropdown.getOrCreateInstance(dropdownToggleEl).hide();
            });
        }
    }

    /**
     * @param {Event} ev
     */
    onResize(ev) {
        this.adaptFixedHeaderPosition();
        if (document.body.classList.contains('overflow-hidden')
            && uiUtils.getSize() >= SIZES.LG) {
            this.el.querySelectorAll(".offcanvas.show").forEach(offcanvasEl => {
                Offcanvas.getOrCreateInstance(offcanvasEl).hide();
            });
            // Compatibility: can probably be removed, there is no such elements
            // in default navbars... although it could be used by custo.
            this.el.querySelectorAll(".navbar-collapse.show").forEach(collapseEl => {
                Collapse.getOrCreateInstance(collapseEl).hide();
            });
        }
    }
}
