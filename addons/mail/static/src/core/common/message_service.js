/* @odoo-module */

import { removeFromArrayWithPredicate } from "@mail/utils/common/arrays";
import { convertBrToLineBreak, prettifyMessageContent } from "@mail/utils/common/format";

import { markup } from "@odoo/owl";

import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";

const { DateTime } = luxon;

export class MessageService {
    /**
     * @param {import("@web/env").OdooEnv} env
     * @param {Partial<import("services").Services>} services
     */
    constructor(env, services) {
        this.env = env;
        this.store = services["mail.store"];
        this.rpc = services.rpc;
        this.orm = services.orm;
        this.userService = services.user;
        this.personaService = services["mail.persona"];
        this.attachmentService = services["mail.attachment"];
    }

    async edit(message, body, attachments = [], rawMentions) {
        if (convertBrToLineBreak(message.body) === body && attachments.length === 0) {
            return;
        }
        const validMentions = this.getMentionsFromText(rawMentions, body);
        const messageData = await this.rpc("/mail/message/update_content", {
            attachment_ids: attachments
                .concat(message.attachments)
                .map((attachment) => attachment.id),
            attachment_tokens: attachments
                .concat(message.attachments)
                .map((attachment) => attachment.accessToken),
            body: await prettifyMessageContent(body, validMentions),
            message_id: message.id,
            partner_ids: validMentions?.partners?.map((partner) => partner.id),
        });
        this.insert(
            Object.assign(messageData, {
                body: messageData.body ? markup(messageData.body) : messageData.body,
            })
        );
        if (!message.isEmpty && this.store.hasLinkPreviewFeature) {
            this.rpc(
                "/mail/link_preview",
                { message_id: message.id, clear: true },
                { silent: true }
            );
        }
    }

    async delete(message) {
        if (message.isStarred) {
            this.store.discuss.starred.counter--;
            removeFromArrayWithPredicate(this.store.discuss.starred.messages, (msg) =>
                msg.eq(message)
            );
        }
        message.body = "";
        message.attachments = [];
        await this.rpc("/mail/message/update_content", {
            attachment_ids: [],
            attachment_tokens: [],
            body: "",
            message_id: message.id,
        });
    }

    /**
     * @returns {number}
     */
    getLastMessageId() {
        return this.store.Message.getLastMessageId();
    }

    getNextTemporaryId() {
        return this.store.Message.getNextTemporaryId();
    }

    getMentionsFromText(rawMentions, body) {
        if (!this.store.user) {
            // mentions are not supported for guests
            return {};
        }
        const validMentions = {};
        const partners = [];
        const threads = [];
        const rawMentionedPartnerIds = rawMentions.partnerIds || [];
        const rawMentionedThreadIds = rawMentions.threadIds || [];
        for (const partnerId of rawMentionedPartnerIds) {
            const partner = this.store.Persona.findById({ type: "partner", id: partnerId });
            const index = body.indexOf(`@${partner.name}`);
            if (index === -1) {
                continue;
            }
            partners.push(partner);
        }
        for (const threadId of rawMentionedThreadIds) {
            const thread = this.store.Thread.findById({ model: "discuss.channel", id: threadId });
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
        const lastMessageId = this.store.Message.getLastMessageId();
        return this.insert({
            author: this.store.odoobot,
            body,
            id: lastMessageId + 0.01,
            is_note: true,
            is_transient: true,
            res_id,
            model,
        });
    }

    async toggleStar(message) {
        await this.orm.silent.call("mail.message", "toggle_message_starred", [[message.id]]);
    }

    async setDone(message) {
        await this.orm.silent.call("mail.message", "set_message_done", [[message.id]]);
    }

    async unfollow(message) {
        if (message.isNeedaction) {
            await this.setDone(message);
        }
        const thread = message.originThread;
        await this.env.services["mail.thread"].removeFollower(thread.selfFollower);
        this.env.services.notification.add(
            _t('You are no longer following "%(thread_name)s".', { thread_name: thread.name }),
            { type: "success" }
        );
    }

    async unstarAll() {
        // apply the change immediately for faster feedback
        this.store.discuss.starred.counter = 0;
        this.store.discuss.starred.messages = [];
        await this.orm.call("mail.message", "unstar_all");
    }

    async react(message, content) {
        await this.rpc(
            "/mail/message/reaction",
            {
                action: "add",
                content,
                message_id: message.id,
            },
            { silent: true }
        );
    }

    async removeReaction(reaction) {
        await this.rpc(
            "/mail/message/reaction",
            {
                action: "remove",
                content: reaction.content,
                message_id: reaction.messageId,
            },
            { silent: true }
        );
    }

    updateStarred(message, isStarred) {
        message.isStarred = isStarred;
        const starred = this.store.discuss.starred;
        if (isStarred) {
            starred.counter++;
            if (message.notIn(starred.messages)) {
                starred.messages.push(message);
            }
        } else {
            starred.counter--;
            removeFromArrayWithPredicate(starred.messages, (msg) => msg.eq(message));
        }
    }

    /**
     * @param {Object} data
     * @returns {Message}
     */
    insert(data) {
        return this.store.Message.insert(data);
    }

    /**
     * @param {import("@mail/core/common/message_model").Message} message
     * @param {Object} data
     */
    update(message, data) {
        return this.store.Message.update(message, data);
    }

    /**
     * @param {Object} data
     * @returns {LinkPreview}
     */
    insertLinkPreview(data) {
        return this.store.LinkPreview.insert(data);
    }

    /**
     * @param {Object} data
     * @returns {MessageReactions}
     */
    insertReactions(data) {
        return this.store.MessageReactions.insert(data);
    }

    /**
     * @param {Object} data
     * @returns {Notification}
     */
    insertNotification(data) {
        return this.store.Notification.insert(data);
    }

    updateNotification(notification, data) {
        return this.store.Notification.update(notification, data);
    }

    insertNotificationGroups(data) {
        return this.store.NotificationGroup.insert(data);
    }

    updateNotificationGroup(group, data) {
        return this.store.NotificationGroup.update(group, data);
    }

    scheduledDateSimple(message) {
        return message.scheduledDate.toLocaleString(DateTime.TIME_SIMPLE, {
            locale: this.userService.lang?.replace("_", "-"),
        });
    }

    dateSimple(message) {
        return message.datetime.toLocaleString(DateTime.TIME_SIMPLE, {
            locale: this.userService.lang?.replace("_", "-"),
        });
    }
}

export const messageService = {
    dependencies: ["mail.store", "rpc", "orm", "user", "mail.persona", "mail.attachment"],
    start(env, services) {
        return new MessageService(env, services);
    },
};

registry.category("services").add("mail.message", messageService);
