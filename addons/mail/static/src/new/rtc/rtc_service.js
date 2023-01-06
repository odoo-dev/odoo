/** @odoo-module */

import { _t } from "@web/core/l10n/translation";

import { Rtc } from "./rtc";

export const rtcService = {
    dependencies: [
        "mail.store",
        "mail.messaging",
        "notification",
        "rpc",
        "bus_service",
        "mail.soundEffects",
        "mail.userSettings",
    ],
    start(
        env,
        {
            "mail.store": store,
            "mail.messaging": messaging,
            notification,
            rpc,
            bus_service: bus,
            "mail.soundEffects": soundEffects,
            "mail.userSettings": userSettings,
        }
    ) {
        const rtc = new Rtc(env, store, messaging, notification, rpc, soundEffects, userSettings);
        bus.addEventListener("notification", (notifEvent) => {
            for (const notif of notifEvent.detail) {
                switch (notif.type) {
                    case "mail.channel.rtc.session/peer_notification":
                        {
                            const { sender, notifications } = notif.payload;
                            for (const content of notifications) {
                                rtc.handleNotification(sender, content);
                            }
                        }
                        break;
                    case "mail.channel.rtc.session/ended":
                        {
                            const { sessionId } = notif.payload;
                            if (rtc.state.selfSession?.id === sessionId) {
                                rtc.endCall();
                                notification.add(
                                    _t("Disconnected from the RTC call by the server"),
                                    { type: "warning" }
                                );
                            }
                        }
                        break;
                }
            }
        });
        // debugging. remove this
        window.rtc = rtc;
        return rtc;
    },
};
