/** @odoo-module */

import { url } from "@web/core/utils/urls";
import { deserializeDateTime } from "@web/core/l10n/dates";
import { LinkPreview } from "./link_preview_model";
import { Partner } from "./partner_model";
import { _t } from "@web/core/l10n/translation";
import { markup } from "@odoo/owl";

const { DateTime } = luxon;

export class Message {
    attachments = [];
    /** @type {Partner} */
    author;
    id;
    date;
    message_type;
    model;
    needaction;
    /** @type {Message} */
    parentMessage;
    subtype_description;
    trackingValues;
    /** @type {LinkPreview[]} */
    linkPreviews = [];
    starred_partner_ids = [];
    type;
    record_name;
    res_id;
    res_model;

    /**
     * @param {import("@mail/new/messaging").Messaging['state']} state
     * @param {Object} data
     * @returns {Message}
     */
    static insert(state, data) {
        if (data.id in state.messages) {
            return state.messages[data.id];
        }
        const message = new Message(data);
        if (data.parentMessage) {
            message.parentMessage = Message.insert(state, data.parentMessage);
        }
        message.author = Partner.insert(state, { id: data.author.id, name: data.author.name });
        message.body = markup(message.body);
        message.isAuthor = message.author.id === state.user.partnerId;
        message.isStarred = message.starred_partner_ids?.includes(state.user.partnerId);
        state.messages[message.id] = message;
        return state.messages[message.id];
    }

    /**
     * @param {Object} data
     */
    constructor(data) {
        Object.assign(this, data);
        for (const linkPreview in data.linkPreviews) {
            this.linkPreviews.push(new LinkPreview(linkPreview));
        }
    }

    get url() {
        return `${url("/web")}#model=${this.model}&id=${this.res_id}`;
    }

    get isNotification() {
        return this.type === "notification" && this.model === "mail.channel";
    }

    get dateTime() {
        const now = DateTime.now();
        return this.date ? deserializeDateTime(this.date) : now;
    }

    get dateTimeStr() {
        return this.dateTime.toLocaleString(DateTime.DATETIME_SHORT);
    }

    get dateDay() {
        let dateDay = this.dateTime.toLocaleString(DateTime.DATE_FULL);
        if (dateDay === DateTime.now().toLocaleString(DateTime.DATE_FULL)) {
            dateDay = _t("Today");
        }
        return dateDay;
    }
}
