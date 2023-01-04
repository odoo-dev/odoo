/* @odoo-module */

import { Component, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { useMessaging } from "../core/messaging_hook";

export class WelcomePage extends Component {
    static props = ["data?", "proceed?"];
    static template = "mail.welcome_page";

    setup() {
        this.messaging = useMessaging();
        this.rpc = useService("rpc");
        this.state = useState({
            userName: "",
        });
    }

    onKeydownInput(ev) {
        if (ev.key === "Enter") {
            this.joinChannel();
        }
    }

    async joinChannel() {
        if (this.messaging.state.currentGuest) {
            await this.rpc("/mail/guest/update_name", {
                guest_id: this.messaging.state.currentGuest.id,
                name: this.state.userName.trim(),
            });
        }
        if (this.props.data?.discussPublicViewData.addGuestAsMemberOnJoin) {
            await this.messaging.rpc("/mail/channel/add_guest_as_member", {
                channel_id: this.thread.id,
                channel_uuid: this.thread.uuid,
            });
        }
        this.props.proceed?.();
    }

    get thread() {
        return this.messaging.state.threads[this.messaging.state.discuss.threadLocalId];
    }
}
