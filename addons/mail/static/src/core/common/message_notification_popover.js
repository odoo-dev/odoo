import { Component, props, types } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";

export class MessageNotificationPopover extends Component {
    static template = "mail.MessageNotificationPopover";

    setup() {
        super.setup(...arguments);
        this.store = useService("mail.store");
        this.props = props({
            message: types.instanceOf(this.store["mail.message"].Class),
        });
    }

    get recipientsData() {
        const message = this.props.message;
        const messagePartnerCcIds = message.partner_cc_ids ?? [];
        const toTitle = _t("To"),
            ccTitle = _t("Cc");
        const orderFollower = 3,
            orderIncoming = 2,
            orderOther = 1;
        const sectionOrderTo = 0,
            sectionOrderCc = 10,
            sectionOrderUnknown = 20;
        const data = this.props.message.notification_ids.map((notification) => {
            const email = notification.mail_email_address || notification.res_partner_id?.email;
            const failure = notification.isFailure && notification.failureMessage;
            const isFollower = notification._proxy.isFollowerNotification;
            if (!notification.res_partner_id) {
                return {
                    email,
                    failure,
                    order: sectionOrderUnknown + (isFollower ? orderFollower : orderOther),
                };
            }
            const isCc = messagePartnerCcIds.includes(notification.res_partner_id);
            return {
                name: message.getPersonaName(notification.res_partner_id),
                email,
                recipientTypeTitle: isCc ? ccTitle : toTitle,
                failure,
                order:
                    (isCc ? sectionOrderCc : sectionOrderTo) +
                    (isFollower ? orderFollower : orderOther),
                notification: notification,
            };
        });
        const incoming_email_cc = message.incoming_email_cc || [];
        incoming_email_cc.concat(message.incoming_email_to || []).forEach((incomingEmail) => {
            const [name, email] = incomingEmail;
            const normalizedEmail = (email ?? "").trim().toLowerCase();
            const isCc = incoming_email_cc.some(
                ([_, email2]) => normalizedEmail === (email2 ?? "").trim().toLowerCase()
            );
            data.push({
                name,
                email,
                recipientTypeTitle: isCc ? ccTitle : toTitle,
                order: (isCc ? sectionOrderCc : sectionOrderTo) + orderIncoming,
            });
        });
        return data.sort((r1, r2) => r1.order - r2.order).map(({ order, ...filtered }) => filtered);
    }
}
