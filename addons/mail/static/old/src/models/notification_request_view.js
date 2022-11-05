/** @odoo-module **/

import { registerModel } from "@mail/model/model_core";
import { attr, one } from "@mail/model/model_field";
import { clear } from "@mail/model/model_field_command";

import { sprintf } from "@web/core/utils/strings";

registerModel({
    name: "NotificationRequestView",
    template: "mail.NotificationRequestView",
    templateGetter: "notificationRequestView",
    recordMethods: {
        onClick() {
            this.messaging.requestNotificationPermission();
            if (!this.messaging.device.isSmall) {
                this.messaging.messagingMenu.close();
            }
        },
    },
    fields: {
        headerText: attr({
            compute() {
                if (!this.messaging.partnerRoot) {
                    return clear();
                }
                return sprintf(this.env._t("%(odoobotName)s has a request"), {
                    odoobotName: this.messaging.partnerRoot.nameOrDisplayName,
                });
            },
        }),
        notificationListViewOwner: one("NotificationListView", {
            identifying: true,
            inverse: "notificationRequestView",
        }),
        personaImStatusIconView: one("PersonaImStatusIconView", {
            inverse: "notificationRequestViewOwner",
            compute() {
                return this.messaging.partnerRoot && this.messaging.partnerRoot.isImStatusSet
                    ? {}
                    : clear();
            },
        }),
    },
});
