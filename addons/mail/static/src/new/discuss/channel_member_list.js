/* @odoo-module */

import { Component, onWillUpdateProps, onWillStart } from "@odoo/owl";
import { useMessaging } from "@mail/new/messaging_hook";
import { PartnerImStatus } from "./partner_im_status";

export class ChannelMemberList extends Component {
    static components = { PartnerImStatus };
    static props = ["thread", "className"];
    static template = "mail.channel_member_list";

    setup() {
        this.messaging = useMessaging();
        onWillStart(() => this.messaging.fetchChannelMembers(this.props.thread));
        onWillUpdateProps((nextProps) => {
            if (nextProps.thread.channelMembers.length === 0) {
                this.messaging.fetchChannelMembers(nextProps.thread);
            }
        });
    }

    openChatAvatar(member) {
        if (member.isCurrentUser) {
            return;
        }
        this.messaging.openChat({ partnerId: member.partner.id });
    }
}
