/** @odoo-module **/

import { one, Model } from "@mail/legacy/model";

Model({
    name: "MessageNotificationPopoverContentView",
    template: "mail.MessageNotificationPopoverContentView",
    fields: {
        messageView: one("MessageView", {
            related: "popoverViewOwner.messageViewOwnerAsNotificationContent",
        }),
        popoverViewOwner: one("PopoverView", {
            identifying: true,
            inverse: "messageNotificationPopoverContentView",
        }),
    },
});
