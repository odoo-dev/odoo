/** @odoo-module */

import { markRaw, markup, reactive } from "@odoo/owl";
import { deserializeDateTime } from "@web/core/l10n/dates";
import { Deferred } from "@web/core/utils/concurrency";
import { url } from "@web/core/utils/urls";
import { htmlToTextContentInline, removeFromArray } from "./utils";
import { prettifyMessageContent } from "./message_prettify_utils";

const { DateTime } = luxon;

export class Messaging {
    constructor(...args) {
        const self = reactive(this);
        self.setup(...args);
        return self;
    }

    setup(env, rpc, orm, user, router, initialThreadId, notification) {
        this.env = env;
        this.rpc = rpc;
        this.orm = orm;
        this.notification = notification;
        this.nextId = 1;
        this.router = router;
        this.isReady = new Deferred();
        this.previewsProm = null;

        // base data
        this.user = {
            partnerId: user.partnerId,
            uid: user.context.uid,
            avatarUrl: `/web/image?field=avatar_128&id=${user.userId}&model=res.users`,
        };
        this.partners = {};
        this.messages = {};
        this.threads = {};
        this.users = {};
        this.internalUserGroupId = null;

        // messaging menu
        this.menu = {
            counter: 5, // sounds about right.
        };

        // discuss app
        this.discuss = {
            isActive: false,
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
            inbox: this.createThread("inbox", env._t("Inbox"), "mailbox", { icon: "fa-inbox" }),
            starred: this.createThread("starred", env._t("Starred"), "mailbox", {
                icon: "fa-star-o",
                counter: 0,
            }),
            history: this.createThread("history", env._t("History"), "mailbox", {
                icon: "fa-history",
                counter: 0,
            }),
        };

        this.chatWindows = [];
    }

    /**
     * Import data received from init_messaging
     */
    initialize() {
        this.rpc("/mail/init_messaging", {}, { silent: true }).then((data) => {
            this.createPartner(data.current_partner.id, data.current_partner.name);
            this.createPartner(data.partner_root.id, data.partner_root.name);
            for (const channelData of data.channels) {
                this.createChannelThread(channelData);
            }
            this.sortChannels();
            const settings = data.current_user_settings;
            this.discuss.channels.isOpen = settings.is_discuss_sidebar_category_channel_open;
            this.discuss.chats.isOpen = settings.is_discuss_sidebar_category_chat_open;
            this.internalUserGroupId = data.internalUserGroupId;
            this.discuss.starred.counter = data.starred_counter;
            this.isReady.resolve();
        });
    }

    /**
     * todo: merge this with createThread (?)
     */
    createChannelThread(serverData) {
        const { id, name, last_message_id, seen_message_id, description, channel } = serverData;
        const isUnread = last_message_id !== seen_message_id;
        const type = channel.channel_type;
        const channelType = serverData.channel.channel_type;
        const canLeave =
            (channelType === "channel" || channelType === "group") &&
            !serverData.message_needaction_counter &&
            !serverData.group_based_subscription;
        const isAdmin = channelType !== "group" && serverData.create_uid === this.user.uid;
        this.createThread(id, name, type, {
            isUnread,
            icon: "fa-hashtag",
            description,
            serverData: serverData,
            canLeave,
            isAdmin,
        });
    }

    sortChannels() {
        this.discuss.channels.threads.sort((id1, id2) => {
            const thread1 = this.threads[id1];
            const thread2 = this.threads[id2];
            return String.prototype.localeCompare.call(thread1.name, thread2.name);
        });
    }

    createThread(id, name, type, data = {}) {
        if (id in this.threads) {
            return this.threads[id];
        }
        const thread = {
            id,
            name,
            type,
            counter: 0,
            isUnread: false,
            icon: false,
            description: false,
            status: "new", // 'new', 'loading', 'ready'
            imgUrl: false,
            messages: [], // list of ids
            chatPartnerId: false,
            isAdmin: false,
            canLeave: data.canLeave || false,
        };
        for (const key in data) {
            thread[key] = data[key];
        }
        if (type === "channel") {
            this.discuss.channels.threads.push(thread.id);
            const avatarCacheKey = data.serverData.channel.avatarCacheKey;
            thread.imgUrl = `/web/image/mail.channel/${id}/avatar_128?unique=${avatarCacheKey}`;
        }
        if (type === "chat") {
            thread.is_pinned = data.serverData.is_pinned;
            this.discuss.chats.threads.push(thread.id);
            if (data.serverData) {
                const avatarCacheKey = data.serverData.channel.avatarCacheKey;
                for (const elem of data.serverData.channel.channelMembers[0][1]) {
                    this.createPartner(elem.persona.partner.id, elem.persona.partner.name);
                    if (
                        elem.persona.partner.id !== this.user.partnerId ||
                        (data.serverData.channel.channelMembers[0][1].length === 1 &&
                            elem.persona.partner.id === this.user.partnerId)
                    ) {
                        thread.chatPartnerId = elem.persona.partner.id;
                        thread.name = this.partners[elem.persona.partner.id].name;
                    }
                }
                thread.imgUrl = `/web/image/res.partner/${thread.chatPartnerId}/avatar_128?unique=${avatarCacheKey}`;
            }
        }

        this.threads[id] = thread;
        return thread;
    }

    /**
     * TODO: remove thread argument and add a method addToThread or something
     * caller should do it, not this method
     */
    createMessage(body, data, thread) {
        const {
            attachment_ids: attachments,
            author,
            id,
            date,
            message_type: type,
            subtype_description: subtypeDescription,
            trackingValues,
        } = data;
        if (id in this.messages) {
            return this.messages[id];
        }
        this.createPartner(author.id, author.name);
        const now = DateTime.now();
        const dateTime = markRaw(date ? deserializeDateTime(date) : now);
        let dateDay = dateTime.toLocaleString(DateTime.DATE_FULL);
        if (dateDay === now.toLocaleString(DateTime.DATE_FULL)) {
            dateDay = this.env._t("Today");
        }
        let isStarred = false;
        if (data.starred_partner_ids && data.starred_partner_ids.includes(this.user.partnerId)) {
            isStarred = true;
        }

        const message = {
            attachments,
            id,
            type,
            body,
            authorId: author.id,
            isAuthor: author.id === this.user.partnerId,
            dateDay,
            dateTimeStr: dateTime.toLocaleString(DateTime.DATETIME_SHORT),
            dateTime,
            isStarred,
            isNote: data.is_note,
            subtypeDescription,
            trackingValues,
        };
        message.recordName = data.record_name;
        message.resId = data.res_id;
        message.resModel = data.model;
        message.url = `${url("/web")}#model=${data.model}&id=${data.res_id}`;
        if (type === "notification") {
            message.trackingValues = data.trackingValues;
            if (data.model === "mail.channel") {
                // is that correct?
                message.isNotification = true;
            }
            if (data.subtype_description) {
                message.subtype_description = data.subtype_description;
            }
        }
        this.messages[id] = message;
        if (thread.type === "chatter") {
            thread.messages.unshift(id);
        } else {
            thread.messages.push(id);
        }
        return message;
    }

    createPartner(id, name) {
        if (id in this.partners) {
            return this.partners[id];
        }
        const partner = { id, name };
        this.partners[id] = partner;
        return partner;
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
                        const thread = this.threads[id];
                        const body = markup(message.body);
                        this.createMessage(body, message, thread);
                    }
                    break;
            }
        }
    }

    // -------------------------------------------------------------------------
    // actions that can be performed on the messaging system
    // -------------------------------------------------------------------------

    setDiscussThread(threadId) {
        this.discuss.threadId = threadId;
        const activeId =
            typeof threadId === "string" ? `mail.box_${threadId}` : `mail.channel_${threadId}`;
        this.router.pushState({ active_id: activeId });
    }

    openChatWindow(threadId) {
        const chatWindow = this.chatWindows.find((c) => c.threadId === threadId);
        if (!chatWindow) {
            this.chatWindows.push({ threadId, autofocus: 1 });
        } else {
            chatWindow.autofocus++;
        }
    }

    closeChatWindow(threadId) {
        const index = this.chatWindows.findIndex((c) => c.threadId === threadId);
        if (index > -1) {
            this.chatWindows.splice(index, 1);
        }
    }

    getChatterThread(resModel, resId) {
        const localId = resModel + "," + resId;
        if (localId in this.threads) {
            if (resId === false) {
                return this.threads[localId];
            }
            // to force a reload
            this.threads[localId].status = "new";
        }
        const thread = this.createThread(localId, localId, "chatter", { resId, resModel });
        if (resId === false) {
            const tmpId = `virtual${this.nextId++}`;
            const tmpData = {
                id: tmpId,
                author: { id: this.user.partnerId },
                message_type: "notification",
                trackingValues: [],
            };
            const body = this.env._t("Creating a new record...");
            this.createMessage(body, tmpData, thread);
        }
        return thread;
    }

    async fetchThreadMessages(threadId) {
        const thread = this.threads[threadId];
        if (thread.status !== "new") {
            return;
        }
        thread.status = "loading";
        let rawMessages;
        switch (thread.type) {
            case "mailbox":
                rawMessages = await this.rpc(`/mail/${threadId}/messages`, { limit: 30 });
                break;
            case "chatter":
                if (thread.resId === false) {
                    return;
                }
                rawMessages = await this.rpc("/mail/thread/messages", {
                    thread_id: thread.resId,
                    thread_model: thread.resModel,
                    limit: 30,
                });
                break;
            case "channel":
            case "chat":
                rawMessages = await this.rpc("/mail/channel/messages", {
                    channel_id: threadId,
                    limit: 30,
                });
                break;
            default:
                throw new Error("Unknown thread type");
        }
        const lastMessage = rawMessages[0];
        for (const data of rawMessages.reverse()) {
            this.createMessage(markup(data.body), data, thread);
        }
        thread.status = "ready";
        if (thread.isUnread && ["chat", "channel"].includes(thread.type)) {
            if (lastMessage) {
                this.rpc("/mail/channel/set_last_seen_message", {
                    channel_id: thread.id,
                    last_message_id: lastMessage.id,
                });
            }
        }
        thread.isUnread = false;
    }

    async fetchPreviews() {
        if (this.previewsProm) {
            return this.previewsProm;
        }
        const ids = [];
        for (const thread of Object.values(this.threads)) {
            if (thread.type === "channel" || thread.type === "chat") {
                ids.push(thread.id);
            }
        }
        if (!ids.length) {
            this.previewsProm = Promise.resolve([]);
        } else {
            this.previewsProm = this.orm
                .call("mail.channel", "channel_fetch_preview", [ids])
                .then((previews) => {
                    for (const preview of previews) {
                        preview.last_message.date = markRaw(
                            deserializeDateTime(preview.last_message.date)
                        );
                        preview.last_message.body = htmlToTextContentInline(
                            preview.last_message.body
                        );
                        const { id, name } = preview.last_message.author;
                        this.createPartner(id, name);
                    }
                    return previews;
                });
        }
        return this.previewsProm;
    }
    async postMessage(threadId, body, isNote = false) {
        let tmpMsg;
        const thread = this.threads[threadId];
        const subtype = isNote ? "mail.mt_note" : "mail.mt_comment";
        const params = {
            post_data: {
                body: await prettifyMessageContent(body),
                attachment_ids: [],
                message_type: "comment",
                partner_ids: [],
                subtype_xmlid: subtype,
            },
            thread_id: threadId,
            thread_model: "mail.channel",
        };
        if (thread.type === "chatter") {
            params.thread_id = thread.resId;
            params.thread_model = thread.resModel;
            // need to get suggested recipients here, if !isNote...
            params.post_data.partner_ids = [];
        } else {
            const tmpId = `pending${this.nextId++}`;
            const tmpData = {
                id: tmpId,
                author: { id: this.user.partnerId },
                res_id: thread.id,
                model: "mail.channel",
            };
            tmpMsg = this.createMessage(
                markup(await prettifyMessageContent(body)),
                tmpData,
                thread
            );
        }
        const data = await this.rpc(`/mail/message/post`, params);
        if (thread.type !== "chatter") {
            removeFromArray(thread.messages, tmpMsg.id);
            delete this.messages[tmpMsg.id];
        }
        this.createMessage(markup(data.body), data, thread);
    }

    async updateMessage(messageId, body) {
        const message = this.messages[messageId];
        if (htmlToTextContentInline(message.body) === body) {
            return;
        }
        const data = await this.rpc("/mail/message/update_content", {
            attachment_ids: [],
            body: markup(body),
            message_id: message.id,
        });
        message.body = markup(data.body);
    }

    openDiscussion(threadId) {
        if (this.discuss.isActive) {
            this.setDiscussThread(threadId);
        } else {
            this.openChatWindow(threadId);
        }
    }

    async createChannel(name) {
        const channel = await this.orm.call("mail.channel", "channel_create", [
            name,
            this.internalUserGroupId,
        ]);
        this.createChannelThread(channel);
        this.sortChannels();
        this.discuss.threadId = channel.id;
    }

    async getChat({ userId }) {
        let user = this.users[userId];
        if (!user) {
            this.users[userId] = { id: userId };
            user = this.users[userId];
        }
        if (!user.partner_id) {
            const [userData] = await this.orm.silent.read("res.users", [user.id], ["partner_id"], {
                context: { active_test: false },
            });
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
        let chat = Object.values(this.threads).find(
            (thread) => thread.type === "chat" && thread.chatPartnerId === user.partner_id
        );
        if (!chat || !chat.is_pinned) {
            chat = await this.joinChat(user.partner_id);
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
            partner_ids: [this.user.partnerId],
        });
        this.createThread(id, name, "channel", {
            serverData: { channel: { avatarCacheKey: "hello" } },
        });
        this.sortChannels();
        this.discuss.threadId = id;
    }

    async joinChat(id) {
        const data = await this.orm.call("mail.channel", "channel_get", [], {
            partners_to: [id],
        });
        return this.createThread(data.id, undefined, "chat", { serverData: data });
    }

    async leaveChannel(id) {
        await this.orm.call("mail.channel", "action_unfollow", [id]);
        removeFromArray(this.discuss.channels.threads, id);
        this.setDiscussThread(this.discuss.channels.threads[0]);
    }

    async openChat(person) {
        const chat = await this.getChat(person);
        if (chat) {
            this.openDiscussion(chat.id);
        }
    }

    async toggleStar(messageId) {
        const message = this.messages[messageId];
        message.isStarred = !message.isStarred;
        if (message.isStarred) {
            this.discuss.starred.counter++;
            this.discuss.starred.messages.push(messageId);
        } else {
            this.discuss.starred.counter--;
            removeFromArray(this.discuss.starred.messages, messageId);
        }
        this.discuss.starred.messages.sort();
        await this.orm.call("mail.message", "toggle_message_starred", [[messageId]]);
    }

    async deleteMessage(message) {
        if (message.isStarred) {
            this.discuss.starred.counter--;
            removeFromArray(this.discuss.starred.messages, message.id);
        }
        message.body = markup("");
        message.attachments = [];
        return this.rpc("/mail/message/update_content", {
            attachment_ids: [],
            body: "",
            message_id: message.id,
        });
    }

    isMessageBodyEmpty(message) {
        return (
            !message.body ||
            ["", "<p></p>", "<p><br></p>", "<p><br/></p>"].includes(message.body.replace(/\s/g, ""))
        );
    }

    isMessageEmpty(message) {
        return (
            this.isMessageBodyEmpty(message) &&
            message.attachments.length === 0 &&
            message.trackingValues.length === 0 &&
            !message.subtypeDescription
        );
    }

    async unstarAll() {
        // apply the change immediately for faster feedback
        this.discuss.starred.counter = 0;
        this.discuss.starred.messages = [];
        await this.orm.call("mail.message", "unstar_all");
    }

    // -------------------------------------------------------------------------
    // rtc (audio and video calls)
    // -------------------------------------------------------------------------

    startCall(threadId) {
        this.threads[threadId].inCall = true;
    }

    stopCall(threadId) {
        this.threads[threadId].inCall = false;
    }
}
