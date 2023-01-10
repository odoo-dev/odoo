/* @odoo-module */

import { Component, onWillUpdateProps, onWillStart, useState } from "@odoo/owl";
import { useMessaging } from "@mail/new/core/messaging_hook";
import { PartnerImStatus } from "./partner_im_status";
import { useService } from "@web/core/utils/hooks";

export class ChannelMemberList extends Component {
    static components = { PartnerImStatus };
    static props = ["thread", "className"];
    static template = "mail.channel_member_list";

    setup() {
        this.messaging = useMessaging();
        this.threadService = useState(useService("mail.thread"));
        onWillStart(() => this.threadService.fetchChannelMembers(this.props.thread));
        onWillUpdateProps((nextProps) => {
            if (nextProps.thread.channelMembers.length === 0) {
                this.threadService.fetchChannelMembers(nextProps.thread);
            }
        });
    }

    openChatAvatar(member) {
        if (member.isCurrentUser) {
            return;
        }
        this.threadService.openChat({ partnerId: member.persona.partner?.id });
    }
}
