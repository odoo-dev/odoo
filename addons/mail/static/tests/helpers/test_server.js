/** @odoo-module **/

import { markRaw } from "@odoo/owl";

import { deserializeDateTime } from "@web/core/l10n/dates";
import { url } from "@web/core/utils/urls";

const { DateTime } = luxon;

export class TestServer {
    constructor() {
        this.activities = [];
        this.channels = [];
        this.chats = [];
        this.messages = [];
        this.partners = [{ id: 3, name: "Mitchell Admin" }];
        this.nextChannelId = 123;
        this.nextMessageId = 456;
    }

    async rpc(route, params) {
        const snakeCaseRoute = route.replaceAll("/", "_").replace(".", "_");
        if (!(snakeCaseRoute in this)) {
            throw new Error("Unhandled route: " + route);
        }
        const result = this[snakeCaseRoute](params);
        if (QUnit.config.debug) {
            console.groupCollapsed(`rpc ${route}`);
            console.log(`Request parameters:`, params);
            console.log(`Response:`, result);
            console.trace();
            console.groupEnd();
        }
        return JSON.parse(JSON.stringify(result));
    }

    addChannel(id, name, description) {
        const channel = {
            id,
            name,
            last_message_id: 9,
            seen_message_id: 1,
            description,
            channel: {
                channel_type: "channel",
                message_needaction_counter: 0,
                group_based_subscription: true,
                create_uid: 1,
            },
        };
        this.channels.push(channel);
        return channel;
    }
    addChat(id, name, partnerId) {
        const chatChannel = {
            id,
            name,
            last_message_id: false,
            seen_message_id: false,
            description: false,
            seen_partners_info: [{ partner_id: partnerId }],
            channel: {
                avatarCacheKey: false,
                channel_type: "chat",
                channelMembers: [["insert", [{ persona: { partner: { id: partnerId, name } } }]]],
            },
        };
        this.chats.push(chatChannel);
        return chatChannel;
    }

    /**
     *
     * @param {'commnent'} type
     */
    addMessage(type, id, threadId, threadModel, authorId, body, date) {
        const author = this.partners.find((p) => p.id === authorId);
        if (!author) {
            throw new Error("missing author");
        }
        const message = {
            id,
            body,
            author,
            date,
            message_type: type,
            res_id: threadId,
            model: threadModel,
        };
        this.messages[id] = message;
        return message;
    }

    addPartner(id, name) {
        const partner = { id, name };
        this.partners.push(partner);
        return partner;
    }

    // -------------------------------------------------------------------------
    // Handlers
    // -------------------------------------------------------------------------

    _mail_channel_messages({ channel_id, limit }) {
        return Object.values(this.messages)
            .filter((msg) => msg.res_id === channel_id && msg.model === "mail.channel")
            .slice(0, limit);
    }

    _mail_channel_set_last_seen_message({ channel_id, last_message_id }) {
        return { id: channel_id, result: last_message_id };
    }

    _mail_inbox_messages() {
        return [];
    }

    _mail_init_messaging(params) {
        return {
            current_partner: { id: 3, name: "Mitchell Admin" },
            partner_root: { id: 2, name: "OdooBot" },
            channels: this.channels,
            current_user_settings: {
                is_discuss_sidebar_category_channel_open: true,
                is_discuss_sidebar_category_chat_open: true,
            },
            internalUserGroupId: 1,
        };
    }

    _mail_message_post({ post_data, thread_id, thread_model }) {
        return this.addMessage(
            "comment",
            this.nextMessageId++,
            thread_id,
            thread_model,
            3,
            post_data.body
        );
    }

    _mail_message_update_content({ attachment_ids, body, id }) {
        const result = {
            id,
            attachment_ids,
            body: `<p>${body}</p>`,
        };
        this.messages[id] = {
            ...this.messages[id],
            ...result,
        };
        return result;
    }

    _mail_thread_data(params) {
        if (!params.thread_id) {
            return {};
        }
        return {
            activities: [],
            attachments: [],
            followers: [],
        };
    }

    _mail_thread_messages(params) {
        return [];
    }

    _web_dataset_call_kw_mail_channel_channel_get(params) {
        const partnerId = params.kwargs.partners_to[0];
        const chat = this.chats.find((c) => c.seen_partners_info[0].partner_id === partnerId);
        if (chat) {
            return chat;
        }
        return this.addChat(this.nextChannelId++, "some name", partnerId);
    }

    _web_dataset_call_kw_mail_channel_channel_create(params) {
        return this.addChannel(this.nextChannelId++, params.args[0]);
    }

    _web_dataset_call_kw_mail_channel_search_read(params) {
        const nameSearch = params.kwargs.domain[1][2];
        return this.channels.filter((channel) => channel.name.includes(nameSearch));
    }

    _web_dataset_call_kw_res_partner_im_search(params) {
        const searchStr = params.args[0];
        return this.partners.filter((p) => p.name.includes(searchStr));
    }

    _web_dataset_call_kw_res_users_systray_get_activities(params) {
        return [];
    }
}
