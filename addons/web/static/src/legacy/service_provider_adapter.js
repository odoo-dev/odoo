/** @odoo-module **/

import { useService } from "@web/core/service_hook";
import { patch } from "@web/core/utils/patch";
import { WebClient } from "@web/webclient/webclient";
import { useListener } from "web.custom_hooks";
import { bus } from "web.core";

patch(WebClient.prototype, "web.service_provider_adapter", {
  setup() {
    // Effect Service
    const effect = useService("effect");
    useListener("show-effect", (ev) => {
      effect.create(ev.detail.type, ev.detail);
    });
    bus.on("show-effect", this, (payload) => {
      effect.create(payload.type, payload);
    });
    this._super(...arguments);
  },
});
