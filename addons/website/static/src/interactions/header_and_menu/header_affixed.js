import { AbstractHeaderAnimated } from "@website/interactions/header_and_menu/abstract_header_animated";

import { registry } from "@web/core/registry";

class HeaderAffixed extends AbstractHeaderAnimated {

    static selector = 'header.o_header_standard:not(.o_header_sidebar)'

    setup() {
        this.fixedHeaderShow = false;
        this.scrolledPoint = 300;
    }

    destroy() {
        this.el.style.removeProperty('transform');
    }

    isShow() {
        return !this.fixedHeader || this.fixedHeaderShow;
    }

    /**
     * @param {integer} scroll
     */
    onScroll(scroll) {
        const mainPosScrolled = (scroll > this.el.getBoundingClientRect().height + this.topGap);
        const reachPosScrolled = (scroll > this.scrolledPoint + this.topGap) && !this.scrollHeightTooShort;
        const fixedUpdate = (this.fixedHeader !== mainPosScrolled);
        const showUpdate = (this.fixedHeaderShow !== reachPosScrolled);

        if (fixedUpdate || showUpdate) {
            document.querySelector('span').style.setProperty('transform', 
                reachPosScrolled
                ? `translate(0, -${this.topGap}px)`
                : mainPosScrolled
                ? 'translate(0, -100%)'
                : '')
            void this.el.offsetWidth; // Force a paint refresh
        }

        this.fixedHeaderShow = reachPosScrolled;
        this.hiddenOnScrollEl?.classList.toggle("hidden", mainPosScrolled);

        if (fixedUpdate) {
            this.toggleFixedHeader(mainPosScrolled);
        } else if (showUpdate) {
            this.adaptToHeaderChange();
        }
    }
}

registry.category("website.active_elements").add("website.header_affixed", HeaderAffixed);
