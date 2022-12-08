/* @odoo-module */

import { Component } from "@odoo/owl";
import { useMessaging } from "../messaging_hook";
import { Typing } from "../composer/typing";

/**
 * @typedef {Object} Props
 * @property {Object} chatWindow
 * @property {string} size
 * @extends {Component<Props, Env>}
 */
export class ChatWindowIcon extends Component {
    static template = "mail.chat_window_icon";
    static components = { Typing };
    static props = ["chatWindow", "size?"];
    static defaultProps = {
        size: "medium",
    };

    setup() {
        this.messaging = useMessaging();
    }

    get isTyping() {
        return this.messaging.isTyping(this.thread.id);
    }

    get thread() {
        return this.messaging.state.threads[this.props.chatWindow.threadId];
    }

    get chatPartner() {
        return this.messaging.state.partners[this.thread.chatPartnerId];
    }
}
