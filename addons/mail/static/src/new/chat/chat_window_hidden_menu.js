/* @odoo-module */

import { Component, useState } from "@odoo/owl";
import { useMessaging } from "../core/messaging_hook";
import { ChatWindow } from "./chat_window";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { useService } from "@web/core/utils/hooks";

export class ChatWindowHiddenMenu extends Component {
    static components = { ChatWindow, Dropdown };
    static props = ["chatWindows"];
    static template = "mail.chat_window_hidden_menu";

    setup() {
        this.messaging = useMessaging();
        this.chatWindowService = useState(useService("mail.chat_window"));
    }

    get unread() {
        let unreadCounter = 0;
        for (const chatWindow of this.chatWindowService.hidden) {
            unreadCounter += chatWindow.thread.message_unread_counter;
        }
        return unreadCounter;
    }
}
