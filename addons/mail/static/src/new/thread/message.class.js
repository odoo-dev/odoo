/** @odoo-module */

import { Partner } from "../partner.class";
import { deserializeDateTime } from "@web/core/l10n/dates";
import { LinkPreview } from "./link_preview/link_preview.class";
import { url } from "@web/core/utils/urls";

const { DateTime } = luxon;

export class Message {
    /**
     * @type {Number}
     */
    id;
    attachments = [];
    type;
    body;
    date;
    needaction;
    parentMessage;
    subtypeDescription;
    trackingValues;
    linkPreviews = [];
    starred_partner_ids = [];
    /**
     * @type {import("../messaging_hook").Messaging};
     */
    messaging;
    env;
    record_name;
    res_id;
    model;
    author;

    constructor(env, data) {
        this.env = env;
        this.messaging = env.services["mail.messaging"];
        Object.assign(this, data);
        if (this.id in this.messaging.messages) {
            return this.messaging.messages[this.id];
        }
        this.author = new Partner(this.env, { id: data.author.id, name: data.author.name });
        for (const linkPreview in data.linkPreviews) {
            this.linkPreviews.push(new LinkPreview(linkPreview));
        }
        if (data.parentMessage) {
            this.parentMessage = new Message(env, data.parentMessage);
        }
        this.messaging.messages[this.id] = this;
    }

    get isNotification() {
        return this.type === "notification" && this.model === "mail.channel";
    }

    get url() {
        return `${url("/web")}#model=${this.model}&id=${this.res_id}`;
    }

    get isAuthor() {
        return this.author.id === this.messaging.user.partnerId;
    }

    get isStarred() {
        return this.starred_partner_ids.includes(this.messaging.user.partnerId);
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
            dateDay = this.env._t("Today");
        }
        return dateDay;
    }
}
