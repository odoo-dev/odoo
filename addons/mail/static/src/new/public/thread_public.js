/* @odoo-module */

import { Component } from "@odoo/owl";
import { useMessaging } from "../core/messaging_hook";
import { Thread as ThreadModel } from "../core/thread_model";
import { Thread } from "../thread/thread";
import { ThreadIcon } from "../discuss/thread_icon";
import { ChannelMemberList } from "../discuss/channel_member_list";
import { Composer } from "../composer/composer";

export class ThreadPublic extends Component {
    static components = { Thread, ThreadIcon, ChannelMemberList, Composer };
    static props = ["data"];
    static template = "mail.thread_public";
    setup() {
        this.messaging = useMessaging();
    }

    get thread() {
        return ThreadModel.insert(this.messaging.state, {
            ...this.props.data.channelData.channel,
            model: "mail.channel",
            type: this.props.data.channelData.channel.channel_type,
        });
    }
}
