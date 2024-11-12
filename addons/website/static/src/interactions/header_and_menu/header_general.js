import { Interaction } from "@website/core/interaction";
import { registry } from "@web/core/registry";

class HeaderGeneral extends Interaction {

    static selector = 'header#top'

    start() {
        const els = this.el.querySelectorAll('#top_menu_collapse, #top_menu_collapse_mobile');
        for (const el of els) {
            el.addEventListener('show.bs.offcanvas', this.onCollapseShow);
            el.addEventListener('hidden.bs.offcanvas', this.onCollapseHidden);
        }
    }

    destroy() {
        const els = this.el.querySelectorAll('#top_menu_collapse, #top_menu_collapse_mobile');
        for (const el of els) {
            el.removeEventListener('show.bs.offcanvas');
            el.removeEventListener('hidden.bs.offcanvas');
        }
    }

    onCollapseShow() {
        this.el.classList.add('o_top_menu_collapse_shown');
    }

    onCollapseHidden() {
        const mobileNavbarEl = this.el.querySelector("#top_menu_collapse_mobile");
        if (!mobileNavbarEl.matches(".show, .showing")) {
            this.el.classList.remove("o_top_menu_collapse_shown");
        }
    }
}

registry.category("website.active_elements").add("website.header_general", HeaderGeneral);
