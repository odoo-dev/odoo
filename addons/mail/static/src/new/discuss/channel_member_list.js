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
        onWillUpdateProps((nextProps) => {
            if (nextProps.thread.channelMembers.length === 0) {
                this.fetchChannelMembers(nextProps);
            }
        });
    }

    async fetchChannelMembers(props) {
        const results = await this.messaging.orm.call(
            "mail.channel",
            "load_more_members",
            [[props.thread.id]],
            {
                known_member_ids: props.thread.channelMembers.map(
                    (channelMember) => channelMember.id
                ),
            }
        );
        const channelMembers = results["channelMembers"][0][1];
        props.thread.memberCount = results["memberCount"];
        for (const channelMember of channelMembers) {
            const partnerId = channelMember["persona"]["partner"]["id"];
            const name = channelMember["persona"]["partner"]["name"];
            Partner.insert(this.messaging.state, {
                id: partnerId,
                name: name,
            });
            ChannelMember.insert(this.messaging.state, {
                id: channelMember.id,
                partnerId,
                threadId: props.thread.id,
            });
        }
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
