/* @odoo-module */

import { Component } from "@odoo/owl";
import { useMessaging } from "../messaging_hook";

export class CallUI extends Component {
    static props = ["thread", "compact?"];
    static template = "mail.call_ui";

    setup() {
        this.messaging = useMessaging();
    }

    disconnect() {
        this.messaging.stopCall(this.props.thread.localId);
    }
}
