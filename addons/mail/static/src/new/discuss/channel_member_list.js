/* @odoo-module */

import { Component, onWillUpdateProps, onWillStart } from "@odoo/owl";
import { useMessaging } from "@mail/new/messaging_hook";
import { PartnerImStatus } from "./partner_im_status";
import { Partner } from "../core/partner_model";
import { ChannelMember } from "../core/channel_member_model";

export class ChannelMemberList extends Component {
    setup() {
        this.messaging = useMessaging();
        onWillStart(() => this.fetchChannelMembers(this.props));
        onWillUpdateProps((nextProps) => this.fetchChannelMembers(nextProps));
    }

    async fetchChannelMembers(props) {
        const domain = [["channel_id", "=", props.thread.id]];
        const fields = ["partner_id"];
        const results = await this.messaging.orm.searchRead(
            "mail.channel.member",
            domain,
            fields,
            {}
        );
        const members = [];
        for (const mailChannelMember of results) {
            const partnerId = mailChannelMember.partner_id[0];
            const name = mailChannelMember.partner_id[1];
            Partner.insert(this.messaging.state, {
                id: partnerId,
                name: name,
            });
            members.push(
                new ChannelMember(this.messaging.state, { id: mailChannelMember.id, partnerId })
            );
        }
        props.thread.channelMembers = members;
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
