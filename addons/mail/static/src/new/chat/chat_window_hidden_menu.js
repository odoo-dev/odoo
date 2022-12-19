/* @odoo-module */

import { Component } from "@odoo/owl";
import { useMessaging } from "../messaging_hook";
import { ChatWindow } from "./chat_window";
import { Dropdown } from "@web/core/dropdown/dropdown";

export class ChatWindowHiddenMenu extends Component {
    static components = { ChatWindow, Dropdown };
    static props = ["chatWindows"];
    static template = "mail.chat_window_hidden_menu";

    setup() {
        this.messaging = useMessaging();
    }

    get unread() {
        let unreadCounter = 0;
        for (const chatWindow of this.messaging.hiddenChatWindows) {
            const thread = this.messaging.state.threads[chatWindow.threadLocalId];
            unreadCounter += thread.message_unread_counter;
        }
        return unreadCounter;
    }
}
