/* @odoo-module */

import { Component } from "@odoo/owl";
import { PartnerImStatus } from "@mail/new/discuss/partner_im_status";
import { RelativeTime } from "../thread/relative_time";

export class NotificationItem extends Component {
    static components = { RelativeTime, PartnerImStatus };
    static props = [
        "displayName",
        "body?",
        "slots?",
        "isLast",
        "count?",
        "dateTime?",
        "iconSrc",
        "onClick",
    ];
    static template = "mail.notification_item";
}
