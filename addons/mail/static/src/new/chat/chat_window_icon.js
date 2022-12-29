/* @odoo-module */

import { Component } from "@odoo/owl";
import { useMessaging } from "../messaging_hook";
import { Typing } from "../composer/typing";

/**
 * @typedef {Object} Props
 * @property {string} threadLocalId
 * @property {string} size
 * @property {string} className
 * @extends {Component<Props, Env>}
 */
export class ChatWindowIcon extends Component {
    static template = "mail.chat_window_icon";
    static components = { Typing };
    static props = ["threadLocalId", "size?", "className?"];
    static defaultProps = {
        size: "medium",
        className: "",
    };

    setup() {
        this.messaging = useMessaging();
    }

    get thread() {
        return this.messaging.state.threads[this.props.threadLocalId];
    }

    get chatPartner() {
        return this.messaging.state.partners[this.thread.chatPartnerId];
    }
}
