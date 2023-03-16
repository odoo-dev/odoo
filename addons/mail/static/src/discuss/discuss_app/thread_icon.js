/* @odoo-module */

import { Component } from "@odoo/owl";
import { useStore } from "@mail/discuss/core/messaging_hook";
import { Typing } from "@mail/discuss/composer/typing";
import { createLocalId } from "@mail/discuss/utils/misc";

/**
 * @typedef {Object} Props
 * @property {import("@mail/discuss/core/thread_model").Thread} thread
 * @property {string} size
 * @property {string} className
 * @extends {Component<Props, Env>}
 */
export class ThreadIcon extends Component {
    static template = "mail.ThreadIcon";
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
