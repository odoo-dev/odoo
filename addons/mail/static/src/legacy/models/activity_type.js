/** @odoo-module **/

import { attr, many, Model } from "@mail/legacy/model";

Model({
    name: "ActivityType",
    fields: {
        activities: many("Activity", { inverse: "type" }),
        displayName: attr(),
        id: attr({ identifying: true }),
    },
});
