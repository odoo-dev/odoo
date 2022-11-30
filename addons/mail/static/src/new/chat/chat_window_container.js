/** @odoo-module **/

import { useMessaging } from "@mail/new/messaging_hook";
import { ChatWindow } from "@mail/new/chat/chat_window";

import { Component } from "@odoo/owl";

export class ChatWindowContainer extends Component {
    setup() {
        this.messaging = useMessaging();
    }

    get chatWindows() {
        return this.messaging.state.discuss.isActive ? [] : this.messaging.state.chatWindows;
    }
}

Object.assign(ChatWindowContainer, {
    components: { ChatWindow },
    props: [],
    template: "mail.chat_window_container",
});
