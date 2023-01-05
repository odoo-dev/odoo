/** @odoo-module */

import { markup } from "@odoo/owl";
import { Message } from "../core/message_model";
import { removeFromArray } from "../utils/arrays";
import { convertBrToLineBreak, prettifyMessageContent } from "../utils/format";
import { registry } from "@web/core/registry";
import { createLocalId } from "../core/thread_model.create_local_id";

const commandRegistry = registry.category("mail.channel_commands");

export class MessageService {
    nextId = 0;

    constructor(env, state, rpc, orm, presence, thread) {
        this.env = env;
        this.state = state;
        this.rpc = rpc;
        this.orm = orm;
        this.presence = presence;
        this.thread = thread;
    }

    async post(thread, body, { attachments = [], isNote = false, parentId, rawMentions }) {
        const command = this.getCommandFromText(thread.type, body);
        if (command) {
            await this.thread.executeCommand(thread, command, body);
            return;
        }
        let tmpMsg;
        const subtype = isNote ? "mail.mt_note" : "mail.mt_comment";
        const validMentions = this.getMentionsFromText(rawMentions, body);
        const params = {
            post_data: {
                body: await prettifyMessageContent(body, validMentions),
                attachment_ids: attachments.map(({ id }) => id),
                message_type: "comment",
                partner_ids: validMentions.partners.map((partner) => partner.id),
                subtype_xmlid: subtype,
            },
            thread_id: thread.id,
            thread_model: thread.model,
        };
        if (parentId) {
            params.post_data.parent_id = parentId;
        }
        if (thread.type === "chatter") {
            params.thread_id = thread.id;
            params.thread_model = thread.model;
        } else {
            const tmpId = `pending${this.nextId++}`;
            const tmpData = {
                id: tmpId,
                author: { id: this.state.user.partnerId },
                attachments: attachments,
                res_id: thread.id,
                model: "mail.channel",
            };
            if (parentId) {
                tmpData.parentMessage = this.state.messages[parentId];
            }
            tmpMsg = Message.insert(
                this.state,
                {
                    ...tmpData,
                    body: markup(await prettifyMessageContent(body, validMentions)),
                },
                thread
            );
        }
        const data = await this.rpc("/mail/message/post", params);
        if ("parentMessage" in data) {
            data.parentMessage.body = data.parentMessage.body
                ? markup(data.parentMessage.body)
                : data.parentMessage.body;
        }
        const message = Message.insert(
            this.state,
            Object.assign(data, { body: markup(data.body) }),
            thread
        );
        if (!message.isEmpty) {
            this.rpc("/mail/link_preview", { message_id: data.id }, { silent: true });
        }
        if (thread.type !== "chatter") {
            removeFromArray(thread.messages, tmpMsg.id);
            delete this.state.messages[tmpMsg.id];
        }
        return message;
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
            this.state.discuss.starred.counter--;
            removeFromArray(this.state.discuss.starred.messages, message.id);
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
            const partner = this.state.partners[partnerId];
            const index = body.indexOf(`@${partner.name}`);
            if (index === -1) {
                continue;
            }
            partners.push(partner);
        }
        for (const threadId of rawMentionedThreadIds) {
            const thread = this.state.threads[createLocalId("mail.channel", threadId)];
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
        const { body, res_id: threadId } = data;
        const lastMessageId = Object.values(this.state.messages).reduce(
            (lastMessageId, message) => Math.max(lastMessageId, message.id),
            0
        );
        Message.insert(
            this.state,
            {
                author: this.state.partnerRoot,
                body,
                id: lastMessageId + 0.01,
                is_note: true,
                is_transient: true,
            },
            this.state.threads[createLocalId("mail.channel", threadId)]
        );
    }

    async toggleStar(message) {
        await this.orm.call("mail.message", "toggle_message_starred", [[message.id]]);
    }

    async setDone(message) {
        await this.orm.call("mail.message", "set_message_done", [[message.id]]);
    }

    async unstarAll() {
        // apply the change immediately for faster feedback
        this.state.discuss.starred.counter = 0;
        this.state.discuss.starred.messages = [];
        await this.orm.call("mail.message", "unstar_all");
    }

    async react(message, content) {
        const messageData = await this.rpc("/mail/message/add_reaction", {
            content,
            message_id: message.id,
        });
        Message.insert(this.state, messageData, message.originThread);
    }

    async removeReaction(reaction) {
        const messageData = await this.rpc("/mail/message/remove_reaction", {
            content: reaction.content,
            message_id: reaction.messageId,
        });
        const message = this.state.messages[reaction.messageId];
        Message.insert(this.state, messageData, message.originThread);
    }

    updateStarred(message, isStarred) {
        message.isStarred = isStarred;
        if (isStarred) {
            this.state.discuss.starred.counter++;
            if (this.state.discuss.starred.messages.length > 0) {
                this.state.discuss.starred.messages.push(message.id);
            }
        } else {
            this.state.discuss.starred.counter--;
            removeFromArray(this.state.discuss.starred.messages, message.id);
        }
    }
}

export const messageService = {
    dependencies: ["mail.state", "rpc", "orm", "presence", "mail.thread"],
    start(env, { "mail.state": state, rpc, orm, presence, "mail.thread": thread }) {
        return new MessageService(env, state, rpc, orm, presence, thread);
    },
};
