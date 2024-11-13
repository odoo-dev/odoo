import { Interaction } from "@website/core/interaction";
import { registry } from "@web/core/registry";

class RippleEffect extends Interaction {

    static selector = ".btn, .dropdown-toggle, .dropdown-item";
    static dynamicContent = {
        "_root:t-on-click": "onClick",
    }

    setup() {
        this.duration = 350;
    }

    destroy() {
        if (this.rippleEl) {
            this.rippleEl.remove();
        }
    }

    /**
     * @param {boolean} toggle
     */
    toggleRippleEffect(toggle) {
        this.el.classList.toggle('o_js_ripple_effect', toggle);
    }

    /**
     * @param {Event} ev
     */
    onClick(ev) {
        if (!this.rippleEl) {
            this.rippleEl = document.createElement('span');
            this.rippleEl.classList.add('o_ripple_item');
            this.rippleEl.style.animationDuration = `${this.duration}ms`;
            this.el.appendChild(this.rippleEl);
        }

        clearTimeout(this.timeoutID);
        this.toggleRippleEffect(false);

        const offsetY = this.el.offsetTop;
        const offsetX = this.el.offsetLeft;

        // The diameter need to be recomputed because a change of window width
        // can affect the size of a button (e.g. media queries).
        const diameter = Math.max(this.el.offsetWidth, this.el.offsetHeight);

        this.rippleEl.style.width = `${diameter}px`;
        this.rippleEl.style.height = `${diameter}px`;
        this.rippleEl.style.top = `${ev.pageY - offsetY - diameter / 2}px`;
        this.rippleEl.style.left = `${ev.pageX - offsetX - diameter / 2}px`;

        this.toggleRippleEffect(true);
        this.timeoutID = setTimeout(() => this.toggleRippleEffect(false), this.duration);
    }
}

registry.category("website.active_elements").add("website.ripple_effect", RippleEffect);
