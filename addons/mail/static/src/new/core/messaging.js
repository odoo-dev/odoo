/* @odoo-module */

import { markup, reactive } from "@odoo/owl";
import { Deferred } from "@web/core/utils/concurrency";
import { memoize } from "@web/core/utils/functions";
import { registry } from "@web/core/registry";
import { prettifyMessageContent, convertBrToLineBreak, cleanTerm } from "@mail/new/utils/format";
import { removeFromArray } from "@mail/new/utils/arrays";
import { ChatWindow } from "./chat_window_model";
import { Thread } from "./thread_model";
import { Partner } from "./partner_model";
import { ChannelMember } from "../core/channel_member_model";
import { LinkPreview } from "./link_preview_model";
import { Message } from "./message_model";
import { CannedResponse } from "./canned_response_model";
import { browser } from "@web/core/browser/browser";

const FETCH_MSG_LIMIT = 30;

const commandRegistry = registry.category("mail.channel_commands");

export const asyncMethods = [
    "fetchPreviews",
    "postMessage",
    "updateMessage",
    "createChannel",
    "getChat",
    "joinChannel",
    "joinChat",
    "leaveChannel",
    "openChat",
    "toggleStar",
    "deleteMessage",
    "unstarAll",
    "notifyThreadNameToServer",
];

/**
 * @typedef {Messaging} Messaging
 */
export class Messaging {
    constructor(...args) {
        this.setup(...args);
    }

    setup(env, rpc, orm, user, router, initialThreadId, im_status, notification) {
        this.env = env;
        this.rpc = rpc;
        this.orm = orm;
        this.notification = notification;
        this.nextId = 1;
        this.router = router;
        this.isReady = new Deferred();
        this.imStatusService = im_status;

        this.registeredImStatusPartners = reactive([], () => this.updateImStatusRegistration());
        this.state = reactive({
            /** @type Object<number, []> */
            areTyping: {},
            areTypingTimer: {},
            // base data
            user: {
                partnerId: user.partnerId,
                uid: user.context.uid,
                avatarUrl: `/web/image?field=avatar_128&id=${user.userId}&model=res.users`,
            },
            /** @type {Object.<number, import("@mail/new/core/channel_member_model").ChannelMember>} */
            channelMembers: {},
            /** @type {Object.<number, import("@mail/new/core/follower_model").Follower>} */
            followers: {},
            /** @type {Object.<number, Partner>} */
            partners: {},
            partnerRoot: {},
            messages: {},
            /** @type {{[key: string|number]: Thread}} */
            threads: {},
            users: {},
            internalUserGroupId: null,
            registeredImStatusPartners: this.registeredImStatusPartners,
            // messaging menu
            menu: {
                counter: 5, // sounds about right.
            },
            // discuss app
            discuss: {
                isActive: false,
                messageToReplyTo: null,
                threadId: initialThreadId,
                channels: {
                    extraClass: "o-mail-category-channel",
                    id: "channels",
                    name: env._t("Channels"),
                    isOpen: false,
                    canView: true,
                    canAdd: true,
                    addTitle: env._t("Add or join a channel"),
                    counter: 0,
                    threads: [], // list of ids
                },
                chats: {
                    extraClass: "o-mail-category-chat",
                    id: "chats",
                    name: env._t("Direct messages"),
                    isOpen: false,
                    canView: false,
                    canAdd: true,
                    addTitle: env._t("Start a conversation"),
                    counter: 0,
                    threads: [], // list of ids
                },
                // mailboxes in sidebar
                inbox: null,
                starred: null,
                history: null,
            },
            chatWindows: [],
            cannedResponses: [],
        });
        this.state.discuss.inbox = Thread.insert(this.state, {
            id: "inbox",
            name: env._t("Inbox"),
            type: "mailbox",
            icon: "fa-inbox",
        });
        this.state.discuss.starred = Thread.insert(this.state, {
            id: "starred",
            name: env._t("Starred"),
            type: "mailbox",
            icon: "fa-star-o",
            counter: 0,
        });
        this.state.discuss.history = Thread.insert(this.state, {
            id: "history",
            name: env._t("History"),
            type: "mailbox",
            icon: "fa-history",
            counter: 0,
        });
        this.updateImStatusRegistration();
    }

    /**
     * Import data received from init_messaging
     */
    initialize() {
        this.rpc("/mail/init_messaging", {}, { silent: true }).then((data) => {
            Partner.insert(this.state, data.current_partner);
            this.state.partnerRoot = Partner.insert(this.state, data.partner_root);
            for (const channelData of data.channels) {
                this.createChannelThread(channelData);
            }
            this.sortChannels();
            const settings = data.current_user_settings;
            this.state.discuss.channels.isOpen = settings.is_discuss_sidebar_category_channel_open;
            this.state.discuss.chats.isOpen = settings.is_discuss_sidebar_category_chat_open;
            this.state.internalUserGroupId = data.internalUserGroupId;
            this.state.discuss.starred.counter = data.starred_counter;
            this.isReady.resolve();
            this.initCannedResponses(data.shortcodes);
        });
    }

    initCannedResponses(shortcodes = []) {
        shortcodes.forEach((code) => {
            CannedResponse.insert(this.state, code);
        });
    }

    /**
     * @param {number} channel_id
     */
    isTyping(channel_id) {
        return Boolean(this.state.areTyping[channel_id]);
    }

    /**
     * todo: merge this with Thread.insert() (?)
     */
    createChannelThread(serverData) {
        const {
            id,
            name,
            last_message_id,
            seen_message_id,
            description,
            channel,
            uuid,
            authorizedGroupFullName,
        } = serverData;
        const isUnread = last_message_id !== seen_message_id;
        const type = channel.channel_type;
        const channelType = serverData.channel.channel_type;
        const canLeave =
            (channelType === "channel" || channelType === "group") &&
            !serverData.message_needaction_counter &&
            !serverData.group_based_subscription;
        const isAdmin = channelType !== "group" && serverData.create_uid === this.state.user.uid;
        const thread = Thread.insert(this.state, {
            id,
            name,
            type,
            isUnread,
            icon: "fa-hashtag",
            description,
            serverData: serverData,
            canLeave,
            isAdmin,
            uuid,
            authorizedGroupFullName,
        });
        this.fetchChannelMembers(thread.id);
    }

    async fetchChannelMembers(threadId) {
        const thread = this.state.threads[threadId];
        const results = await this.orm.call("mail.channel", "load_more_members", [[threadId]], {
            known_member_ids: thread.channelMembers.map((channelMember) => channelMember.id),
        });
        let channelMembers = [];
        if (
            results["channelMembers"] &&
            results["channelMembers"][0] &&
            results["channelMembers"][0][1]
        ) {
            channelMembers = results["channelMembers"][0][1];
        }
        thread.memberCount = results["memberCount"];
        for (const channelMember of channelMembers) {
            Partner.insert(this.state, channelMember.persona.partner);
            ChannelMember.insert(this.state, {
                id: channelMember.id,
                partnerId: channelMember.persona.partner.id,
                threadId,
            });
        }
    }

    sortChannels() {
        this.state.discuss.channels.threads.sort((id1, id2) => {
            const thread1 = this.state.threads[id1];
            const thread2 = this.state.threads[id2];
            return String.prototype.localeCompare.call(thread1.name, thread2.name);
        });
    }

    updateImStatusRegistration() {
        this.imStatusService.registerToImStatus(
            "res.partner",
            /**
             * Read value from registeredImStatusPartners own reactive rather than
             * from state reactive to ensure the callback keeps being registered.
             */
            [...this.registeredImStatusPartners]
        );
    }

    sortThreadMessages(thread) {
        thread.messages.sort((msgId1, msgId2) => msgId1 - msgId2);
    }

    /**
     * Create a transient message, i.e. a message which does not come
     * from a member of the channel. Usually a log message, such as one
     * generated from a command with ('/').
     *
     * @param {Object} data
     */
    createTransientMessage(data) {
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
            this.state.threads[threadId]
        );
    }

    // -------------------------------------------------------------------------
    // process notifications received by the bus
    // -------------------------------------------------------------------------

    handleNotification(notifications) {
        console.log("notifications received", notifications);
        for (const notif of notifications) {
            switch (notif.type) {
                case "mail.channel/new_message":
                    {
                        const { id, message } = notif.payload;
                        const data = Object.assign(message, { body: markup(message.body) });
                        Message.insert(this.state, data, this.state.threads[id]);
                    }
                    break;
                case "mail.record/insert":
                    {
                        if (notif.payload.Partner) {
                            const partners = Array.isArray(notif.payload.Partner)
                                ? notif.payload.Partner
                                : [notif.payload.Partner];
                            for (const partner of partners) {
                                if (partner.im_status) {
                                    Partner.insert(this.state, partner);
                                }
                            }
                        }
                        const { LinkPreview: linkPreviews } = notif.payload;
                        if (linkPreviews) {
                            for (const linkPreview of linkPreviews) {
                                this.state.messages[linkPreview.message.id].linkPreviews.push(
                                    new LinkPreview(linkPreview)
                                );
                            }
                        }
                        const { Message: messageData } = notif.payload;
                        if (messageData) {
                            Message.insert(this.state, messageData);
                        }
                    }
                    break;
                case "mail.channel/transient_message":
                    return this.createTransientMessage(
                        Object.assign(notif.payload, { body: markup(notif.payload.body) })
                    );
                case "mail.link.preview/delete":
                    {
                        const { id, message_id } = notif.payload;
                        const index = this.state.messages[message_id].linkPreviews.findIndex(
                            (linkPreview) => linkPreview.id === id
                        );
                        delete this.state.messages[message_id].linkPreviews[index];
                    }
                    break;
                case "mail.message/inbox": {
                    const data = Object.assign(notif.payload, { body: markup(notif.payload.body) });
                    Message.insert(this.state, data);
                    break;
                }
                case "mail.message/toggle_star": {
                    const { message_ids: messageIds, starred } = notif.payload;
                    for (const messageId of messageIds) {
                        const message = this.state.messages[messageId];
                        if (!message) {
                            continue;
                        }
                        this.updateMessageStarredState(message, starred);
                    }
                    this.state.discuss.starred.messages.sort();
                    break;
                }
                case "mail.channel.member/seen": {
                    const { channel_id, last_message_id, partner_id } = notif.payload;
                    const channel = this.state.threads[channel_id];
                    if (!channel) {
                        // for example seen from another browser, the current one has no
                        // knowledge of the channel
                        return;
                    }
                    if (this.state.user.partnerId === partner_id) {
                        channel.serverLastSeenMsgByCurrentUser = last_message_id;
                    }
                    break;
                }
                case "mail.channel.member/typing_status": {
                    const isTyping = notif.payload.isTyping;
                    const channel_id = notif.payload.channel.id;
                    const name = notif.payload.persona.partner.name;
                    if (notif.payload.persona.partner.id === this.state.user.partnerId) {
                        return;
                    }
                    if (!this.state.areTyping[channel_id]) {
                        this.state.areTyping[channel_id] = [];
                        this.state.areTypingTimer[channel_id] = {};
                    }
                    const remove = () => {
                        if (this.state.areTyping[channel_id]) {
                            removeFromArray(this.state.areTyping[channel_id], name);
                            if (this.state.areTyping[channel_id].length === 0) {
                                delete this.state.areTyping[channel_id];
                            }
                        }
                    };
                    if (isTyping) {
                        if (!this.state.areTyping[channel_id].includes(name)) {
                            this.state.areTyping[channel_id].push(name);
                        }
                        if (this.state.areTypingTimer[channel_id][name]) {
                            browser.clearTimeout(this.state.areTypingTimer[channel_id][name]);
                        }
                        this.state.areTypingTimer[channel_id] = {
                            [name]: browser.setTimeout(() => {
                                remove();
                            }, 60000),
                        };
                    } else {
                        remove();
                    }
                    break;
                }
                case "mail.channel/unpin": {
                    this.state.threads[notif.payload.id]?.remove();
                    break;
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // actions that can be performed on the messaging system
    // -------------------------------------------------------------------------

    /**
     * @param {number|string} threadId
     */
    setDiscussThread(threadId) {
        this.state.discuss.threadId = threadId;
        const activeId =
            typeof threadId === "string" ? `mail.box_${threadId}` : `mail.channel_${threadId}`;
        this.router.pushState({ active_id: activeId });
    }

    getChatterThread(resModel, resId) {
        const localId = Thread.createLocalId({ model: resModel, id: resId });
        if (localId in this.state.threads) {
            if (resId === false) {
                return this.state.threads[localId];
            }
            // to force a reload
            this.state.threads[localId].status = "new";
        }
        const thread = Thread.insert(this.state, {
            id: localId,
            name: localId,
            type: "chatter",
            resId,
            resModel,
        });
        if (resId === false) {
            const tmpId = `virtual${this.nextId++}`;
            const tmpData = {
                id: tmpId,
                author: { id: this.state.user.partnerId },
                body: this.env._t("Creating a new record..."),
                message_type: "notification",
                trackingValues: [],
            };
            Message.insert(this.state, tmpData, thread);
        }
        return thread;
    }

    async fetchChatterData(
        resId,
        resModel,
        requestList = ["activities", "followers", "attachments", "messages"]
    ) {
        const result = await this.rpc("/mail/thread/data", {
            request_list: requestList,
            thread_id: resId,
            thread_model: resModel,
        });
        if ("attachments" in result) {
            result["attachments"] = result["attachments"].map((attachment) => ({
                ...attachment,
                originThread: Thread.insert(this.state, attachment.originThread[0][1]),
            }));
        }
        return result;
    }

    async fetchThreadMessages(thread, { min, max }) {
        thread.status = "loading";
        let rawMessages;
        switch (thread.type) {
            case "mailbox":
                rawMessages = await this.rpc(`/mail/${thread.id}/messages`, {
                    limit: FETCH_MSG_LIMIT,
                    max_id: max,
                    min_id: min,
                });
                break;
            case "chatter":
                if (thread.resId === false) {
                    return [];
                }
                rawMessages = await this.rpc("/mail/thread/messages", {
                    thread_id: thread.resId,
                    thread_model: thread.resModel,
                    limit: FETCH_MSG_LIMIT,
                    max_id: max,
                    min_id: min,
                });
                break;
            case "channel":
            case "chat":
                rawMessages = await this.rpc("/mail/channel/messages", {
                    channel_id: thread.id,
                    limit: FETCH_MSG_LIMIT,
                    max_id: max,
                    min_id: min,
                });
                break;
            default:
                throw new Error("Unknown thread type");
        }
        thread.status = "ready";
        const messages = rawMessages
            .reverse()
            .map((data) =>
                Message.insert(this.state, Object.assign(data, { body: markup(data.body) }), thread)
            );
        return messages;
    }

    async fetchThreadMessagesNew(threadId) {
        const thread = this.state.threads[threadId];
        const min = thread.mostRecentNonTransientMessage?.id;
        const fetchedMsgs = await this.fetchThreadMessages(thread, { min });
        const mostRecentNonTransientMessage = thread.mostRecentNonTransientMessage;
        if (thread.isUnread && ["chat", "channel"].includes(thread.type)) {
            if (fetchedMsgs.length > 0) {
                this.rpc("/mail/channel/set_last_seen_message", {
                    channel_id: thread.id,
                    last_message_id: mostRecentNonTransientMessage?.id,
                });
            }
        }
        Object.assign(thread, {
            isUnread: false,
            loadMore:
                min === undefined && fetchedMsgs.length === FETCH_MSG_LIMIT
                    ? true
                    : thread.loadMore,
        });
    }

    async fetchThreadMessagesMore(threadId) {
        const thread = this.state.threads[threadId];
        const fetchedMsgs = await this.fetchThreadMessages(thread, {
            max: thread.oldestNonTransientMessage?.id,
        });
        if (fetchedMsgs.length < FETCH_MSG_LIMIT) {
            thread.loadMore = false;
        }
    }

    fetchPreviews = memoize(async () => {
        const ids = [];
        for (const thread of Object.values(this.state.threads)) {
            if (thread.type === "channel" || thread.type === "chat") {
                ids.push(thread.id);
            }
        }
        if (ids.length) {
            const previews = await this.orm.call("mail.channel", "channel_fetch_preview", [ids]);
            for (const preview of previews) {
                const thread = Thread.insert(this.state, { id: preview.id, type: "channel" });
                const data = Object.assign(preview.last_message, {
                    body: markup(preview.last_message.body),
                });
                Message.insert(this.state, data, thread);
            }
        }
    });

    async postMessage(threadId, body, { attachments = [], isNote = false, parentId, rawMentions }) {
        const thread = this.state.threads[threadId];
        const command = this.getCommandFromText(thread.type, body);
        if (command) {
            await this.executeCommand(threadId, command, body);
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
                partner_ids: [],
                subtype_xmlid: subtype,
            },
            thread_id: Number.isInteger(threadId) ? threadId : thread.resId,
            thread_model: thread.resModel || "mail.channel",
        };
        if (parentId) {
            params.post_data.parent_id = parentId;
        }
        if (thread.type === "chatter") {
            params.thread_id = thread.resId;
            params.thread_model = thread.resModel;
            // need to get suggested recipients here, if !isNote...
            params.post_data.partner_ids = [];
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
        const data = await this.rpc(`/mail/message/post`, params);
        const message = Message.insert(
            this.state,
            Object.assign(data, { body: markup(data.body) }),
            thread
        );
        if (!message.isEmpty) {
            this.rpc(`/mail/link_preview`, { message_id: data.id }, { silent: true });
        }
        if (thread.type !== "chatter") {
            removeFromArray(thread.messages, tmpMsg.id);
            delete this.state.messages[tmpMsg.id];
        }
        return message;
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
            const thread = this.state.threads[threadId];
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

    executeCommand(threadId, command, body = "") {
        return this.orm.call("mail.channel", command.methodName, [[threadId]], {
            body,
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

    async updateMessage(messageId, body, attachments = [], rawMentions) {
        const message = this.state.messages[messageId];
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

    async addReaction(messageId, content) {
        const messageData = await this.rpc("/mail/message/add_reaction", {
            content,
            message_id: messageId,
        });
        const message = this.state.messages[messageId];
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

    openDiscussion(threadId) {
        if (this.state.discuss.isActive) {
            this.setDiscussThread(threadId);
        } else {
            ChatWindow.insert(this.state, { threadId });
        }
    }

    toggleReplyTo(message) {
        if (this.state.discuss.messageToReplyTo === message) {
            this.state.discuss.messageToReplyTo = null;
        } else {
            this.state.discuss.messageToReplyTo = message;
        }
    }

    cancelReplyTo() {
        this.state.discuss.messageToReplyTo = null;
    }

    async createChannel(name) {
        const channel = await this.orm.call("mail.channel", "channel_create", [
            name,
            this.state.internalUserGroupId,
        ]);
        this.createChannelThread(channel);
        this.sortChannels();
        this.state.discuss.threadId = channel.id;
    }

    async getChat({ userId, partnerId }) {
        if (!partnerId) {
            let user = this.state.users[userId];
            if (!user) {
                this.state.users[userId] = { id: userId };
                user = this.state.users[userId];
            }
            if (!user.partner_id) {
                const [userData] = await this.orm.silent.read(
                    "res.users",
                    [user.id],
                    ["partner_id"],
                    {
                        context: { active_test: false },
                    }
                );
                if (userData) {
                    user.partner_id = userData.partner_id[0];
                }
            }
            if (!user.partner_id) {
                this.notification.add(this.env._t("You can only chat with existing users."), {
                    type: "warning",
                });
                return;
            }
            partnerId = user.partner_id;
        }
        let chat = Object.values(this.state.threads).find(
            (thread) => thread.type === "chat" && thread.chatPartnerId === partnerId
        );
        if (!chat || !chat.is_pinned) {
            chat = await this.joinChat(partnerId);
        }
        if (!chat) {
            this.notification.add(
                this.env._t("An unexpected error occurred during the creation of the chat."),
                { type: "warning" }
            );
            return;
        }
        return chat;
    }

    async joinChannel(id, name) {
        await this.orm.call("mail.channel", "add_members", [[id]], {
            partner_ids: [this.state.user.partnerId],
        });
        Thread.insert(this.state, {
            id,
            name,
            type: "channel",
            serverData: { channel: { avatarCacheKey: "hello" } },
        });
        this.sortChannels();
        this.state.discuss.threadId = id;
    }

    async joinChat(id) {
        const data = await this.orm.call("mail.channel", "channel_get", [], {
            partners_to: [id],
        });
        return Thread.insert(this.state, {
            id: data.id,
            name: undefined,
            type: "chat",
            serverData: data,
        });
    }

    async searchPartners(searchStr = "", limit = 10) {
        let partners = [];
        const searchTerm = cleanTerm(searchStr);
        for (const id in this.state.partners) {
            const partner = this.state.partners[id];
            // todo: need to filter out non-user partners (there was a user key)
            // also, filter out inactive partners
            if (partner.name && cleanTerm(partner.name).includes(searchTerm)) {
                partners.push(partner);
                if (partners.length >= limit) {
                    break;
                }
            }
        }
        if (!partners.length) {
            const partnersData = await this.orm.silent.call("res.partner", "im_search", [
                searchTerm,
                limit,
            ]);
            partners = partnersData.map((data) => Partner.insert(this.state, data));
        }
        return partners;
    }

    searchChannelCommand(cleanedSearchTerm, threadId, sort) {
        const thread = this.state.threads[threadId];
        if (!["chat", "channel", "group"].includes(thread.type)) {
            // channel commands are channel specific
            return [[]];
        }
        const commands = commandRegistry
            .getEntries()
            .filter(([name, command]) => {
                if (!cleanTerm(name).includes(cleanedSearchTerm)) {
                    return false;
                }
                if (command.channel_types) {
                    return command.channel_types.includes(thread.type);
                }
                return true;
            })
            .map(([name, command]) => {
                return {
                    channel_types: command.channel_types,
                    help: command.help,
                    id: command.id,
                    name,
                };
            });
        const sortFunc = (a, b) => {
            const isATypeSpecific = a.channel_types;
            const isBTypeSpecific = b.channel_types;
            if (isATypeSpecific && !isBTypeSpecific) {
                return -1;
            }
            if (!isATypeSpecific && isBTypeSpecific) {
                return 1;
            }
            const cleanedAName = cleanTerm(a.name || "");
            const cleanedBName = cleanTerm(b.name || "");
            if (
                cleanedAName.startsWith(cleanedSearchTerm) &&
                !cleanedBName.startsWith(cleanedSearchTerm)
            ) {
                return -1;
            }
            if (
                !cleanedAName.startsWith(cleanedSearchTerm) &&
                cleanedBName.startsWith(cleanedSearchTerm)
            ) {
                return 1;
            }
            if (cleanedAName < cleanedBName) {
                return -1;
            }
            if (cleanedAName > cleanedBName) {
                return 1;
            }
            return a.id - b.id;
        };
        return [
            {
                type: "ChannelCommand",
                suggestions: sort ? commands.sort(sortFunc) : commands,
            },
        ];
    }

    async leaveChannel(id) {
        await this.orm.call("mail.channel", "action_unfollow", [id]);
        this.state.threads[id].remove();
        this.setDiscussThread(this.state.discuss.channels.threads[0]);
    }

    openDocument({ id, model }) {
        this.env.services.action.doAction({
            type: "ir.actions.act_window",
            res_model: model,
            views: [[false, "form"]],
            res_id: id,
        });
    }

    async openChat(person) {
        const chat = await this.getChat(person);
        if (chat) {
            this.openDiscussion(chat.id);
        }
    }

    async toggleStar(messageId) {
        await this.orm.call("mail.message", "toggle_message_starred", [[messageId]]);
    }

    updateMessageStarredState(message, isStarred) {
        message.isStarred = isStarred;
        if (isStarred) {
            this.state.discuss.starred.counter++;
            this.state.discuss.starred.messages.push(message.id);
        } else {
            this.state.discuss.starred.counter--;
            removeFromArray(this.state.discuss.starred.messages, message.id);
        }
    }

    async deleteMessage(message) {
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

    async unlinkAttachment(attachment) {
        return this.rpc("/mail/attachment/delete", {
            attachment_id: attachment.id,
        });
    }

    async unstarAll() {
        // apply the change immediately for faster feedback
        this.state.discuss.starred.counter = 0;
        this.state.discuss.starred.messages = [];
        await this.orm.call("mail.message", "unstar_all");
    }

    async notifyThreadNameToServer(threadId, name) {
        const thread = this.state.threads[threadId];
        if (thread.type === "channel" || thread.type === "group") {
            thread.name = name;
            await this.orm.call("mail.channel", "channel_rename", [[thread.id]], { name });
        } else if (thread.type === "chat") {
            thread.customName = name;
            await this.orm.call("mail.channel", "channel_set_custom_name", [[thread.id]], { name });
        }
    }

    /*
     * Returns suggestions that match the given search term from specified type.
     *
     * @param {Object} [param0={}]
     * @param {String} [param0.delimiter] can be one one of the following: ["@", ":", "#", "/"]
     * @param {String} [param0.term]
     * @param {Object} [options={}]
     * @param {Integer} [options.thread] prioritize and/or restrict
     *  result in the context of given thread
     * @returns {[mainSuggestion[], extraSuggestion[]]}
     */

    searchSuggestions({ delimiter, term }, { threadId } = {}, sort = false) {
        const cleanedSearchTerm = cleanTerm(term);
        switch (delimiter) {
            case "@": {
                return Partner.searchSuggestions(this.state, cleanedSearchTerm, threadId, sort);
            }
            case ":":
                return CannedResponse.searchSuggestions(this.state, cleanedSearchTerm, sort);
            case "#":
                return Thread.searchSuggestions(this.state, cleanedSearchTerm, threadId, sort);
            case "/":
                return this.searchChannelCommand(cleanedSearchTerm, threadId, sort);
        }
        return [
            {
                type: undefined,
                suggestions: [],
            },
            {
                type: undefined,
                suggestions: [],
            },
        ];
    }

    async fetchSuggestions({ delimiter, term }, { threadId } = {}) {
        const cleanedSearchTerm = cleanTerm(term);
        switch (delimiter) {
            case "@": {
                this.fetchPartners(cleanedSearchTerm, threadId);
                break;
            }
            case ":":
                break;
            case "#":
                this.fetchThreads(cleanedSearchTerm);
                break;
            case "/":
                break;
        }
    }

    async fetchPartners(term, threadId) {
        const kwargs = { search: term };
        const thread = this.state.threads[threadId];
        const isNonPublicChannel =
            thread &&
            (thread.type === "group" ||
                thread.type === "chat" ||
                (thread.type === "channel" && thread.serverData.group_based_subscription));
        if (isNonPublicChannel) {
            kwargs.channel_id = thread.id;
        }
        const suggestedPartners = await this.orm.call(
            "res.partner",
            "get_mention_suggestions",
            [],
            kwargs
        );
        suggestedPartners.map((data) => {
            Partner.insert(this.state, data);
        });
    }

    async fetchThreads(term) {
        const suggestedThreads = await this.orm.call(
            "mail.channel",
            "get_mention_suggestions",
            [],
            { search: term }
        );
        suggestedThreads.map((data) => {
            Thread.insert(this.state, data);
        });
    }

    async notifyThreadDescriptionToServer(threadId, description) {
        const thread = this.state.threads[threadId];
        thread.description = description;
        return this.orm.call("mail.channel", "channel_change_description", [[thread.id]], {
            description,
        });
    }

    /**
     * @param {import("@mail/new/core/follower_model").Follower} follower
     */
    async removeFollower(follower) {
        await this.orm.call(follower.followedThread.resModel, "message_unsubscribe", [
            [follower.followedThread.resId],
            [follower.partner.id],
        ]);
        follower.delete();
    }

    // -------------------------------------------------------------------------
    // rtc (audio and video calls)
    // -------------------------------------------------------------------------

    startCall(threadId) {
        this.state.threads[threadId].inCall = true;
    }

    stopCall(threadId) {
        this.state.threads[threadId].inCall = false;
    }

    notify(params) {
        const { message, ...options } = params;
        return this.env.services.notification.add(message, options);
    }
}
