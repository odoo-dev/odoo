import { Component } from "@odoo/owl";

export class MessageNotificationPopover extends Component {
    static template = "mail.MessageNotificationPopover";
    static props = ["message", "close?"];

    isPartnerInCc(partnerId) {
        return (this.props.message.partner_cc_ids ?? []).includes(partnerId);
    }

    isSplitEmailInCc(splitEmail) {
        const normalizedEmail = this._getEmailFromSplitEmail(splitEmail);
        return this.props.message.incoming_email_cc.some(
            (splitEmail2) => normalizedEmail === this._getEmailFromSplitEmail(splitEmail2)
        );
    }

    _getEmailFromSplitEmail(emailArr) {
        return (emailArr?.[1] ?? "").trim().toLowerCase();
    }
}
