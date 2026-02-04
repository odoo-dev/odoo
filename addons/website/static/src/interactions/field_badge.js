import { registry } from "@web/core/registry";
import { Interaction } from "@web/public/interaction";

export class FieldBadge extends Interaction {
    static selector = "[data-field-badge]";

    start() {
        this.renderAt("website.field_badge", {}, this.el);
    }
}

registry.category("public.interactions").add("website.form.field_ribbon", FieldBadge);
registry.category("public.interactions.edit").add("website.form.field_ribbon", {
    Interaction: FieldBadge,
});
