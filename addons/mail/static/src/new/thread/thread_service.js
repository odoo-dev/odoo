/** @odoo-module */

import { markup } from "@odoo/owl";
import { Message } from "@mail/new/core/message_model";
import { ChannelMember } from "../core/channel_member_model";
import { Partner } from "../core/partner_model";
import { Guest } from "../core/guest_model";
import { Thread } from "../core/thread_model";
import { ChatWindow } from "../core/chat_window_model";
import { _t } from "@web/core/l10n/translation";

const FETCH_MSG_LIMIT = 30;

export class ThreadService {
    constructor(env, state, orm, rpc, chatWindow, notification, router) {
        this.env = env;
        this.state = state;
        this.orm = orm;
        this.rpc = rpc;
        this.chatWindow = chatWindow;
        this.notification = notification;
        this.router = router;
        Object.assign(this.state, {
            /** @type {Object.<number, import("@mail/new/core/message_model").Message>} */
            messages: {},
            /** @type {{[key: string|number]: Thread}} */
            threads: {},
        });
    }

    /**
     * todo: merge this with Thread.insert() (?)
     *
     * @returns {Thread}
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
        const isAdmin = channelType !== "group" && serverData.create_uid === this.state.user.uid;
        const thread = Thread.insert(this.state, {
            id,
            model: "mail.channel",
            name,
            type,
            isUnread,
            description,
            serverData: serverData,
            isAdmin,
            uuid,
            authorizedGroupFullName,
        });
        this.fetchChannelMembers(thread);
        return thread;
    }

    async fetchChannelMembers(thread) {
        const results = await this.orm.call("mail.channel", "load_more_members", [[thread.id]], {
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
            if (channelMember.persona?.partner) {
                Partner.insert(this.state, channelMember.persona.partner);
            }
            if (channelMember.persona?.guest) {
                Guest.insert(this.state, channelMember.persona.guest);
            }
            ChannelMember.insert(this.state, {
                id: channelMember.id,
                partnerId: channelMember.persona?.partner?.id,
                guestId: channelMember.persona?.guest?.id,
                threadId: thread.id,
            });
        }
    }

    async markAsRead(thread) {
        const mostRecentNonTransientMessage = thread.mostRecentNonTransientMessage;
        if (thread.isUnread && ["chat", "channel"].includes(thread.type)) {
            await this.rpc("/mail/channel/set_last_seen_message", {
                channel_id: thread.id,
                last_message_id: mostRecentNonTransientMessage?.id,
            });
        }
        thread.update({ isUnread: false });
    }

    async fetchMessages(thread, { min, max }) {
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
                if (thread.id === false) {
                    return [];
                }
                rawMessages = await this.rpc("/mail/thread/messages", {
                    thread_id: thread.id,
                    thread_model: thread.model,
                    limit: FETCH_MSG_LIMIT,
                    max_id: max,
                    min_id: min,
                });
                break;
            case "channel":
            case "group":
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

    async fetchNewMessages(thread) {
        const min = thread.mostRecentNonTransientMessage?.id;
        const fetchedMsgs = await this.fetchMessages(thread, { min });
        if (fetchedMsgs.length > 0) {
            this.markAsRead(thread);
        }
        Object.assign(thread, {
            isUnread: false,
            loadMore:
                min === undefined && fetchedMsgs.length === FETCH_MSG_LIMIT
                    ? true
                    : thread.loadMore,
        });
    }

    async fetchMoreMessages(thread) {
        const fetchedMsgs = await this.fetchMessages(thread, {
            max: thread.oldestNonTransientMessage?.id,
        });
        if (fetchedMsgs.length < FETCH_MSG_LIMIT) {
            thread.loadMore = false;
        }
    }

    async createChannel(name) {
        const data = await this.orm.call("mail.channel", "channel_create", [
            name,
            this.state.internalUserGroupId,
        ]);
        const channel = this.createChannelThread(data);
        this.sortChannels();
        this.open(channel);
    }

    sortChannels() {
        this.state.discuss.channels.threads.sort((id1, id2) => {
            const thread1 = this.state.threads[id1];
            const thread2 = this.state.threads[id2];
            return String.prototype.localeCompare.call(thread1.name, thread2.name);
        });
    }

    open(thread, replaceNewMessageChatWindow) {
        if (this.state.discuss.isActive) {
            this.setDiscussThread(thread);
        } else {
            const chatWindow = ChatWindow.insert(this.state, {
                folded: false,
                thread,
                replaceNewMessageChatWindow,
            });
            chatWindow.autofocus++;
            if (thread) {
                thread.state = "open";
            }
            this.chatWindow.notifyState(chatWindow);
        }
    }

    async openChat(person) {
        const chat = await this.getChat(person);
        if (chat) {
            this.open(chat);
        }
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
                this.notification.add(_t("You can only chat with existing users."), {
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
                _t("An unexpected error occurred during the creation of the chat."),
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
        const thread = Thread.insert(this.state, {
            id,
            model: "mail.channel",
            name,
            type: "channel",
            serverData: { channel: { avatarCacheKey: "hello" } },
        });
        this.sortChannels();
        this.state.discuss.threadLocalId = thread.localId;
        return thread;
    }

    async joinChat(id) {
        const data = await this.orm.call("mail.channel", "channel_get", [], {
            partners_to: [id],
        });
        return Thread.insert(this.state, {
            id: data.id,
            model: "mail.channel",
            name: undefined,
            type: "chat",
            serverData: data,
        });
    }

    executeCommand(thread, command, body = "") {
        return this.orm.call("mail.channel", command.methodName, [[thread.id]], {
            body,
        });
    }

    async notifyThreadNameToServer(thread, name) {
        if (thread.type === "channel" || thread.type === "group") {
            thread.name = name;
            await this.orm.call("mail.channel", "channel_rename", [[thread.id]], { name });
        } else if (thread.type === "chat") {
            thread.customName = name;
            await this.orm.call("mail.channel", "channel_set_custom_name", [[thread.id]], { name });
        }
    }

    async notifyThreadDescriptionToServer(thread, description) {
        thread.description = description;
        return this.orm.call("mail.channel", "channel_change_description", [[thread.id]], {
            description,
        });
    }

    async leaveChannel(channel) {
        await this.orm.call("mail.channel", "action_unfollow", [channel.id]);
        channel.remove();
        this.setDiscussThread(
            this.state.discuss.channels.threads[0]
                ? this.state.threads[this.state.discuss.channels.threads[0]]
                : this.state.discuss.inbox
        );
    }

    setDiscussThread(thread) {
        this.state.discuss.threadLocalId = thread.localId;
        const activeId =
            typeof thread.id === "string" ? `mail.box_${thread.id}` : `mail.channel_${thread.id}`;
        this.router.pushState({ active_id: activeId });
    }

    async createGroupChat({ default_display_mode, partners_to }) {
        const data = await this.orm.call("mail.channel", "create_group", [], {
            default_display_mode,
            partners_to,
        });
        const channel = this.createChannelThread(data);
        this.sortChannels();
        this.open(channel);
    }
}

export const threadService = {
    dependencies: ["mail.state", "orm", "rpc", "mail.chat_window", "notification", "router"],
    start(
        env,
        { "mail.state": state, orm, rpc, "mail.chat_window": chatWindow, notification, router }
    ) {
        return new ThreadService(env, state, orm, rpc, chatWindow, notification, router);
    },
};
