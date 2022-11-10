/* @odoo-module */

import { Component } from "@odoo/owl";
import { useMessaging } from "../messaging_hook";

export class CallSettings extends Component {
    static template = "mail.settings";
    static props = [];

    setup() {
        this.messaging = useMessaging();
    }
}
