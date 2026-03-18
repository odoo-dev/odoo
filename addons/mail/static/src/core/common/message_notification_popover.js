import { Component } from "@odoo/owl";

export class MessageNotificationPopover extends Component {
    static template = "mail.MessageNotificationPopover";
    static props = ["message", "close?"];

    isPartnerInCc(partnerId) {
        return (this.props.message.partner_cc_ids ?? []).includes(partnerId);
    }
}
