import { AbstractHeaderDisappearing } from "@website/interactions/header_and_menu/abstract_header_disappearing";

import { registry } from "@web/core/registry";

class HeaderDisappearing extends AbstractHeaderDisappearing {

    static selector = 'header.o_header_disappears:not(.o_header_sidebar)'

    showHeader() {
        this.el.style.setProperty('transform', this.atTop ? '' : `translate(0, -${this.topGap}px)`);
    }

    hideHeader() {
        this.el.style.setProperty('transform', 'translate(0, -100%)');
    }

    adjustURLAutoScroll() {}

}

registry.category("website.active_elements").add("website.header_disappearing", HeaderDisappearing);
