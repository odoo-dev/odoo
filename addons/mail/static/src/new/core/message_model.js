/** @odoo-module **/

import { LinkPreview } from "./link_preview_model";
import { Partner } from "./partner_model";
import { Thread } from "./thread_model";

import { markup, markRaw } from "@odoo/owl";

import { _t } from "@web/core/l10n/translation";
import { url } from "@web/core/utils/urls";
import { deserializeDateTime } from "@web/core/l10n/dates";

const { DateTime } = luxon;

export class Message {
    constructor(data) {
        const {
            date,
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
        const now = DateTime.now();
        const dateTime = markRaw(date ? deserializeDateTime(date) : now);
        let dateDay = dateTime.toLocaleString(DateTime.DATE_FULL);
        if (dateDay === now.toLocaleString(DateTime.DATE_FULL)) {
            dateDay = _t("Today");
        }
        Object.assign(this, {
            dateDay,
            dateTime,
            dateTimeStr: dateTime.toLocaleString(DateTime.DATETIME_SHORT),
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
            url: `${url("/web")}#model=${resModel}&id=${resId}`,
        });
        for (const key in remainingData) {
            this[key] = remainingData[key];
        }
    }

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
            body: typeof body === "string" ? markup(body) : body,
            isStarred: starredPartnerIds.includes(state.user.partnerId),
        });
        Object.assign(message, {
            author: Partner.insert(state, data.author),
            attachments: attachments.map((attachment) => ({
                ...attachment,
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
}
