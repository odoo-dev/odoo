/** @odoo-module */

import { markup } from "@odoo/owl";
import { Message } from "../core/message_model";
import { removeFromArray } from "../utils/arrays";
import { convertBrToLineBreak, prettifyMessageContent } from "../utils/format";
import { registry } from "@web/core/registry";
import { createLocalId } from "../core/thread_model.create_local_id";
import { MessageReactions } from "../core/message_reactions_model";
import { Notification } from "../core/notification_model";
import { LinkPreview } from "../core/link_preview_model";
import { NotificationGroup } from "../core/notification_group_model";

const commandRegistry = registry.category("mail.channel_commands");

export class MessageService {
    constructor(env, store, rpc, orm, presence, partner, attachment) {
        this.env = env;
        /** @type {import("@mail/new/core/store_service").Store} */
        this.store = store;
        this.rpc = rpc;
        this.orm = orm;
        this.presence = presence;
        /** @type {import("@mail/new/core/partner_service").PartnerService} */
        this.partner = partner;
        /** @type {import("@mail/new/attachment_viewer/attachment_service").AttachmentService} */
        this.attachment = attachment;
    }

    async update(message, body, attachments = [], rawMentions) {
        if (convertBrToLineBreak(message.body) === body && attachments.length === 0) {
            return;
        }
        const validMentions = this.getMentionsFromText(rawMentions, body);
        const data = await this.rpc("/mail/message/update_content", {
            attachment_ids: attachments
                .map(({ id }) => id)
                .concat(message.attachments.map(({ id }) => id)),
            body: await prettifyMessageContent(body, validMentions),
            message_id: message.id,
        });
        message.body = markup(data.body);
        message.attachments.push(...attachments);
    }

    async delete(message) {
        if (message.isStarred) {
            this.store.discuss.starred.counter--;
            removeFromArray(this.store.discuss.starred.messages, message.id);
        }
        message.body = "";
        message.attachments = [];
        return this.rpc("/mail/message/update_content", {
            attachment_ids: [],
            body: "",
            message_id: message.id,
        });
    }

    getCommandFromText(threadType, content) {
        if (content.startsWith("/")) {
            const firstWord = content.substring(1).split(/\s/)[0];
            const command = commandRegistry.get(firstWord, false);
            if (command) {
                const types = command.channel_types || ["channel", "chat", "group"];
                return types.includes(threadType) ? command : false;
            }
        }
    }

    getMentionsFromText(rawMentions, body) {
        const validMentions = {};
        const partners = [];
        const threads = [];
        const rawMentionedPartnerIds = rawMentions.partnerIds || [];
        const rawMentionedThreadIds = rawMentions.threadIds || [];
        for (const partnerId of rawMentionedPartnerIds) {
            const partner = this.store.partners[partnerId];
            const index = body.indexOf(`@${partner.name}`);
            if (index === -1) {
                continue;
            }
            partners.push(partner);
        }
        for (const threadId of rawMentionedThreadIds) {
            const thread = this.store.threads[createLocalId("mail.channel", threadId)];
            const index = body.indexOf(`#${thread.displayName}`);
            if (index === -1) {
                continue;
            }
            threads.push(thread);
        }
        validMentions.partners = partners;
        validMentions.threads = threads;
        return validMentions;
    }

    /**
     * Create a transient message, i.e. a message which does not come
     * from a member of the channel. Usually a log message, such as one
     * generated from a command with ('/').
     *
     * @param {Object} data
     */
    createTransient(data) {
        const { body, res_id, model } = data;
        const lastMessageId = Object.values(this.store.messages).reduce(
            (lastMessageId, message) => Math.max(lastMessageId, message.id),
            0
        );
        this.insert({
            author: this.store.partnerRoot,
            body,
            id: lastMessageId + 0.01,
            is_note: true,
            is_transient: true,
            res_id,
            model,
        });
    }

    async toggleStar(message) {
        await this.orm.call("mail.message", "toggle_message_starred", [[message.id]]);
    }

    async setDone(message) {
        await this.orm.call("mail.message", "set_message_done", [[message.id]]);
    }

    async unstarAll() {
        // apply the change immediately for faster feedback
        this.store.discuss.starred.counter = 0;
        this.store.discuss.starred.messages = [];
        await this.orm.call("mail.message", "unstar_all");
    }

    async react(message, content) {
        const messageData = await this.rpc("/mail/message/add_reaction", {
            content,
            message_id: message.id,
        });
        this.insert(messageData);
    }

    async removeReaction(reaction) {
        const messageData = await this.rpc("/mail/message/remove_reaction", {
            content: reaction.content,
            message_id: reaction.messageId,
        });
        this.insert(messageData);
    }

    updateStarred(message, isStarred) {
        message.isStarred = isStarred;
        if (isStarred) {
            this.store.discuss.starred.counter++;
            if (this.store.discuss.starred.messages.length > 0) {
                this.store.discuss.starred.messages.push(message.id);
            }
        } else {
            this.store.discuss.starred.counter--;
            removeFromArray(this.store.discuss.starred.messages, message.id);
        }
    }

    /**
     * @param {Object} data
     * @param {boolean} [fromFetch=false]
     * @returns {Message}
     */
    insert(data, fromFetch = false) {
        let message;
        if (data.res_id) {
            // FIXME this prevents cyclic dependencies between mail.thread and mail.message
            this.env.bus.trigger("MESSAGE-SERVICE:INSERT_THREAD", {
                model: data.model,
                id: data.res_id,
            });
        }
        if (data.id in this.store.messages) {
            message = this.store.messages[data.id];
        } else {
            message = new Message();
            message._store = this.store;
        }
        this._update(message, data, fromFetch);
        this.store.messages[message.id] = message;
        this.updateNotifications(message);
        // return reactive version
        return this.store.messages[message.id];
    }

    _update(message, data, fromFetch = false) {
        const {
            attachment_ids: attachments = message.attachments,
            body = message.body,
            is_discussion: isDiscussion = message.isDiscussion,
            is_note: isNote = message.isNote,
            is_transient: isTransient = message.isTransient,
            linkPreviews = message.linkPreviews,
            message_type: type = message.type,
            model: resModel = message.resModel,
            needaction_partner_ids = message.needaction_partner_ids,
            res_id: resId = message.resId,
            subject = message.subject,
            subtype_description: subtypeDescription = message.subtypeDescription,
            starred_partner_ids = message.starred_partner_ids,
            trackingValues = message.trackingValues,
            notifications = message.notifications,
            ...remainingData
        } = data;
        for (const key in remainingData) {
            message[key] = remainingData[key];
        }
        Object.assign(message, {
            attachments: attachments.map((attachment) => this.attachment.insert(attachment)),
            author: data.author ? this.partner.insert(data.author) : message.author,
            body,
            isDiscussion,
            isNote,
            isStarred: starred_partner_ids.includes(this.store.user.partnerId),
            isTransient,
            linkPreviews: linkPreviews.map((data) => new LinkPreview(data)),
            needaction_partner_ids,
            parentMessage: message.parentMessage ? this.insert(message.parentMessage) : undefined,
            resId,
            resModel,
            starred_partner_ids,
            subject,
            subtypeDescription,
            trackingValues,
            type,
            notifications,
        });
        if (data.record_name) {
            message.originThread.name = data.record_name;
        }
        if (data.res_model_name) {
            message.originThread.modelName = data.res_model_name;
        }
        this._updateReactions(message, data.messageReactionGroups);
        this.store.messages[message.id] = message;
        if (message.originThread && !message.originThread.messages.includes(message.id)) {
            message.originThread.messages.push(message.id);
            this.sortMessages(message.originThread);
        }
        if (message.isNeedaction && !this.store.discuss.inbox.messages.includes(message.id)) {
            if (!fromFetch) {
                this.store.discuss.inbox.counter++;
                if (message.originThread) {
                    message.originThread.message_needaction_counter++;
                }
            }
            this.store.discuss.inbox.messages.push(message.id);
            this.sortMessages(this.store.discuss.inbox);
        }
        if (message.isStarred && !this.store.discuss.starred.messages.includes(message.id)) {
            this.store.discuss.starred.messages.push(message.id);
            this.sortMessages(this.store.discuss.starred);
        }
        if (message.isHistory && !this.store.discuss.history.messages.includes(message.id)) {
            this.store.discuss.history.messages.push(message.id);
            this.sortMessages(this.store.discuss.history);
        }
    }

    updateNotifications(message) {
        message.notifications = message.notifications.map((notification) =>
            this.insertNotification({ ...notification, messageId: message.id })
        );
    }

    _updateReactions(message, reactionGroups = []) {
        const reactionContentToUnlink = new Set();
        const reactionsToInsert = [];
        for (const rawReaction of reactionGroups) {
            const [command, reactionData] = Array.isArray(rawReaction)
                ? rawReaction
                : ["insert", rawReaction];
            const reaction = this.insertReactions(reactionData);
            if (command === "insert") {
                reactionsToInsert.push(reaction);
            } else {
                reactionContentToUnlink.add(reaction.content);
            }
        }
        message.reactions = message.reactions.filter(
            ({ content }) => !reactionContentToUnlink.has(content)
        );
        reactionsToInsert.forEach((reaction) => {
            const idx = message.reactions.findIndex(({ content }) => reaction.content === content);
            if (idx !== -1) {
                message.reactions[idx] = reaction;
            } else {
                message.reactions.push(reaction);
            }
        });
    }

    /**
     * @param {Object} data
     * @returns {MessageReactions}
     */
    insertReactions(data) {
        let reaction = this.store.messages[data.message.id]?.reactions.find(
            ({ content }) => content === data.content
        );
        if (!reaction) {
            reaction = new MessageReactions();
            reaction._store = this.store;
        }
        const partnerIdsToUnlink = new Set();
        const alreadyKnownPartnerIds = new Set(reaction.partnerIds);
        for (const rawPartner of data.partners) {
            const [command, partnerData] = Array.isArray(rawPartner)
                ? rawPartner
                : ["insert", rawPartner];
            const partnerId = this.partner.insert(partnerData).id;
            if (command === "insert" && !alreadyKnownPartnerIds.has(partnerId)) {
                reaction.partnerIds.push(partnerId);
            } else if (command !== "insert") {
                partnerIdsToUnlink.add(partnerId);
            }
        }
        Object.assign(reaction, {
            count: data.count,
            content: data.content,
            messageId: data.message.id,
            partnerIds: reaction.partnerIds.filter((id) => !partnerIdsToUnlink.has(id)),
        });
        return reaction;
    }

    /**
     * @param {Object} data
     * @returns {Notification}
     */
    insertNotification(data) {
        let notification;
        if (data.id in this.store.notifications) {
            notification = this.store.notifications[data.id];
            this.updateNotification(notification, data);
            return notification;
        }
        notification = new Notification(this.store, data);
        this.updateNotification(notification, data);
        // return reactive version
        return this.store.notifications[data.id];
    }

    updateNotification(notification, data) {
        Object.assign(notification, {
            messageId: data.messageId,
            notification_status: data.notification_status,
            notification_type: data.notification_type,
            partner: data.res_partner_id
                ? this.partner.insert({
                      id: data.res_partner_id[0],
                      name: data.res_partner_id[1],
                  })
                : undefined,
        });
        if (!notification.message.author.isCurrentUser) {
            return;
        }
        const thread = notification.message.originThread;
        this.insertNotificationGroups({
            modelName: thread?.modelName,
            resId: thread?.id,
            resModel: thread?.model,
            status: notification.notification_status,
            type: notification.notification_type,
            notifications: [
                [notification.isFailure ? "insert" : "insert-and-unlink", notification],
            ],
        });
    }

    insertNotificationGroups(data) {
        let group = this.store.notificationGroups.find((group) => {
            return (
                group.resModel === data.resModel &&
                group.type === data.type &&
                (group.resModel !== "mail.channel" || group.resIds.has(data.resId))
            );
        });
        if (!group) {
            group = new NotificationGroup(this.store);
        }
        this.updateNotificationGroup(group, data);
        if (group.notifications.length === 0) {
            removeFromArray(this.store.notificationGroups, group);
        }
        return group;
    }

    updateNotificationGroup(group, data) {
        Object.assign(group, {
            modelName: data.modelName ?? group.modelName,
            resModel: data.resModel ?? group.resModel,
            type: data.type ?? group.type,
            status: data.status ?? group.status,
        });
        const notifications = data.notifications ?? [];
        const alreadyKnownNotifications = new Set(group.notifications.map(({ id }) => id));
        const notificationIdsToRemove = new Set();
        for (const [commandName, notification] of notifications) {
            if (commandName === "insert" && !alreadyKnownNotifications.has(notification.id)) {
                group.notifications.push(notification);
            } else if (commandName === "insert-and-unlink") {
                notificationIdsToRemove.add(notification.id);
            }
        }
        group.notifications = group.notifications.filter(
            ({ id }) => !notificationIdsToRemove.has(id)
        );
        group.lastMessageId = group.notifications[0]?.message.id;
        for (const notification of group.notifications) {
            if (group.lastMessageId < notification.message.id) {
                group.lastMessageId = notification.message.id;
            }
        }
        group.resIds.add(data.resId);
    }

    sortMessages(thread) {
        thread.messages.sort((msgId1, msgId2) => {
            const indicator =
                new Date(this.store.messages[msgId1].dateTime) -
                new Date(this.store.messages[msgId2].dateTime);
            if (indicator) {
                return indicator;
            } else {
                return msgId1 - msgId2;
            }
        });
    }
}

export const messageService = {
    dependencies: ["mail.store", "rpc", "orm", "presence", "mail.partner", "mail.attachment"],
    start(
        env,
        {
            "mail.store": store,
            rpc,
            orm,
            presence,
            "mail.partner": partner,
            "mail.attachment": attachment,
        }
    ) {
        return new MessageService(env, store, rpc, orm, presence, partner, attachment);
    },
};
