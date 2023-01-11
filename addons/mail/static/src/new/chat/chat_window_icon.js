/* @odoo-module */

import { Component } from "@odoo/owl";
import { useStore } from "../core/messaging_hook";
import { Typing } from "../composer/typing";
import { createLocalId } from "../core/thread_model.create_local_id";

/**
 * @typedef {Object} Props
 * @property {import("@mail/new/core/thread_model").Thread} thread
 * @property {string} size
 * @property {string} className
 * @extends {Component<Props, Env>}
 */
export class ChatWindowIcon extends Component {
    static template = "mail.chat_window_icon";
    static components = { Typing };
    static props = ["thread", "size?", "className?"];
    static defaultProps = {
        size: "medium",
        className: "",
    };

    setup() {
        this.store = useStore();
    }

    get chatPartner() {
        return this.store.personas[createLocalId("partner", this.props.thread.chatPartnerId)];
    }
}
