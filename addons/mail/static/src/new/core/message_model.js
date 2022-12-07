/* @odoo-module */

import { LinkPreview } from "./link_preview_model";
import { MessageReactions } from "./message_reactions_model";
import { Partner } from "./partner_model";
import { Thread } from "./thread_model";

import { toRaw } from "@odoo/owl";

import { _t } from "@web/core/l10n/translation";
import { url } from "@web/core/utils/urls";
import { deserializeDateTime } from "@web/core/l10n/dates";

const { DateTime } = luxon;

export class Message {
    /** @type {Object[]} */
    attachments = [];
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
    isNotification;
    /** @type {boolean} */
    isStarred;
    /** @type {boolean} */
    isTransient;
    /** @type {LinkPreview[]} */
    linkPreviews = [];
    /** @type {Message|undefined} */
    parentMessage;
    /** @type {MessageReactions[]} */
    reactions = [];
    /** @type {string} */
    recordName;
    /** @type {number|string} */
    resId;
    /** @type {string|undefined} */
    resModel;
    /** @type {Number[]} */
    starred_partner_ids = [];
    /** @type {string} */
    subject;
    /** @type {string} */
    subtypeDescription;
    /** @type {Object[]} */
    trackingValues;
    /** @type {string} */
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
            attachment_ids: attachments = this.attachments,
            body = this.body,
            is_discussion: isDiscussion = this.isDiscussion,
            is_note: isNote = this.isNote,
            is_transient: isTransient = this.isTransient,
            linkPreviews = this.linkPreviews,
            message_type: type = this.type,
            model: resModel = this.resModel,
            record_name: recordName = this.recordName,
            res_id: resId = this.resId,
            subject = this.subject,
            subtype_description: subtypeDescription = this.subtypeDescription,
            starred_partner_ids = this.starred_partner_ids,
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
            author: data.author ? Partner.insert(this._state, data.author) : this.author,
            body,
            isDiscussion,
            isNote,
            isNotification: type === "notification" && resModel === "mail.channel",
            isStarred: starred_partner_ids.includes(this._state.user.partnerId),
            isTransient,
            linkPreviews: linkPreviews.map((data) => new LinkPreview(data)),
            parentMessage: this.parentMessage
                ? Message.insert(this._state, this.parentMessage, thread)
                : undefined,
            recordName,
            resId,
            resModel,
            subject,
            subtypeDescription,
            trackingValues: data.trackingValues || [],
            type,
        });
        this._updateReactions(data.messageReactionGroups);
        if (this.author) {
            this.isAuthor = this.author.id === this._state.user.partnerId;
        }
        if (thread) {
            if (!thread.messages.includes(this.id)) {
                thread.messages.push(this.id);
                thread.sortMessages();
            }
        }
    }

    _updateReactions(reactionGroups = []) {
        const reactionContentToUnlink = new Set();
        const reactionsToInsert = [];
        for (const rawReaction of reactionGroups) {
            const [command, reactionData] = Array.isArray(rawReaction)
                ? rawReaction
                : ["insert", rawReaction];
            const reaction = MessageReactions.insert(this._state, reactionData);
            if (command === "insert") {
                reactionsToInsert.push(reaction);
            } else {
                reactionContentToUnlink.add(reaction.content);
            }
        }
        this.reactions = this.reactions.filter(
            ({ content }) => !reactionContentToUnlink.has(content)
        );
        reactionsToInsert.forEach((reaction) => {
            const idx = this.reactions.findIndex(({ content }) => reaction.content === content);
            if (idx !== -1) {
                this.reactions[idx] = reaction;
            } else {
                this.reactions.push(reaction);
            }
        });
    }

    get dateDay() {
        let dateDay = this.dateTime.toLocaleString(DateTime.DATE_FULL);
        if (dateDay === DateTime.now().toLocaleString(DateTime.DATE_FULL)) {
            dateDay = _t("Today");
        }
        return dateDay;
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
