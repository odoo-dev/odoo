import { BaseHeader } from "@website/interactions/header/base_header";
import { registry } from "@web/core/registry";

class HeaderStandard extends BaseHeader {
    static selector = "header.o_header_standard:not(.o_header_sidebar)";

    setup() {
        super.setup();
        this.transitionPoint = 300;
        this.transitionPossible = false;
    }

    canTransition() {
        const scrollEl = document.scrollingElement;
        const remainingScroll = (scrollEl.scrollHeight - scrollEl.clientHeight) - this.transitionPoint;
        const clonedHeader = this.el.cloneNode(true);
        scrollEl.append(clonedHeader);
        clonedHeader.classList.add('o_header_is_scrolled', 'o_header_affixed', 'o_header_no_transition');
        const endHeaderHeight = clonedHeader.offsetHeight;
        clonedHeader.remove();
        const requiredScroll = this.getHeaderHeight() - endHeaderHeight;
        return requiredScroll > 0 ? remainingScroll > requiredScroll : true;
    }

    onScroll() {
        super.onScroll();

        const scroll = document.scrollingElement.scrollTop;

        const isScrolled = (scroll > this.transitionPoint);
        if (this.isScrolled !== isScrolled) {
            this.transitionPossible = this.canTransition() || !isScrolled;
            if (this.transitionPossible) {
                this.adaptToHeaderChangeLoop(1);
            }
        }

        const reachPosition1 = (scroll > this.getHeaderHeight() + this.topGap);
        const reachPosition2 = (scroll > this.transitionPoint + this.topGap) && this.transitionPossible;

        this.atTop = !reachPosition1;

        reachPosition2
            ? this.transformShow()
            : reachPosition1
                ? this.transformHide()
                : this.transformShow()
        void this.el.offsetWidth;

        this.cssAffixed = reachPosition1;
        this.isScrolled = reachPosition2;
    }
}

registry
    .category("website.active_elements")
    .add("website.header_standard", HeaderStandard);

// registry
//     .category("website.edit_active_elements")
//     .add("website.header_standard", HeaderStandard);
