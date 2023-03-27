/** @odoo-module */

import { markup } from "@odoo/owl";
import { Thread } from "../core/thread_model";
import { _t } from "@web/core/l10n/translation";
import {
    removeFromArray,
    removeFromArrayWithPredicate,
    replaceArrayWithCompare,
} from "@mail/utils/arrays";
import { assignDefined, createLocalId, onChange } from "../utils/misc";
import { Composer } from "../composer/composer_model";
import { prettifyMessageContent } from "../utils/format";
import { registry } from "@web/core/registry";
import { url } from "@web/core/utils/urls";
import { DEFAULT_AVATAR } from "@mail/core/persona_service";
import { loadEmoji } from "@mail/emoji_picker/emoji_picker";
import { browser } from "@web/core/browser/browser";

export class ThreadService {
    constructor(env, services) {
        this.setup(env, services);
    }

    setup(env, services) {
        this.env = env;
        this.services = {
            /** @type {import("@mail/attachments/attachment_service").AttachmentService} */
            "mail.attachment": services["mail.attachment"],
            /** @type {import("@mail/core/channel_member_service").ChannelMemberService} */
            "mail.channel.member": services["mail.channel.member"],
            /** @type {import("@mail/core/persona_service").PersonaService} */
            "mail.persona": services["mail.persona"],
            /** @type {import("@mail/core/message_service").MessageService} */
            "mail.message": services["mail.message"],
            /** @type {import("@mail/core/store_service").Store} */
            "mail.store": services["mail.store"],
        };
        this.orm = services.orm;
        this.rpc = services.rpc;
        this.notificationService = services.notification;
        this.router = services.router;
        // FIXME this prevents cyclic dependencies between mail.thread and mail.message
        this.env.bus.addEventListener("mail.thread/insert", ({ detail }) => {
            const model = detail.model;
            const id = detail.id;
            const type = detail.type;
            this.insert({ model, id, type });
        });
    }

    /**
     * todo: merge this with this.insert() (?)
     *
     * @returns {Thread}
     */
    createChannelThread(serverData) {
        const { id, name, description, channel, uuid, authorizedGroupFullName } = serverData;
        const type = channel.channel_type;
        const channelType = serverData.channel.channel_type;
        const isAdmin =
            channelType !== "group" &&
            serverData.create_uid === this.services["mail.store"].user?.user?.id;
        const thread = this.insert({
            id,
            model: "mail.channel",
            name,
            type,
            description,
            serverData: serverData,
            isAdmin,
            uuid,
            authorizedGroupFullName,
        });
        return thread;
    }

    /**
     * @param {Thread} thread
     */
    async markAsRead(thread) {
        if (!thread.isLoaded && thread.status === "loading") {
            await thread.isLoadedDeferred;
        }
        const mostRecentNonTransientMessage = thread.mostRecentNonTransientMessage;
        if (
            this.isUnread(thread) &&
            thread.allowSetLastSeenMessage &&
            mostRecentNonTransientMessage
        ) {
            this.rpc("/mail/channel/set_last_seen_message", {
                channel_id: thread.id,
                last_message_id: mostRecentNonTransientMessage.id,
            }).then(() => {
                this.update(thread, { serverLastSeenMsgBySelf: mostRecentNonTransientMessage.id });
            });
        }
        if (thread.hasNeedactionMessages) {
            this.markAllMessagesAsRead(thread);
        }
    }

    markAllMessagesAsRead(thread) {
        return this.orm.silent.call("mail.message", "mark_all_as_read", [
            [
                ["model", "=", thread.model],
                ["res_id", "=", thread.id],
            ],
        ]);
    }

    /**
     * @param {Thread} thread
     */
    async markAsFetched(thread) {
        await this.orm.silent.call("mail.channel", "channel_fetched", [[thread.id]]);
    }

    async createChannel(name) {
        const data = await this.orm.call("mail.channel", "channel_create", [
            name,
            this.services["mail.store"].internalUserGroupId,
        ]);
        const channel = this.createChannelThread(data);
        this.sortChannels();
        this.open(channel);
    }

    unpin(thread) {
        if (thread.model !== "mail.channel") {
            return;
        }
        return this.orm.silent.call("mail.channel", "channel_pin", [thread.id], { pinned: false });
    }

    pin(thread) {
        if (thread.model !== "mail.channel" || this.services["mail.store"].guest) {
            return;
        }
        thread.is_pinned = true;
        return this.orm.silent.call("mail.channel", "channel_pin", [thread.id], { pinned: true });
    }

    sortChannels() {
        this.services["mail.store"].discuss.channels.threads.sort((id1, id2) => {
            const thread1 = this.services["mail.store"].threads[id1];
            const thread2 = this.services["mail.store"].threads[id2];
            return String.prototype.localeCompare.call(thread1.name, thread2.name);
        });
        this.services["mail.store"].discuss.chats.threads.sort((localId_1, localId_2) => {
            const thread1 = this.services["mail.store"].threads[localId_1];
            const thread2 = this.services["mail.store"].threads[localId_2];
            return thread2.lastInterestDateTime.ts - thread1.lastInterestDateTime.ts;
        });
    }

    /**
     * @param {Thread} thread
     * @param {boolean} replaceNewMessageChatWindow
     */
    open(thread, replaceNewMessageChatWindow) {
        this.setDiscussThread(thread);
    }

    async openChat(person) {
        const chat = await this.getChat(person);
        if (chat) {
            this.open(chat);
        }
    }

    async getChat({ userId, partnerId }) {
        if (userId) {
            let user = this.services["mail.store"].users[userId];
            if (!user) {
                this.services["mail.store"].users[userId] = { id: userId };
                user = this.services["mail.store"].users[userId];
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
                this.notificationService.add(_t("You can only chat with existing users."), {
                    type: "warning",
                });
                return;
            }
            partnerId = user.partner_id;
        }

        if (partnerId) {
            const localId = createLocalId("partner", partnerId);
            let user = this.services["mail.store"].personas[localId]?.user;
            if (!user) {
                [user] = await this.orm.silent.searchRead(
                    "res.users",
                    [["partner_id", "=", partnerId]],
                    [],
                    { context: { active_test: false } }
                );
                if (!user) {
                    this.notificationService.add(
                        _t("You can only chat with partners that have a dedicated user."),
                        { type: "info" }
                    );
                    return;
                }
            }
        }

        let chat = Object.values(this.services["mail.store"].threads).find(
            (thread) => thread.type === "chat" && thread.chatPartnerId === partnerId
        );
        if (!chat || !chat.is_pinned) {
            chat = await this.joinChat(partnerId);
        }
        if (!chat) {
            this.notificationService.add(
                _t("An unexpected error occurred during the creation of the chat."),
                { type: "warning" }
            );
            return;
        }
        return chat;
    }

    async joinChannel(id, name) {
        await this.orm.call("mail.channel", "add_members", [[id]], {
            partner_ids: [this.services["mail.store"].user.id],
        });
        const thread = this.insert({
            id,
            model: "mail.channel",
            name,
            type: "channel",
            serverData: { channel: { avatarCacheKey: "hello" } },
        });
        this.sortChannels();
        this.open(thread);
        return thread;
    }

    async joinChat(id) {
        const data = await this.orm.call("mail.channel", "channel_get", [], {
            partners_to: [id],
        });
        return this.insert({
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
        this.remove(channel);
        this.setDiscussThread(
            this.services["mail.store"].discuss.channels.threads[0]
                ? this.services["mail.store"].threads[
                      this.services["mail.store"].discuss.channels.threads[0]
                  ]
                : this.services["mail.store"].discuss.inbox
        );
    }

    /**
     * @param {import("@mail/core/thread_model").Thread} thread
     * @param {boolean} pushState
     */
    setDiscussThread(thread, pushState = true) {
        this.services["mail.store"].discuss.threadLocalId = thread.localId;
        const activeId =
            typeof thread.id === "string" ? `mail.box_${thread.id}` : `mail.channel_${thread.id}`;
        this.services["mail.store"].discuss.activeTab = !this.services["mail.store"].isSmall
            ? "all"
            : thread.model === "mail.box"
            ? "mailbox"
            : ["chat", "group"].includes(thread.type)
            ? "chat"
            : "channel";
        if (pushState) {
            this.router.pushState({ active_id: activeId });
        }
    }

    async createGroupChat({ default_display_mode, partners_to }) {
        const data = await this.orm.call("mail.channel", "create_group", [], {
            default_display_mode,
            partners_to,
        });
        const channel = this.createChannelThread(data);
        this.sortChannels();
        this.open(channel);
        return channel;
    }

    remove(thread) {
        removeFromArray(this.services["mail.store"].discuss.chats.threads, thread.localId);
        removeFromArray(this.services["mail.store"].discuss.channels.threads, thread.localId);
        delete this.services["mail.store"].threads[thread.localId];
    }

    /**
     * @param {import("@mail/core/thread_model").Thread} thread
     * @param {Object} data
     */
    update(thread, data) {
        const { attachments, serverData, ...remainingData } = data;
        assignDefined(thread, remainingData);
        if (attachments) {
            // smart process to avoid triggering reactives when there is no change between the 2 arrays
            replaceArrayWithCompare(
                thread.attachments,
                attachments.map((attachment) =>
                    this.services["mail.attachment"].insert(attachment)
                ),
                (a1, a2) => a1.id === a2.id
            );
        }
        if (serverData) {
            assignDefined(thread, serverData, [
                "uuid",
                "authorizedGroupFullName",
                "description",
                "hasWriteAccess",
                "is_pinned",
                "message_needaction_counter",
                "name",
                "state",
                "group_based_subscription",
                "last_interest_dt",
                "defaultDisplayMode",
            ]);
            thread.lastServerMessageId = serverData.last_message_id ?? thread.lastServerMessageId;
            if (thread.model === "mail.channel" && serverData.channel) {
                thread.channel = assignDefined(thread.channel ?? {}, serverData.channel);
            }

            thread.memberCount = serverData.channel?.memberCount ?? thread.memberCount;
            if (serverData.channel && "serverMessageUnreadCounter" in serverData.channel) {
                thread.serverMessageUnreadCounter = serverData.channel.serverMessageUnreadCounter;
            }
            if ("seen_message_id" in serverData) {
                thread.serverLastSeenMsgBySelf = serverData.seen_message_id;
            }
            if ("rtc_inviting_session" in serverData) {
                this.env.bus.trigger("mail.rtc/updateSessions", {
                    thread,
                    record: serverData.rtc_inviting_session,
                });
                thread.invitingRtcSessionId = serverData.rtc_inviting_session.id;
                if (!this.services["mail.store"].ringingThreads.includes(thread.localId)) {
                    this.services["mail.store"].ringingThreads.push(thread.localId);
                }
            }
            if ("rtcInvitingSession" in serverData) {
                if (Array.isArray(serverData.rtcInvitingSession)) {
                    if (serverData.rtcInvitingSession[0][0] === "unlink") {
                        thread.invitingRtcSessionId = undefined;
                        removeFromArray(this.services["mail.store"].ringingThreads, thread.localId);
                    }
                    return;
                }
                this.env.bus.trigger("mail.rtc/updateSessions", {
                    thread,
                    record: serverData.rtcInvitingSession,
                });
                thread.invitingRtcSessionId = serverData.rtcInvitingSession.id;
                this.services["mail.store"].ringingThreads.push(thread.localId);
            }
            if (thread.type === "chat" && serverData.channel) {
                thread.customName = serverData.channel.custom_channel_name;
            }
            if (serverData.channel?.channelMembers) {
                for (const [command, membersData] of serverData.channel.channelMembers) {
                    const members = Array.isArray(membersData) ? membersData : [membersData];
                    for (const memberData of members) {
                        const member = this.services["mail.channel.member"].insert([
                            command,
                            memberData,
                        ]);
                        if (thread.type !== "chat") {
                            continue;
                        }
                        if (
                            member.persona.id !== this.services["mail.store"].user?.id ||
                            (serverData.channel.channelMembers[0][1].length === 1 &&
                                member.persona.id === this.services["mail.store"].user?.id)
                        ) {
                            thread.chatPartnerId = member.persona.id;
                        }
                    }
                }
            }
            if ("rtcSessions" in serverData) {
                // FIXME this prevents cyclic dependencies between mail.thread and mail.rtc
                this.env.bus.trigger("mail.rtc/updateSessions", {
                    thread,
                    commands: serverData.rtcSessions,
                });
            }
            if ("invitedMembers" in serverData) {
                if (!serverData.invitedMembers) {
                    thread.invitedMemberIds.clear();
                    return;
                }
                const command = serverData.invitedMembers[0][0];
                const members = serverData.invitedMembers[0][1];
                switch (command) {
                    case "insert":
                        if (members) {
                            for (const member of members) {
                                const record = this.services["mail.channel.member"].insert(member);
                                thread.invitedMemberIds.add(record.id);
                            }
                        }
                        break;
                    case "unlink":
                    case "insert-and-unlink":
                        // eslint-disable-next-line no-case-declarations
                        for (const member of members) {
                            thread.invitedMemberIds.delete(member.id);
                        }
                        break;
                }
            }
            if ("seen_partners_info" in serverData) {
                thread.seenInfos = serverData.seen_partners_info.map(
                    ({ fetched_message_id, partner_id, seen_message_id }) => {
                        return {
                            lastFetchedMessage: fetched_message_id
                                ? this.services["mail.persona"].insert({ id: fetched_message_id })
                                : undefined,
                            lastSeenMessage: seen_message_id
                                ? this.services["mail.persona"].insert({ id: seen_message_id })
                                : undefined,
                            partner: this.services["mail.persona"].insert({
                                id: partner_id,
                                type: "partner",
                            }),
                        };
                    }
                );
            }
        }
    }

    /**
     * @param {Object} data
     * @returns {Thread}
     */
    insert(data) {
        if (!("id" in data)) {
            throw new Error("Cannot insert thread: id is missing in data");
        }
        if (!("model" in data)) {
            throw new Error("Cannot insert thread: model is missing in data");
        }
        const localId = createLocalId(data.model, data.id);
        if (localId in this.services["mail.store"].threads) {
            const thread = this.services["mail.store"].threads[localId];
            this.update(thread, data);
            return thread;
        }
        let thread = new Thread(this.services["mail.store"], data);
        onChange(thread, "isLoaded", () => thread.isLoadedDeferred.resolve());
        onChange(thread, "channelMembers", () =>
            this.services["mail.store"].updateBusSubscription()
        );
        onChange(thread, "is_pinned", () => {
            if (
                !thread.is_pinned &&
                this.services["mail.store"].discuss.threadLocalId === thread.localId
            ) {
                this.services["mail.store"].discuss.threadLocalId = null;
            }
        });
        thread = this.services["mail.store"].threads[thread.localId] = thread;
        this.update(thread, data);
        this.insertComposer({ thread });
        return thread;
    }

    /**
     * @param {Object} data
     * @returns {Composer}
     */
    insertComposer(data) {
        const { message, thread } = data;
        if (Boolean(message) === Boolean(thread)) {
            throw new Error("Composer shall have a thread xor a message.");
        }
        let composer = (thread ?? message)?.composer;
        if (!composer) {
            composer = new Composer(this.services["mail.store"], data);
        }
        if ("textInputContent" in data) {
            composer.textInputContent = data.textInputContent;
        }
        if ("selection" in data) {
            Object.assign(composer.selection, data.selection);
        }
        return composer;
    }

    /**
     * @param {Thread} thread
     * @param {string} body
     */
    async post(thread, body, { attachments = [], isNote = false, parentId, rawMentions }) {
        const command = this.services["mail.store"].user
            ? this.services["mail.message"].getCommandFromText(thread, body)
            : undefined;
        if (command) {
            await this.executeCommand(thread, command, body);
            return;
        }
        let tmpMsg;
        const subtype = isNote ? "mail.mt_note" : "mail.mt_comment";
        const validMentions = this.services["mail.store"].user
            ? this.services["mail.message"].getMentionsFromText(rawMentions, body)
            : undefined;
        const partner_ids = validMentions?.partners.map((partner) => partner.id);
        if (!isNote) {
            const recipientIds = thread.suggestedRecipients
                .filter((recipient) => recipient.persona && recipient.checked)
                .map((recipient) => recipient.persona.id);
            partner_ids?.push(...recipientIds);
        }
        const lastMessageId = this.services["mail.message"].getLastMessageId();
        const tmpId = lastMessageId + 0.01;
        const params = {
            context: {
                temporary_id: tmpId,
            },
            post_data: {
                body: await prettifyMessageContent(body, validMentions),
                attachment_ids: attachments.map(({ id }) => id),
                message_type: "comment",
                partner_ids,
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
            const tmpData = {
                id: tmpId,
                attachments: attachments,
                res_id: thread.id,
                model: "mail.channel",
            };
            if (this.services["mail.store"].user) {
                tmpData.author = this.services["mail.store"].self;
            }
            if (this.services["mail.store"].guest) {
                tmpData.guestAuthor = this.services["mail.store"].self;
            }
            if (parentId) {
                tmpData.parentMessage = this.services["mail.store"].messages[parentId];
            }
            const prettyContent = await prettifyMessageContent(body, validMentions);
            const { emojis } = await loadEmoji();
            const recentEmojis = JSON.parse(
                browser.localStorage.getItem("mail.emoji.frequent") || "{}"
            );
            const emojisInContent =
                prettyContent.match(/\p{Emoji_Presentation}|\p{Emoji}\uFE0F/gu) ?? [];
            for (const codepoints of emojisInContent) {
                if (emojis.some((emoji) => emoji.codepoints === codepoints)) {
                    recentEmojis[codepoints] ??= 0;
                    recentEmojis[codepoints]++;
                }
            }
            browser.localStorage.setItem("mail.emoji.frequent", JSON.stringify(recentEmojis));
            tmpMsg = this.services["mail.message"].insert({
                ...tmpData,
                body: markup(prettyContent),
                res_id: thread.id,
                model: thread.model,
                temporary_id: tmpId,
            });
        }
        const data = await this.rpc("/mail/message/post", params);
        if (data.parentMessage) {
            data.parentMessage.body = data.parentMessage.body
                ? markup(data.parentMessage.body)
                : data.parentMessage.body;
        }
        if (data.id in this.services["mail.store"].messages) {
            data.temporary_id = null;
        }
        const message = this.services["mail.message"].insert(
            Object.assign(data, { body: markup(data.body) })
        );
        if (!message.isEmpty) {
            this.rpc("/mail/link_preview", { message_id: data.id }, { silent: true });
        }
        if (thread.type !== "chatter") {
            removeFromArrayWithPredicate(thread.messages, ({ id }) => id === tmpMsg.id);
            delete this.services["mail.store"].messages[tmpMsg.id];
        }
        return message;
    }

    /**
     * @param {Thread} thread
     */
    isUnread(thread) {
        return this.localMessageUnreadCounter(thread) > 0;
    }

    /**
     * @param {Thread} thread
     */
    canLeave(thread) {
        return (
            ["channel", "group"].includes(thread.type) &&
            !thread.message_needaction_counter &&
            !thread.group_based_subscription
        );
    }
    /**
     *
     * @param {Thread} thread
     */
    canUnpin(thread) {
        return thread.type === "chat" && this.getCounter(thread) === 0;
    }

    /**
     * @param {Thread} thread
     */
    getCounter(thread) {
        if (thread.type === "mailbox") {
            return thread.counter;
        }
        if (thread.type === "chat" || thread.type === "group") {
            return this.localMessageUnreadCounter(thread);
        }
        return thread.message_needaction_counter;
    }

    /**
     * @param {Thread} thread
     */
    localMessageUnreadCounter(thread) {
        let baseCounter = thread.serverMessageUnreadCounter;
        let countFromId = thread.lastServerMessageId ? thread.lastServerMessageId : 0;
        const lastSeenMessageId = this.lastSeenBySelfMessageId(thread);
        const firstMessage = thread.messages[0];
        if (firstMessage && (lastSeenMessageId === false || lastSeenMessageId >= firstMessage.id)) {
            baseCounter = 0;
            countFromId = lastSeenMessageId || 0;
        }
        return thread.messages.reduce((total, message) => {
            if (message.id <= countFromId || message.temporary_id) {
                return total;
            }
            return total + 1;
        }, baseCounter);
    }

    /**
     * @param {Thread} thread
     */
    lastSeenBySelfMessageId(thread) {
        if (thread.model !== "mail.channel") {
            return null;
        }
        const firstMessage = thread.messages[0];
        if (firstMessage && thread.serverLastSeenMsgBySelf < firstMessage.id) {
            return thread.serverLastSeenMsgBySelf;
        }
        let lastSeenMessageId = thread.serverLastSeenMsgBySelf;
        for (const message of thread.messages) {
            if (message.id <= thread.serverLastSeenMsgBySelf) {
                continue;
            }
            if (message.temporary_id || message.isTransient) {
                lastSeenMessageId = message.id;
                continue;
            }
            return lastSeenMessageId;
        }
        return lastSeenMessageId;
    }

    getDiscussCategoryCounter(categoryId) {
        return this.services["mail.store"].discuss[categoryId].threads.reduce(
            (acc, threadLocalId) => {
                const channel = this.services["mail.store"].threads[threadLocalId];
                if (categoryId === "channels") {
                    return channel.message_needaction_counter > 0 ? acc + 1 : acc;
                } else {
                    return this.localMessageUnreadCounter(channel) > 0 ? acc + 1 : acc;
                }
            },
            0
        );
    }

    /**
     * @param {import("@mail/core/thread_model").Thread} thread
     * @param {number} index
     */
    async setMainAttachmentFromIndex(thread, index) {
        thread.mainAttachment = thread.attachmentsInWebClientView[index];
        await this.orm.call("ir.attachment", "register_as_main_attachment", [
            thread.mainAttachment.id,
        ]);
    }

    /**
     * @param {import("@mail/composer/composer_model").Composer} composer
     */
    clearComposer(composer) {
        composer.attachments.length = 0;
        composer.textInputContent = "";
        Object.assign(composer.selection, {
            start: 0,
            end: 0,
            direction: "none",
        });
    }

    /**
     * @param {import('@mail/core/persona_model').Persona} persona
     * @param {import("@mail/core/thread_model").Thread} [thread]
     */
    avatarUrl(persona, thread) {
        if (!persona) {
            return DEFAULT_AVATAR;
        }
        if (thread?.model === "mail.channel") {
            if (persona.type === "partner") {
                return url(`/mail/channel/${thread.id}/partner/${persona.id}/avatar_128`);
            }
            if (persona.type === "guest") {
                return url(`/mail/channel/${thread.id}/guest/${persona.id}/avatar_128`);
            }
        }
        if (persona.type === "partner" && persona?.id) {
            const avatar = url("/web/image", {
                field: "avatar_128",
                id: persona.id,
                model: "res.partner",
            });
            return avatar;
        }
        if (persona.user?.id) {
            const avatar = url("/web/image", {
                field: "avatar_128",
                id: persona.user.id,
                model: "res.users",
            });
            return avatar;
        }
        return DEFAULT_AVATAR;
    }
}

export const threadService = {
    dependencies: [
        "mail.attachment",
        "mail.channel.member",
        "mail.store",
        "orm",
        "rpc",
        "notification",
        "router",
        "mail.persona",
        "mail.message",
    ],
    start(env, services) {
        return new ThreadService(env, services);
    },
};

registry.category("services").add("mail.thread", threadService);
