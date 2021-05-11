/** @odoo-module **/

import { bus } from "web.core";
import { browser } from "../core/browser/browser";
import { registry } from "../core/registry";

export const legacyServiceProvider = {
    dependencies: ["effect"],
    start({ services }) {
        browser.addEventListener("show-effect", (ev) => {
          services.effect.create(ev.detail.type, ev.detail);
        });
        bus.on("show-effect", this, (payload) => {
            services.effect.create(payload.type, payload);
        });
    },
};

registry.category("services").add("legacy_service_provider", legacyServiceProvider);
