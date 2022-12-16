/* @odoo-module */

import { Component, onWillStart } from "@odoo/owl";
import { useMessaging } from "../messaging_hook";
import { ChatWindow } from "./chat_window";

export class ChatWindowContainer extends Component {
    static components = { ChatWindow };
    static props = [];
    static template = "mail.chat_window_container";

    setup() {
        this.messaging = useMessaging();
        onWillStart(() => this.messaging.isReady);
    }

    get chatWindows() {
        return this.messaging.state.discuss.isActive ? [] : this.messaging.state.chatWindows;
    }
}
