/** @odoo-module **/

import { LinkPreview } from "./link_preview_model";
import { Partner } from "./partner_model";
import { Thread } from "./thread_model";

import { markup, toRaw } from "@odoo/owl";

import { _t } from "@web/core/l10n/translation";
import { url } from "@web/core/utils/urls";
import { deserializeDateTime } from "@web/core/l10n/dates";

const { DateTime } = luxon;

export class Message {
    /**
     * @param {import("@mail/new/core/messaging").Messaging['state']} state
     * @param {Object} data
     * @param {Thread} thread
     * @returns {Message}
     */
    static insert(state, data, thread) {
        if (data.id in state.messages) {
            return state.messages[data.id];
        }
        const {
            attachment_ids: attachments = [],
            body,
            linkPreviews = [],
            starred_partner_ids: starredPartnerIds = [],
            ...remainingData
        } = data;
        const message = new Message({
            ...remainingData,
            body: markup(body),
            isStarred: starredPartnerIds.includes(state.user.partnerId),
        });
        Object.assign(message, {
            author: Partner.insert(state, data.author),
            attachments: attachments.map((attachment) => ({
                ...attachment,
                extension: attachment.name.split('.').pop(),
                originThread: Thread.insert(state, attachment.originThread[0][1]),
            })),
            linkPreviews: linkPreviews.map((data) => new LinkPreview(data)),
            parentMessage: message.parentMessage
                ? Message.insert(state, message.parentMessage, thread)
                : undefined,
        });
        message.isAuthor = message.author.id === state.user.partnerId;
        state.messages[message.id] = message;
        thread.messages.push(message.id);
        thread.sortMessages();
        // return reactive version
        return state.messages[message.id];
    }

    constructor(data) {
        /** @type {Object[]} **/
        void this.attachments;
        /** @type {Partner} **/
        void this.author;
        /** @type {String} **/
        void this.body;
        /** @type {Number|String} **/
        void this.id;
        /** @type {Boolean} **/
        void this.isAuthor;
        /** @type {Boolean} **/
        void this.isDiscussion;
        /** @type {Boolean} **/
        void this.isNote;
        /** @type {Boolean} **/
        void this.isNotification;
        /** @type {Boolean} **/
        void this.isStarred;
        /** @type {Boolean} **/
        void this.isTransient;
        /** @type {LinkPreview[]} **/
        void this.linkPreviews;
        /** @type {Message|undefined} **/
        void this.parentMessage;
        /** @type {Object[]} **/
        void this.reactions;
        /** @type {String} **/
        void this.recordName;
        /** @type {Number|String} */
        void this.resId;
        /** @type {String|undefined} **/
        void this.resModel;
        /** @type {String} **/
        void this.subtypeDescription;
        /** @type {Object[]} **/
        void this.trackingValues;
        /** @type {String} **/
        void this.type;
        this.now = DateTime.now();

        const {
            is_discussion: isDiscussion,
            is_note: isNote,
            is_transient: isTransient,
            message_type: type,
            messageReactionGroups: reactions = [],
            model: resModel,
            record_name: recordName,
            res_id: resId,
            subtype_description: subtypeDescription,
            ...remainingData
        } = data;
        Object.assign(this, {
            isDiscussion,
            isNote,
            isNotification: type === "notification" && resModel === "mail.channel",
            isTransient,
            reactions,
            recordName,
            resId,
            resModel,
            subtypeDescription,
            trackingValues: data.trackingValues || [],
            type,
        });
        for (const key in remainingData) {
            this[key] = remainingData[key];
        }
    }

    get url() {
        return `${url("/web")}#model=${this.resModel}&id=${this.id}`;
    }

    get dateTime() {
        return toRaw(this.date ? deserializeDateTime(this.date) : this.now);
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
