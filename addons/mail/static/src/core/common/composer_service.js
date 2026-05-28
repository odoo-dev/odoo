import { proxy } from "@odoo/owl";

import { registry } from "@web/core/registry";

export const composerService = {
    dependencies: ["mail.store"],
    /**
     * Enable Html composer with: odoo.__WOWL_DEBUG__.root.env.services["mail.composer"].setHtmlComposer()
     */
    start(env) {
        const state = proxy({
            htmlEnabled: JSON.parse(localStorage.getItem("mail.html_composer.enabled")),
            setHtmlComposer() {
                if (state.htmlEnabled) {
                    return;
                }
                state.htmlEnabled = true;
                localStorage.setItem("mail.html_composer.enabled", true);
            },
            setTextComposer() {
                if (!state.htmlEnabled) {
                    return;
                }
                state.htmlEnabled = false;
                localStorage.setItem("mail.html_composer.enabled", false);
            },
        });
        window.addEventListener("storage", ({ key, newValue }) => {
            if (key === "mail.html_composer.enabled") {
                state.htmlEnabled = JSON.parse(newValue);
            }
        });
        return state;
    },
};

registry.category("services").add("mail.composer", composerService);
