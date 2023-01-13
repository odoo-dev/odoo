/* @odoo-module */

import { Component, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { useMessaging } from "../core/messaging_hook";
import { CallMain } from "@mail/new/rtc/call_main";
import { _t } from "@web/core/l10n/translation";

export class Call extends Component {
    static components = { CallMain };
    static props = ["thread", "compact?"];
    static template = "mail.call";

    setup() {
        this.messaging = useMessaging();
        this.notification = useService("notification");
        this.state = useState({
            isFullscreen: false,
        });
    }

    get isMinimized() {
        return false;
    }

    get hasSidebar() {
        return false;
    }

    async enterFullScreen() {
        const el = document.body;
        try {
            if (el.requestFullscreen) {
                await el.requestFullscreen();
            } else if (el.mozRequestFullScreen) {
                await el.mozRequestFullScreen();
            } else if (el.webkitRequestFullscreen) {
                await el.webkitRequestFullscreen();
            }
            this.state.isFullscreen = true;
        } catch {
            this.state.isFullscreen = false;
            this.notification.add(_t("The Fullscreen mode was denied by the browser"), {
                type: "warning",
            });
        }
    }

    async exitFullScreen() {
        const fullscreenElement = document.webkitFullscreenElement || document.fullscreenElement;
        if (fullscreenElement) {
            if (document.exitFullscreen) {
                await document.exitFullscreen();
            } else if (document.mozCancelFullScreen) {
                await document.mozCancelFullScreen();
            } else if (document.webkitCancelFullScreen) {
                await document.webkitCancelFullScreen();
            }
        }
        this.state.isFullscreen = false;
    }
}
