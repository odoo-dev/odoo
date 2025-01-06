import { Subscribe } from "./subscribe";
import { registry } from "@web/core/registry";

import { _t } from "@web/core/l10n/translation";

const SubscribeEdit = I => class extends I {
    start() { }
};

registry
    .category("public.interactions.edit")
    .add("website_mass_mailing.subscribe", {
        Interaction: Subscribe,
        mixin: SubscribeEdit,
    });
