/** @odoo-module */

import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useMessaging } from "../messaging_hook";
import { ChatWindow } from "./chat_window";

export class ChatWindowContainer extends Component {
    setup() {
        this.messaging = useMessaging();
    }

    get chatWindows() {
        return this.messaging.discuss.isActive ? [] : this.messaging.chatWindows;
    }
}

Object.assign(ChatWindowContainer, {
    components: { ChatWindow },
    props: [],
    template: "mail.chat_window_container",
});

registry.category("main_components").add("mail.ChatWindowContainer", {
    Component: ChatWindowContainer,
});

Object.assign(ChatWindowContainer, {
    components: { ChatWindow },
    props: [],
    template: "mail.chat_window_container",
});
