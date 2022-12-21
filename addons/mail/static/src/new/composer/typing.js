/* @odoo-module */

import { Component } from "@odoo/owl";
import { sprintf } from "@web/core/utils/strings";
import { useMessaging } from "../messaging_hook";

import { _t } from "@web/core/l10n/translation";

/**
 * @typedef {Object} Props
 * @property {number} channel_id
 * @property {string} size
 * @property {boolean} displayText
 * @extends {Component<Props, Env>}
 */
export class Typing extends Component {
    static defaultProps = {
        size: "small",
        displayText: true,
    };
    static props = ["channel_id", "size?", "displayText?"];
    static template = "mail.typing";

    setup() {
        this.messaging = useMessaging();
    }

    get isTyping() {
        return this.messaging.isTyping(this.props.channel_id);
    }

    /** @returns {boolean|string} */
    get text() {
        if (this.isTyping) {
            const channelAreTyping = this.messaging.state.areTyping[this.props.channel_id];
            if (channelAreTyping.length === 1) {
                return sprintf(_t("%s is typing..."), channelAreTyping[0]);
            }
            if (channelAreTyping.length === 2) {
                return sprintf(
                    _t("%s and %s are typing..."),
                    channelAreTyping[0],
                    channelAreTyping[1]
                );
            }
            return sprintf(
                _t("%s, %s and more are typing..."),
                channelAreTyping[0],
                channelAreTyping[1]
            );
        }
        return false;
    }
}
