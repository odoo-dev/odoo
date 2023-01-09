/* @odoo-module */

import { LinkPreview } from "./link_preview_model";
import { MessageReactions } from "./message_reactions_model";
import { Partner } from "./partner_model";
import { Thread } from "./thread_model";
import { Notification } from "./notification_model";
import { htmlToTextContentInline } from "@mail/new/utils/format";

import { toRaw } from "@odoo/owl";

import { _t } from "@web/core/l10n/translation";
import { url } from "@web/core/utils/urls";
import { deserializeDateTime } from "@web/core/l10n/dates";
import { Attachment } from "./attachment_model";

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
    isDiscussion;
    /** @type {boolean} */
    isNote;
    /** @type {boolean} */
    isStarred;
    /** @type {boolean} */
    isTransient;
    /** @type {LinkPreview[]} */
    linkPreviews = [];
    /** @type {number[]} */
    needaction_partner_ids = [];
    /** @type {Message|undefined} */
    parentMessage;
    /** @type {MessageReactions[]} */
    reactions = [];
    /** @type {Notification[]} */
    notifications = [];
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
    /** @type {import("@mail/new/core/store_service").Store} */
    _store;

    /**
     * @param {import("@mail/new/core/store_service").Store} store
     * @param {Object} data
     * @param {Thread} [thread]
     * @returns {Message}
     */
    static insert(store, data, thread) {
        let message;
        thread ??= Thread.insert(store, { model: data.model, id: data.res_id });
        if (data.id in store.messages) {
            message = store.messages[data.id];
        } else {
            message = new Message();
            message._store = store;
        }
        message.update(store, data, thread);
        store.messages[message.id] = message;
        message.updateNotifications();
        // return reactive version
        return store.messages[message.id];
    }

    update(store, data, thread) {
        const {
            attachment_ids: attachments = this.attachments,
            body = this.body,
            is_discussion: isDiscussion = this.isDiscussion,
            is_note: isNote = this.isNote,
            is_transient: isTransient = this.isTransient,
            linkPreviews = this.linkPreviews,
            message_type: type = this.type,
            model: resModel = this.resModel,
            needaction_partner_ids = this.needaction_partner_ids,
            res_id: resId = this.resId,
            subject = this.subject,
            subtype_description: subtypeDescription = this.subtypeDescription,
            starred_partner_ids = this.starred_partner_ids,
            notifications = this.notifications,
            ...remainingData
        } = data;
        for (const key in remainingData) {
            this[key] = remainingData[key];
        }
        Object.assign(this, {
            attachments: attachments.map((attachment) =>
                Attachment.insert(this._store, attachment)
            ),
            author: data.author ? Partner.insert(this._store, data.author) : this.author,
            body,
            isDiscussion,
            isNote,
            isStarred: starred_partner_ids.includes(this._store.user.partnerId),
            isTransient,
            linkPreviews: linkPreviews.map((data) => new LinkPreview(data)),
            needaction_partner_ids,
            parentMessage: this.parentMessage
                ? Message.insert(this._store, this.parentMessage, this.parentMessage.originThread)
                : undefined,
            resId,
            resModel,
            starred_partner_ids,
            subject,
            subtypeDescription,
            trackingValues: data.trackingValues || [],
            type,
            notifications,
        });
        if (data.record_name) {
            this.originThread.name = data.record_name;
        }
        if (data.res_model_name) {
            this.originThread.modelName = data.res_model_name;
        }
        this._updateReactions(data.messageReactionGroups);
        store.messages[this.id] = this;
        if (thread) {
            if (!thread.messages.includes(this.id)) {
                thread.messages.push(this.id);
                thread.sortMessages();
            }
        }
        if (this.isNeedaction && !this._store.discuss.inbox.messages.includes(this.id)) {
            this._store.discuss.inbox.counter++;
            this.originThread.message_needaction_counter++;
            this._store.discuss.inbox.messages.push(this.id);
            this._store.discuss.inbox.sortMessages();
        }
    }

    updateNotifications() {
        this.notifications = this.notifications.map((notification) =>
            Notification.insert(this._store, { ...notification, messageId: this.id })
        );
    }

    _updateReactions(reactionGroups = []) {
        const reactionContentToUnlink = new Set();
        const reactionsToInsert = [];
        for (const rawReaction of reactionGroups) {
            const [command, reactionData] = Array.isArray(rawReaction)
                ? rawReaction
                : ["insert", rawReaction];
            const reaction = MessageReactions.insert(this._store, reactionData);
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

    /**
     * @returns {boolean}
     */
    get canBeEdited() {
        if (this.isEmpty) {
            return false;
        }
        if (!this._store.user.isAdmin && !this.isAuthoredByCurrentUser) {
            return false;
        }
        if (this.type !== "comment") {
            return false;
        }
        return this.isNote || this.resModel === "mail.channel";
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

    get dateTimeSimpleStr() {
        return this.dateTime.toLocaleString(DateTime.TIME_SIMPLE);
    }

    get dateTimeStr() {
        return this.dateTime.toLocaleString(DateTime.DATETIME_SHORT);
    }

    get isAuthoredByCurrentUser() {
        if (!this.author) {
            return false;
        }
        return this.author.id === this._store.user.partnerId;
    }

    get isNeedaction() {
        return this.needaction_partner_ids.includes(this._store.user.partnerId);
    }

    get isNotification() {
        return this.type === "notification" && this.resModel === "mail.channel";
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
        return Thread.insert(this._store, { id: this.resId, model: this.resModel });
    }

    get url() {
        return `${url("/web")}#model=${this.resModel}&id=${this.id}`;
    }

    get isBodyEmpty() {
        return (
            !this.body ||
            ["", "<p></p>", "<p><br></p>", "<p><br/></p>"].includes(this.body.replace(/\s/g, ""))
        );
    }

    get isEmpty() {
        return (
            this.isBodyEmpty &&
            this.attachments.length === 0 &&
            this.trackingValues.length === 0 &&
            !this.subtypeDescription
        );
    }

    get inlineBody() {
        return htmlToTextContentInline(this.body);
    }

    get failureNotifications() {
        return this.notifications.filter((notification) => notification.isFailure);
    }
}
