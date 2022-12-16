/* @odoo-module */

import { Messaging, asyncMethods } from "./core/messaging";
import { Thread } from "./core/thread_model";

export const messagingService = {
    dependencies: [
        "rpc",
        "orm",
        "user",
        "router",
        "bus_service",
        "im_status",
        "notification",
        "multi_tab",
        "presence",
    ],
    async: asyncMethods,
    start(
        env,
        {
            rpc,
            orm,
            user,
            router,
            bus_service: bus,
            im_status,
            notification,
            multi_tab: multiTab,
            presence,
        }
    ) {
        // compute initial discuss thread
        let threadLocalId = Thread.createLocalId({ model: "mail.box", id: "inbox" });
        const activeId = router.current.hash.active_id;
        if (typeof activeId === "string" && activeId.startsWith("mail.box_")) {
            threadLocalId = Thread.createLocalId({ model: "mail.box", id: activeId.slice(9) });
        }
        if (typeof activeId === "string" && activeId.startsWith("mail.channel_")) {
            threadLocalId = Thread.createLocalId({
                model: "mail.channel",
                id: parseInt(activeId.slice(13), 10),
            });
        }

        const messaging = new Messaging(
            env,
            rpc,
            orm,
            user,
            router,
            bus,
            threadLocalId,
            im_status,
            notification,
            multiTab,
            presence
        );
        messaging.initialize();
        bus.addEventListener("notification", (notifEvent) => {
            messaging.handleNotification(notifEvent.detail);
        });

        // debugging. remove this
        window.messaging = messaging;
        return messaging;
    },
};
