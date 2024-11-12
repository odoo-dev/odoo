import { HeaderFixed } from "@website/interactions/header_and_menu/header_fixed";

/*
 * ABSTRACT INTERACTION
 */
export class AbstractHeaderDisappearing extends HeaderFixed {

    setup() {
        this.scrollingDownwards = true;
        this.hiddenHeader = false;
        this.position = 0;
        this.atTop = true;
        this.checkPoint = 0;
        this.scrollOffsetLimit = 200;
    }

    destroy() {
        this.showHeader();
    }

    showHeader() {
        this.el.dispatchEvent(new CustomEvent('odoo-transitionstart'));
    }

    hideHeader() {
        this.el.dispatchEvent(new CustomEvent('odoo-transitionstart'));
    }

    isShown() {
        return !this.fixedHeader || !this.hiddenHeader;
    }

    /**
     * @param {integer} scroll
     */
    onScroll(scroll) {
        const scrollingDownwards = (scroll > this.position);
        const atTop = (scroll <= 0);
        if (scrollingDownwards !== this.scrollingDownwards) {
            this.checkPoint = scroll;
        }

        this.scrollingDownwards = scrollingDownwards;
        this.position = scroll;
        this.atTop = atTop;

        if (scrollingDownwards) {
            if (!this.hiddenHeader && scroll - this.checkPoint > (this.scrollOffsetLimit + this.topGap)) {
                this.hiddenHeader = true;
                this.hideHeader();
            }
        } else {
            if (this.hiddenHeader && scroll - this.checkPoint < -(this.scrollOffsetLimit + this.topGap) / 2) {
                this.hiddenHeader = false;
                this.showHeader();
            }
        }

        if (atTop && !this.atTop) {
            this.showHeader();
        }
    }
}
