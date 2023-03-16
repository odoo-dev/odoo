/** @odoo-module */

import { markup } from "@odoo/owl";
import { registry } from "@web/core/registry";

export const notificationService = {
    dependencies: ["bus_service", "notification"],

    handle(notifications) {
        for (const notif of notifications) {
            switch (notif.type) {
                case "bus.simple_notification":
                    {
                        const { message, message_is_html, sticky, title, warning } = notif.payload;
                        this.notificationService.add(message_is_html ? markup(message) : message, {
                            sticky,
                            title,
                            type: warning ? "warning" : "danger",
                        });
                    }
                    break;
            }
        }
    },

    start(env, { bus_service: busService, notification }) {
        this.notificationService = notification;
        busService.addEventListener("notification", (notifEvent) => this.handle(notifEvent.detail));
    },
};

registry.category("services").add("bus.notification", notificationService);
