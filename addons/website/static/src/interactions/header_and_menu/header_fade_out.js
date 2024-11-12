import { AbstractHeaderDisappearing } from "@website/interactions/header_and_menu/abstract_header_disappearing";

import { registry } from "@web/core/registry";

class HeaderFadeOut extends AbstractHeaderDisappearing {

    static selector = 'header.o_header_fade_out:not(.o_header_sidebar)'

    showHeader() {
        this.$el.css('transform', this.atTop ? '' : `translate(0, -${this.topGap}px)`);
        this.$el.stop(false, true).fadeIn();
    }

    hideHeader() {
        this.$el.stop(false, true).fadeOut();
    }    

    adjustURLAutoScroll() {}

}

registry.category("website.active_elements").add("website.header_fade_out", HeaderFadeOut);
