import { Interaction } from "@website/core/interaction";
import { registry } from "@web/core/registry";

class Parallax extends Interaction {

    static selector = ".parallax";
    static dynamicContent = {
        '_document:t-on-scroll': 'onScroll',
        '_window:t-on-resize': 'onResize',
    }

    setup() {
        this.bg = this.el.querySelector('.s_parallax_bg');
    }

    start() {
        this.rebuild();
    }

    destroy() {
        this.bg.style.top = '';
        this.bg.style.bottom = '';
        this.bg.style.transform = '';
    }

    rebuild() {
        this.viewportHeight = document.body.clientHeight;
        this.parallaxHeight = this.el.getBoundingClientRect().height;
        this.maxScrollPos = this.viewportHeight;
        this.minScrollPos = - this.parallaxHeight;
        this.speed = parseFloat(this.el.getAttribute('data-scroll-background-ratio')) || 0;
        if (this.speed === 0 || this.speed === 1) {
            return;
        }
        this.ratio = this.speed * (this.viewportHeight / 10);
        this.bg.style.top = -Math.abs(this.ratio) + 'px';
        this.bg.style.bottom = -Math.abs(this.ratio) + 'px';
    }

    onResize() {
        this.rebuild();
    }

    onScroll(ev) {
        const currentPosition = this.el.getBoundingClientRect().top;
        if (this.speed === 0
            || this.speed === 1
            || currentPosition < this.minScrollPos
            || currentPosition > this.maxScrollPos) {
            return;
        }

        const r = 2 / (this.minScrollPos - this.maxScrollPos);
        const offset = 1 - 2 * this.minScrollPos / (this.minScrollPos - this.maxScrollPos);
        const movement = - this.ratio * (r * currentPosition + offset);

        this.bg.style.transform = 'translateY(' + movement + 'px)';
    }
}

registry.category("website.active_elements").add("website.parallax", Parallax);
