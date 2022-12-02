/* @odoo-module */

import { LinkPreview } from "./link_preview_model";
import { Partner } from "./partner_model";
import { Thread } from "./thread_model";

import { toRaw } from "@odoo/owl";

import { _t } from "@web/core/l10n/translation";
import { url } from "@web/core/utils/urls";
import { deserializeDateTime } from "@web/core/l10n/dates";

const { DateTime } = luxon;

export class Message {
    /** @type {import("@mail/new/core/messaging").Messaging['state']} state */
    _state;
    /** @type {Object[]} */
    attachments;
    /** @type {Partner} */
    author;
    /** @type {string} */
    body;
    /** @type {number|string} */
    id;
    /** @type {boolean} */
    isAuthor;
    /** @type {boolean} */
    isDiscussion;
    /** @type {boolean} */
    isNote;
    /** @type {boolean} */
    isTransient;
    /** @type {LinkPreview[]} */
    linkPreviews;
    /** @type {boolean} */
    needaction;
    /** @type {DateTime} */
    now = DateTime.now();
    /** @type {Message|undefined} */
    parentMessage;
    /** @type {Object[]} */
    reactions;
    /** @type {string} */
    recordName;
    /** @type {number|string} */
    resId;
    /** @type {string|undefined} */
    resModel;
    /** @type {string} */
    subject;
    /** @type {number[]} */
    starredPartnerIds;
    /** @type {string} */
    subtypeDescription;
    /** @type {Object[]} */
    trackingValues;
    /** @type {'email'|'comment'|'notification'|'user_notification'} */
    type;

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

    /**
     * @param {Object} data
     * @param {Thread} thread
     */
    update(data, thread) {
        Object.assign(this, {
            attachments: data.attachment_ids
                ? data.attachment_ids.map((attachment) => ({
                      ...attachment,
                      extension: attachment.name.split(".").pop(),
                      originThread: Thread.insert(this._state, attachment.originThread[0][1]),
                  }))
                : [],
            author: Partner.insert(this._state, data.author),
            body: data.body,
            date: data.date,
            id: data.id,
            isDiscussion: data.is_discussion,
            isNote: data.is_note,
            isTransient: data.is_transient || false,
            linkPreviews: data.linkPreviews
                ? data.linkPreviews.map((data) => new LinkPreview(data))
                : [],
            needaction: data.needaction,
            parentMessage: data.parentMessage
                ? Message.insert(this._state, data.parentMessage, thread)
                : undefined,
            resModel: data.model,
            reactions: data.messageReactionGroups || [],
            recordName: data.record_name,
            resId: data.res_id,
            starredPartnerIds: data.starred_partner_ids || [],
            subtypeDescription: data.subtype_description,
            type: data.message_type,
            trackingValues: data.trackingValues || [],
        });
        if (thread) {
            if (!thread.messages.includes(this.id)) {
                thread.messages.push(this.id);
                thread.sortMessages();
            }
        }
    }

    get dateDay() {
        let dateDay = this.dateTime.toLocaleString(DateTime.DATE_FULL);
        if (dateDay === DateTime.now().toLocaleString(DateTime.DATE_FULL)) {
            dateDay = _t("Today");
        }
        return dateDay;
    }

    get isStarred() {
        return this.starredPartnerIds.includes(this._state.user.partnerId);
    }

    get isNotification() {
        return this.type === "notification" && this.resModel === "mail.channel";
    }

    get isAuthor() {
        return this.author.id === this._state.user.partnerId;
    }

    get dateTime() {
        return toRaw(this.date ? deserializeDateTime(this.date) : this.now);
    }

    get dateTimeStr() {
        return this.dateTime.toLocaleString(DateTime.DATETIME_SHORT);
    }

    get isSubjectSimilarToOriginThreadName() {
        if (!this.subject || !this.originThread || !this.originThread.name) {
            return false;
        }
        const cleanedThreadName = this.originThread.name.trim().toLowerCase();
        const cleanedSubject = this.subject.trim().toLowerCase();
        if (cleanedSubject === cleanedThreadName) {
            return true;
        }
        if (!cleanedSubject.endsWith(cleanedThreadName)) {
            return false;
        }
        const subjectWithoutThreadName = cleanedSubject.slice(
            0,
            cleanedSubject.indexOf(cleanedThreadName)
        );
        const prefixList = ["re", "fw", "fwd"];
        // match any prefix as many times as possible
        const isSequenceOfPrefixes = new RegExp(`^((${prefixList.join("|")}):\\s*)+$`);
        return isSequenceOfPrefixes.test(subjectWithoutThreadName);
    }

    get originThread() {
        const threadLocalId = (() => {
            if (this.resModel === "mail.channel") {
                return this.resId;
            }
            return this.resModel + "," + this.resId;
        })();
        return this._state.threads[threadLocalId];
    }

    get url() {
        return `${url("/web")}#model=${this.resModel}&id=${this.id}`;
    }
}
