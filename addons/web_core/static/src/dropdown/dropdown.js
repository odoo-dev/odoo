import { Component, signal, useEffect, useListener } from "@odoo/owl";
import { Menu } from "@web_core/menu/menu";

export class Dropdown extends Component {
    static template = "web_core.Dropdown";
    static components = { Menu };

    /** @type {import("@odoo/owl").Signal<HTMLElement | null>} */
    toggler = signal(null);

    isMenuOpen = signal(false);

    setup() {
        useListener(
            document.body,
            "click",
            (ev) => {
                if (!this.toggler()?.contains(ev.target)) {
                    this.isMenuOpen.set(false);
                }
            },
            { capture: true }
        );
        useEffect(() => {
            const el = this.toggler();
            if (!el) {
                return;
            }

            el.addEventListener("click", () => {
                this.isMenuOpen.update((b) => !b);
            });
        });
    }
}
