/* @odoo-module */

import { Component } from "@odoo/owl";
import { useMessaging } from "../messaging_hook";

export class CallSettings extends Component {
    static template = "mail.settings";

    setup() {
        this.messaging = useMessaging();
    }
}
