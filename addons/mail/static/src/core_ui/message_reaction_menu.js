/** @odoo-module */

import { Component, useState, useExternalListener } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

export class MessageReactionMenu extends Component {
    static props = ["close", "message"];
    static template = "mail.MessageReactionMenu";

    setup() {
        this.state = useState({
            reaction: this.props.message.reactions[0],
        });
        /** @type {import('@mail/core/thread_service').ThreadService} */
        this.threadService = useService("mail.thread");
        useExternalListener(document, "keydown", this.onKeydown);
    }

    onKeydown(ev) {
        switch (ev.key) {
            case "Escape":
                this.props.close();
                break;
            case "q":
                this.props.close();
                break;
            default:
                return;
        }
    }
}
