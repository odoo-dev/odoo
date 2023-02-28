/** @odoo-module **/

import { many, Model } from "@mail/legacy/model";

Model({
    name: "PopoverManager",
    template: "mail.PopoverManager",
    fields: {
        // FIXME: dependent on implementation that uses insert order in relations!!
        popoverViews: many("PopoverView", { inverse: "manager", isCausal: true }),
    },
});
