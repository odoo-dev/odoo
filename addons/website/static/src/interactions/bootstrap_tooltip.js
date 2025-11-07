import { registry } from "@web/core/registry";
import { Interaction } from "@web/public/interaction";

export class BootstrapTooltip extends Interaction {
    static selector = "[data-bs-toggle='tooltip']";

    start() {
        const tooltip = window.Tooltip.getOrCreateInstance(this.el);
        this.registerCleanup(() => tooltip.dispose());
    }
}

registry.category("public.interactions").add("website.BootstrapTooltip", BootstrapTooltip);
