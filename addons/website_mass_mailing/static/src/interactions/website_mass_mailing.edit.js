import { registry } from "@web/core/registry";
import { Interaction } from "@web/public/interaction";
import { Subscribe } from "./website_mass_mailing";

export class SubscribeEdit extends Interaction {
  static selector = Subscribe.selector;

  start() {
    // Compat: remove d-none for DBs that have the button saved with it.
    this.el.classList.remove("d-none");
  }
}

registry.category("public.interactions.edit").add("website.subscribe", {
  Interaction: Subscribe,
});
