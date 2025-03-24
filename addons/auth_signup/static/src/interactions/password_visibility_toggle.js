import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

export class PasswordVisibilityToggle extends Interaction {
    static selector = "input.password-toggle";
    
    setup() {
        const wrapper = document.createElement("div");
        wrapper.className = "js-password-wrapper position-relative d-inline-block w-100";

        this.el.parentElement.insertBefore(wrapper, this.el);
        wrapper.appendChild(this.el);

        this.button = document.createElement("button");
        this.button.type = "button";
        this.button.className = "position-absolute end-0 top-50 translate-middle-y btn btn-link p-0 me-2 text-muted fa fa-eye";

        wrapper.appendChild(this.button);

        this.button.addEventListener("click", () => this.toggleVisibility());

    }

    toggleVisibility() {
        this.el.type = this.el.type === "password" ? "text" : "password";
        this.button.classList.toggle("fa-eye", this.el.type === "password");
        this.button.classList.toggle("fa-eye-slash", this.el.type === "text");
    }
}

registry.category("public.interactions").add("password.toggle", PasswordVisibilityToggle);