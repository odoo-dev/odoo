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
    /** @type {Object[]} **/
    attachments;
    /** @type {Partner} **/
    author;
    /** @type {String} **/
    body;
    /** @type {Number|String} **/
    id;
    /** @type {Boolean} **/
    isAuthor;
    /** @type {Boolean} **/
    isDiscussion;
    /** @type {Boolean} **/
    isNote;
    /** @type {Boolean} **/
    isNotification;
    /** @type {Boolean} **/
    isStarred;
    /** @type {Boolean} **/
    isTransient;
    /** @type {LinkPreview[]} **/
    linkPreviews;
    /** @type {Message|undefined} **/
    parentMessage;
    /** @type {Object[]} **/
    reactions;
    /** @type {String} **/
    recordName;
    /** @type {Number|String} */
    resId;
    /** @type {String|undefined} **/
    resModel;
    /** @type {String} **/
    subtypeDescription;
    /** @type {Object[]} **/
    trackingValues;
    /** @type {String} **/
    type;
    now = DateTime.now();

    /**
     * @param {import("@mail/new/core/messaging").Messaging['state']} state
     * @param {Object} data
     * @param {Thread} thread
     * @returns {Message}
     */
    static insert(state, data, thread) {
        let message;
        if (data.id in state.messages) {
            message = state.messages[data.id];
        } else {
            message = new Message();
            message._state = state;
        }
        message.update(data, thread);
        state.messages[message.id] = message;
        // return reactive version
        return state.messages[message.id];
    }

    update(data, thread) {
        const {
            attachment_ids: attachments = [],
            body,
            is_discussion: isDiscussion,
            is_note: isNote,
            is_transient: isTransient,
            linkPreviews = [],
            message_type: type,
            messageReactionGroups: reactions = [],
            model: resModel,
            record_name: recordName,
            res_id: resId,
            subtype_description: subtypeDescription,
            starred_partner_ids = [],
            ...remainingData
        } = data;
        for (const key in remainingData) {
            this[key] = remainingData[key];
        }
        Object.assign(this, {
            attachments: attachments.map((attachment) => ({
                ...attachment,
                extension: attachment.name.split(".").pop(),
                originThread: Thread.insert(this._state, attachment.originThread[0][1]),
            })),
            author: Partner.insert(this._state, data.author),
            body: markup(body),
            isDiscussion,
            isNote,
            isNotification: type === "notification" && resModel === "mail.channel",
            isStarred: starred_partner_ids.includes(this._state.user.partnerId),
            isTransient,
            linkPreviews: linkPreviews.map((data) => new LinkPreview(data)),
            parentMessage: this.parentMessage
                ? Message.insert(this._state, this.parentMessage, thread)
                : undefined,
            reactions,
            recordName,
            resId,
            resModel,
            subtypeDescription,
            trackingValues: data.trackingValues || [],
            type,
        });
        this.isAuthor = this.author.id === this._state.user.partnerId;
        if (thread) {
            if (!thread.messages.includes(this.id)) {
                thread.messages.push(this.id);
                thread.sortMessages();
            }
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
