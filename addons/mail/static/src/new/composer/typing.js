/* @odoo-module */

import { Component } from "@odoo/owl";
import { sprintf } from "@web/core/utils/strings";
import { useMessaging } from "../messaging_hook";

export class Typing extends Component {
    static defaultProps = {
        size: "small",
    };
    static props = ["channel_id", "size?"];
    static template = "mail.typing";

    setup() {
        this.messaging = useMessaging();
    }

    /** @type {boolean|string} */
    get text() {
        if (this.messaging.state.areTyping[this.props.channel_id]) {
            const channelAreTyping = this.messaging.state.areTyping[this.props.channel_id];
            if (channelAreTyping.length === 1) {
                return sprintf(this.env._t("%s is typing..."), channelAreTyping[0]);
            }
            if (channelAreTyping.length === 2) {
                return sprintf(
                    this.env._t("%s and %s are typing..."),
                    channelAreTyping[0],
                    channelAreTyping[1]
                );
            }
            return sprintf(
                this.env._t("%s, %s and more are typing..."),
                channelAreTyping[0],
                channelAreTyping[1]
            );
        }
        return false;
    }
}
