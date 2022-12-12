/* @odoo-module */

import { Component, onWillUpdateProps, onWillStart } from "@odoo/owl";
import { useMessaging } from "@mail/new/messaging_hook";
import { PartnerImStatus } from "./partner_im_status";

export class ChannelMemberList extends Component {
    setup() {
        this.messaging = useMessaging();
        onWillStart(() => this.messaging.fetchChannelMembers(this.props.thread.localId));
        onWillUpdateProps((nextProps) => {
            if (nextProps.thread.channelMembers.length === 0) {
                this.messaging.fetchChannelMembers(nextProps.thread.localId);
            }
        });
    }

    openChatAvatar(member) {
        if (member.isCurrentUser) {
            this.messaging.openChat({ partnerId: member.partner.id });
        }
    }
}

Object.assign(ChannelMemberList, {
    components: { PartnerImStatus },
    props: ["thread", "className"],
    template: "mail.channel_member_list",
});
