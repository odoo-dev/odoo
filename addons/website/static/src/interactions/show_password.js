import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

export class ShowPassword extends Interaction {
    static selector = "#showPass";
    dynamicContent = {
        _root: {
            "t-on-pointerup": () => this.passwordEl.type = "password",
            "t-on-pointerdown": () => this.passwordEl.type = "text",
        },
    };

    setup() {
        this.passwordEl = this.el.closest(".input-group").querySelector("#password");
    }
}

registry
    .category("public.interactions")
    .add("website.show_password", ShowPassword);
