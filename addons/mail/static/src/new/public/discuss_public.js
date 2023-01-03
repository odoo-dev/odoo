/* @odoo-module */

import { Component } from "@odoo/owl";
import { Discuss } from "./../discuss/discuss";
import { useMessaging } from "../core/messaging_hook";
import { Thread } from "../core/thread_model";
import { useService } from "@web/core/utils/hooks";

export class DiscussPublic extends Component {
    static components = { Discuss };
    static props = ["data"];
    static template = "mail.discuss_public";

    setup() {
        this.messaging = useMessaging();
        this.threadService = useService("mail.thread");
        this.thread = Thread.insert(this.messaging.state, {
            ...this.props.data.channelData.channel,
            model: "mail.channel",
            type: this.props.data.channelData.channel.channel_type,
        });
        this.threadService.setDiscussThread(this.thread);
    }
}
