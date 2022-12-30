/* @odoo-module */

import { markup, reactive } from "@odoo/owl";
import { Deferred } from "@web/core/utils/concurrency";
import { memoize } from "@web/core/utils/functions";
import { registry } from "@web/core/registry";
import {
    prettifyMessageContent,
    convertBrToLineBreak,
    cleanTerm,
    htmlToTextContentInline,
} from "@mail/new/utils/format";
import { removeFromArray } from "@mail/new/utils/arrays";
import { ChatWindow } from "./chat_window_model";
import { Thread } from "./thread_model";
import { Partner } from "./partner_model";
import { ChannelMember } from "../core/channel_member_model";
import { RtcSession } from "@mail/new/rtc/rtc_session_model";
import { LinkPreview } from "./link_preview_model";
import { Message } from "./message_model";
import { CannedResponse } from "./canned_response_model";
import { browser } from "@web/core/browser/browser";
import { sprintf } from "@web/core/utils/strings";
import { _t } from "@web/core/l10n/translation";
import { url } from "@web/core/utils/urls";
import { createLocalId } from "./thread_model.create_local_id";
import { Failure } from "./failure_model";

const PREVIEW_MSG_MAX_SIZE = 350; // optimal for native English speakers
const FETCH_MSG_LIMIT = 30;
export const OTHER_LONG_TYPING = 60000;

const commandRegistry = registry.category("mail.channel_commands");

export const asyncMethods = [
    "fetchPreviews",
    "postMessage",
    "scheduleActivity",
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

    setup(
        env,
        rpc,
        orm,
        user,
        router,
        bus,
        initialThreadLocalId,
        im_status,
        notification,
        multiTab,
        presence,
        soundEffects,
        userSettings
    ) {
        this.env = env;
        this.rpc = rpc;
        this.orm = orm;
        this.notification = notification;
        this.soundEffects = soundEffects;
        this.userSettings = userSettings;
        this.nextId = 1;
        this.router = router;
        this.bus = bus;
        this.multiTab = multiTab;
        this.presence = presence;
        this.isReady = new Deferred();
        this.imStatusService = im_status;
        this.outOfFocusAudio = new Audio();
        this.outOfFocusAudio.src = this.outOfFocusAudio.canPlayType("audio/ogg; codecs=vorbis")
            ? url("/mail/static/src/audio/ting.ogg")
            : url("/mail/static/src/audio/ting.mp3");
        this.bus.addEventListener("window_focus", () => {
            this.state.outOfFocusUnreadMessageCounter = 0;
            this.bus.trigger("set_title_part", {
                part: "_chat",
            });
        });
        this.registeredImStatusPartners = reactive([], () => this.updateImStatusRegistration());
        this.state = reactive({
            /** @type {Object.<number, import("@mail/new/core/activity_model").Activity>} */
            activities: {},
            activityCounter: 0,
            get isSmall() {
                return env.isSmall;
            },
            // base data
            user: {
                partnerId: user.partnerId,
                uid: user.context.uid,
                avatarUrl: `/web/image?field=avatar_128&id=${user.userId}&model=res.users`,
                isAdmin: user.isAdmin,
            },
            /** @type {Object.<number, import("@mail/new/core/channel_member_model").ChannelMember>} */
            channelMembers: {},
            /** @type {Object.<number, import("@mail/new/core/notification_model").Notification>} */
            notifications: {},
            notificationGroups: {},
            /** @type {Object.<number, import("@mail/new/core/follower_model").Follower>} */
            followers: {},
            /** @type {Object.<number, Partner>} */
            partners: {},
            partnerRoot: {},
            rtcSessions: new Map(),
            /** @type {Object.<number, import("@mail/new/core/message_model").Message>} */
            messages: {},
            /** @type {{[key: string|number]: Thread}} */
            threads: {},
            users: {},
            internalUserGroupId: null,
            registeredImStatusPartners: this.registeredImStatusPartners,
            outOfFocusUnreadMessageCounter: 0,
            // messaging menu
            menu: {
                counter: 0,
                failures: [],
            },
            // discuss app
            discuss: {
                isActive: false,
                messageToReplyTo: null,
                threadLocalId: initialThreadLocalId,
                channels: {
                    extraClass: "o-mail-category-channel",
                    id: "channels",
                    name: _t("Channels"),
                    isOpen: false,
                    canView: true,
                    canAdd: true,
                    addTitle: _t("Add or join a channel"),
                    counter: 0,
                    threads: [], // list of ids
                },
                chats: {
                    extraClass: "o-mail-category-chat",
                    id: "chats",
                    name: _t("Direct messages"),
                    isOpen: false,
                    canView: false,
                    canAdd: true,
                    addTitle: _t("Start a conversation"),
                    counter: 0,
                    threads: [], // list of ids
                },
                // mailboxes in sidebar
                /** @type {Thread} */
                inbox: null,
                /** @type {Thread} */
                starred: null,
                /** @type {Thread} */
                history: null,
            },
            /** @type {import("@mail/new/core/chat_window_model").ChatWindow[]} */
            chatWindows: [],
            cannedResponses: [],
        });
        this.state.discuss.inbox = Thread.insert(this.state, {
            id: "inbox",
            model: "mail.box",
            name: _t("Inbox"),
            type: "mailbox",
        });
        this.state.discuss.starred = Thread.insert(this.state, {
            id: "starred",
            model: "mail.box",
            name: _t("Starred"),
            type: "mailbox",
            counter: 0,
        });
        this.state.discuss.history = Thread.insert(this.state, {
            id: "history",
            model: "mail.box",
            name: _t("History"),
            type: "mailbox",
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
            this.loadFailures();
            this.state.partnerRoot = Partner.insert(this.state, data.partner_root);
            for (const channelData of data.channels) {
                const thread = this.createChannelThread(channelData);
                if (channelData.is_minimized && channelData.state !== "closed") {
                    ChatWindow.insert(this.state, {
                        autofocus: 0,
                        folded: channelData.state === "folded",
                        thread,
                    });
                }
            }
            this.sortChannels();
            const settings = data.current_user_settings;
            this.userSettings.updateFromCommands(settings);
            this.state.discuss.channels.isOpen = settings.is_discuss_sidebar_category_channel_open;
            this.state.discuss.chats.isOpen = settings.is_discuss_sidebar_category_chat_open;
            this.state.discuss.inbox.counter = data.needaction_inbox_counter;
            this.state.internalUserGroupId = data.internalUserGroupId;
            this.state.discuss.starred.counter = data.starred_counter;
            (data.shortcodes ?? []).forEach((code) => {
                CannedResponse.insert(this.state, code);
            });
            this.isReady.resolve();
        });
    }

    loadFailures() {
        this.rpc("/mail/load_message_failures", {}, { silent: true }).then((messages) => {
            const notifications = messages
                .map(
                    (messageData) =>
                        Message.insert(this.state, {
                            ...messageData,
                            // implicit: failures are sent by the server at
                            // initialization only if the current partner is
                            // author of the message
                            author: this.state.partners[this.state.user.partnerId],
                        }).notifications
                )
                .flat();
            const failuresByModel = {};
            const modelNameToResModel = {};
            for (const notification of notifications) {
                const message = notification.message;
                const modelName = message.originThread.modelName;
                modelNameToResModel[modelName] = message.resModel;
                failuresByModel[modelName] ??= {};
                failuresByModel[modelName][notification.notification_type] ??= [];
                failuresByModel[modelName][notification.notification_type].push(notification);
            }
            for (const [modelName, failuresByType] of Object.entries(failuresByModel)) {
                for (const [type, notifications] of Object.entries(failuresByType)) {
                    Failure.insert(this.state, {
                        modelName,
                        type,
                        resModel: modelNameToResModel[modelName],
                        notifications,
                    });
                }
            }
            this.state.menu.failures.sort((f1, f2) => f2.lastMessage.id - f1.lastMessage.id);
        });
    }

    get visibleChatWindows() {
        return ChatWindow.visibleChatWindows(this.state);
    }

    get hiddenChatWindows() {
        return ChatWindow.hiddenChatWindows(this.state);
    }

    get maxVisibleChatWindows() {
        return ChatWindow.maxVisibleChatWindows(this.state);
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

    async createGroupChat({ default_display_mode, partners_to }) {
        const data = await this.orm.call("mail.channel", "create_group", [], {
            default_display_mode,
            partners_to,
        });
        const channel = this.createChannelThread(data);
        this.sortChannels();
        this.openDiscussion(channel);
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
            Partner.insert(this.state, channelMember.persona.partner);
            ChannelMember.insert(this.state, {
                id: channelMember.id,
                partnerId: channelMember.persona.partner.id,
                threadId: thread.id,
            });
        }
    }

    /**
     * @param {import("@mail/new/core/activity_model").Activity} activity
     * @param {number[]} attachmentIds
     */
    async markAsDone(activity, attachmentIds = []) {
        await this.orm.call("mail.activity", "action_feedback", [[activity.id]], {
            attachment_ids: attachmentIds,
            feedback: activity.feedback,
        });
    }

    async scheduleActivity(resModel, resId, activityId = false, defaultActivityTypeId = undefined) {
        const context = {
            default_res_model: resModel,
            default_res_id: resId,
        };
        if (defaultActivityTypeId !== undefined) {
            context.default_activity_type_id = defaultActivityTypeId;
        }
        return new Promise((resolve) => {
            this.env.services.action.doAction(
                {
                    type: "ir.actions.act_window",
                    name: _t("Schedule Activity"),
                    res_model: "mail.activity",
                    view_mode: "form",
                    views: [[false, "form"]],
                    target: "new",
                    context,
                    res_id: activityId,
                },
                { onClose: resolve }
            );
        });
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
            this.state.threads[createLocalId("mail.channel", threadId)]
        );
    }

    // -------------------------------------------------------------------------
    // process notifications received by the bus
    // -------------------------------------------------------------------------

    notifyOutOfFocusMessage(message, channel) {
        const author = message.author;
        let notificationTitle;
        if (!author) {
            notificationTitle = _t("New message");
        } else {
            if (channel.channel_type === "channel") {
                notificationTitle = sprintf(_t("%(author name)s from %(channel name)s"), {
                    "author name": author.name,
                    "channel name": channel.displayName,
                });
            } else {
                notificationTitle = author.name;
            }
        }
        const notificationContent = escape(
            htmlToTextContentInline(message.body).substr(0, PREVIEW_MSG_MAX_SIZE)
        );
        this.sendNotification({
            message: notificationContent,
            title: notificationTitle,
            type: "info",
        });
        this.state.outOfFocusUnreadMessageCounter++;
        const titlePattern =
            this.state.outOfFocusUnreadMessageCounter === 1 ? _t("%s Message") : _t("%s Messages");
        this.bus.trigger("set_title_part", {
            part: "_chat",
            title: sprintf(titlePattern, this.state.outOfFocusUnreadMessageCounter),
        });
    }

    /**
     * Send a notification, preferably a native one. If native
     * notifications are disable or unavailable on the current
     * platform, fallback on the notification service.
     *
     * @param {Object} param0
     * @param {string} [param0.message] The body of the
     * notification.
     * @param {string} [param0.title] The title of the notification.
     * @param {string} [param0.type] The type to be passed to the no
     * service when native notifications can't be sent.
     */
    sendNotification({ message, title, type }) {
        if (!this.canSendNativeNotification) {
            this.sendOdooNotification(message, { title, type });
            return;
        }
        if (!this.multiTab.isOnMainTab()) {
            return;
        }
        try {
            this.sendNativeNotification(title, message);
        } catch (error) {
            // Notification without Serviceworker in Chrome Android doesn't works anymore
            // So we fallback to the notification service in this case
            // https://bugs.chromium.org/p/chromium/issues/detail?id=481856
            if (error.message.includes("ServiceWorkerRegistration")) {
                this.sendOdooNotification(message, { title, type });
            } else {
                throw error;
            }
        }
    }

    /**
     * @param {string} message
     * @param {Object} options
     */
    async sendOdooNotification(message, options) {
        this.notification.add(message, options);
        if (this.canPlayAudio && this.multiTab.isOnMainTab()) {
            try {
                await this.outOfFocusAudio.play();
            } catch {
                // Ignore errors due to the user not having interracted
                // with the page before playing the sound.
            }
        }
    }

    /**
     * @param {string} title
     * @param {string} message
     */
    sendNativeNotification(title, message) {
        const notification = new Notification(
            // The native Notification API works with plain text and not HTML
            // unescaping is safe because done only at the **last** step
            _.unescape(title),
            {
                body: _.unescape(message),
                icon: this.icon,
            }
        );
        notification.addEventListener("click", ({ target: notification }) => {
            window.focus();
            notification.close();
        });
    }

    get canPlayAudio() {
        return typeof Audio !== "undefined";
    }

    get canSendNativeNotification() {
        return Boolean(browser.Notification && browser.Notification.permission === "granted");
    }

    createNotificationMessage(message, channel) {
        const data = Object.assign(message, { body: markup(message.body) });
        Message.insert(this.state, data, channel);
        if (
            !this.presence.isOdooFocused() &&
            channel.type === "chat" &&
            channel.chatPartnerId !== this.state.partnerRoot.id
        ) {
            this.notifyOutOfFocusMessage(message, channel);
        }
    }

    handleNotification(notifications) {
        console.log("notifications received", notifications);
        for (const notif of notifications) {
            switch (notif.type) {
                case "mail.activity/updated":
                    if (notif.payload.activity_created) {
                        this.state.activityCounter++;
                    }
                    if (notif.payload.activity_deleted) {
                        this.state.activityCounter--;
                    }
                    break;
                case "mail.channel/new_message":
                    {
                        const { id, message } = notif.payload;
                        const channel = this.state.threads[createLocalId("mail.channel", id)];
                        Promise.resolve(channel ?? this.joinChat(message.author.id)).then(
                            (channel) => {
                                this.createNotificationMessage(message, channel);
                                ChatWindow.insert(this.state, {
                                    thread: channel,
                                });
                            }
                        );
                    }
                    break;
                case "mail.channel/leave":
                    {
                        const thread = Thread.insert(this.state, {
                            ...notif.payload,
                            model: "mail.channel",
                        });
                        removeFromArray(this.state.discuss.channels.threads, thread.localId);
                        if (thread.localId === this.state.discuss.threadLocalId) {
                            this.state.discuss.threadLocalId = undefined;
                        }
                        this.notification.add(
                            sprintf(_t("You unsubscribed from %s."), thread.displayName),
                            { type: "info" }
                        );
                    }
                    break;
                case "mail.channel/rtc_sessions_update":
                    {
                        const { id, rtcSessions } = notif.payload;
                        const sessionsData = rtcSessions[0][1];
                        const command = rtcSessions[0][0];
                        this._updateRtcSessions(id, sessionsData, command);
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
                        const { "res.users.settings": userSettingsData } = notif.payload;
                        if (userSettingsData) {
                            this.userSettings.updateFromCommands(userSettingsData);
                        }
                    }
                    break;
                case "mail.channel/joined": {
                    const { channel, invited_by_user_id: invitedByUserId } = notif.payload;
                    const thread = Thread.insert(this.state, {
                        ...channel,
                        model: "mail.channel",
                        serverData: {
                            channel: channel.channel,
                        },
                        type: channel.channel.channel_type,
                    });
                    if (invitedByUserId !== this.state.user.uid) {
                        this.notification.add(
                            sprintf(_t("You have been invited to #%s"), thread.displayName),
                            { type: "info" }
                        );
                    }
                    break;
                }
                case "mail.channel/legacy_insert":
                    Thread.insert(this.state, {
                        ...notif.payload,
                        model: "mail.channel",
                        serverData: {
                            channel: notif.payload.channel,
                        },
                        type: notif.payload.channel.channel_type,
                    });
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
                case "mail.message/mark_as_read": {
                    const { message_ids: messageIds, needaction_inbox_counter } = notif.payload;
                    for (const messageId of messageIds) {
                        // We need to ignore all not yet known messages because we don't want them
                        // to be shown partially as they would be linked directly to cache.
                        // Furthermore, server should not send back all messageIds marked as read
                        // but something like last read messageId or something like that.
                        // (just imagine you mark 1000 messages as read ... )
                        const message = this.state.messages[messageId];
                        if (!message) {
                            continue;
                        }
                        // update thread counter (before removing message from Inbox, to ensure isNeedaction check is correct)
                        const originThread = message.originThread;
                        if (originThread && message.isNeedaction) {
                            originThread.message_needaction_counter--;
                        }
                        // move messages from Inbox to history
                        const partnerIndex = message.needaction_partner_ids.find(
                            (p) => p === this.state.user.partnerId
                        );
                        removeFromArray(message.needaction_partner_ids, partnerIndex);
                        removeFromArray(this.state.discuss.inbox.messages, messageId);
                        if (this.state.discuss.history.messages.length > 0) {
                            this.state.discuss.history.messages.push(messageId);
                        }
                    }
                    this.state.discuss.inbox.counter = needaction_inbox_counter;
                    if (
                        this.state.discuss.inbox.counter > this.state.discuss.inbox.messages.length
                    ) {
                        this.fetchThreadMessages(this.state.discuss.inbox);
                    }
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
                        this.state.discuss.starred.sortMessages();
                    }
                    break;
                }
                case "mail.channel.member/seen": {
                    const { channel_id, last_message_id, partner_id } = notif.payload;
                    const channel = this.state.threads[createLocalId("mail.channel", channel_id)];
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
                    const channel =
                        this.state.threads[createLocalId("mail.channel", notif.payload.channel.id)];
                    const member = ChannelMember.insert(this.state, {
                        id: notif.payload.id,
                        partnerId: notif.payload.persona.partner.id,
                        threadId: channel.id,
                    });
                    Partner.insert(this.state, {
                        id: notif.payload.persona.partner.id,
                        name: notif.payload.persona.partner.name,
                    });
                    if (member.partner.id === this.state.user.partnerId) {
                        return;
                    }
                    if (isTyping) {
                        if (!channel.typingMembers.includes(member)) {
                            channel.typingMemberIds.push(member.id);
                        }
                        if (member.typingTimer) {
                            browser.clearTimeout(member.typingTimer);
                        }
                        member.typingTimer = browser.setTimeout(() => {
                            removeFromArray(channel.typingMemberIds, member.id);
                        }, OTHER_LONG_TYPING);
                    } else {
                        removeFromArray(channel.typingMemberIds, member.id);
                    }
                    break;
                }
                case "mail.channel/unpin": {
                    const thread =
                        this.state.threads[createLocalId("mail.channel", notif.payload.id)];
                    if (!thread) {
                        return;
                    }
                    this.state.threads[thread.localId]?.remove();
                    this.notification.add(
                        sprintf(_t("You unpinned your conversation with %s"), thread.displayName),
                        { type: "info" }
                    );
                    break;
                }
            }
        }
    }

    _updateRtcSessions(channelId, sessionsData, command) {
        const channel = this.state.threads[createLocalId("mail.channel", channelId)];
        if (!channel) {
            return;
        }
        const oldCount = channel.rtcSessions.size;
        switch (command) {
            case "insert-and-unlink":
                for (const sessionData of sessionsData) {
                    RtcSession.delete(this.state, sessionData.id);
                }
                break;
            case "insert":
                for (const sessionData of sessionsData) {
                    const session = RtcSession.insert(this.state, sessionData);
                    channel.rtcSessions.set(session.id, session);
                }
                break;
        }
        if (sessionsData.length > oldCount) {
            this.soundEffects.play("channel-join");
        }
        if (sessionsData.length < oldCount) {
            this.soundEffects.play("member-leave");
        }
    }

    // -------------------------------------------------------------------------
    // actions that can be performed on the messaging system
    // -------------------------------------------------------------------------

    setDiscussThread(thread) {
        this.state.discuss.threadLocalId = thread.localId;
        const activeId =
            typeof thread.id === "string" ? `mail.box_${thread.id}` : `mail.channel_${thread.id}`;
        this.router.pushState({ active_id: activeId });
    }

    getChatterThread(resModel, resId) {
        const localId = createLocalId(resModel, resId);
        if (localId in this.state.threads) {
            if (resId === false) {
                return this.state.threads[localId];
            }
            // to force a reload
            this.state.threads[localId].status = "new";
        }
        const thread = Thread.insert(this.state, {
            id: resId,
            model: resModel,
            type: "chatter",
        });
        if (resId === false) {
            const tmpId = `virtual${this.nextId++}`;
            const tmpData = {
                id: tmpId,
                author: { id: this.state.user.partnerId },
                body: _t("Creating a new record..."),
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
        if (requestList.includes("messages")) {
            this.fetchThreadMessagesNew(Thread.insert(this.state, { model: resModel, id: resId }));
        }
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

    async fetchThreadMessagesNew(thread) {
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

    async fetchThreadMessagesMore(thread) {
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
            if (["channel", "group", "chat"].includes(thread.type)) {
                ids.push(thread.id);
            }
        }
        if (ids.length) {
            const previews = await this.orm.call("mail.channel", "channel_fetch_preview", [ids]);
            for (const preview of previews) {
                const thread = this.state.threads[createLocalId("mail.channel", preview.id)];
                const data = Object.assign(preview.last_message, {
                    body: markup(preview.last_message.body),
                });
                Message.insert(this.state, data, thread);
            }
        }
    });

    async postMessage(thread, body, { attachments = [], isNote = false, parentId, rawMentions }) {
        const command = this.getCommandFromText(thread.type, body);
        if (command) {
            await this.executeCommand(thread, command, body);
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

    executeCommand(thread, command, body = "") {
        return this.orm.call("mail.channel", command.methodName, [[thread.id]], {
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

    async updateMessage(message, body, attachments = [], rawMentions) {
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

    async addReaction(message, content) {
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

    notifyChatWindowState(thread) {
        if (this.env.isSmall) {
            return;
        }
        if (thread?.model === "mail.channel") {
            return this.orm.silent.call("mail.channel", "channel_fold", [[thread.id]], {
                state: thread.state,
            });
        }
    }

    openDiscussion(thread, replaceNewMessageChatWindow) {
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
            this.notifyChatWindowState(thread);
        }
    }

    openNewMessageChatWindow() {
        if (this.state.chatWindows.some(({ thread }) => !thread)) {
            // New message chat window is already opened.
            return;
        }
        ChatWindow.insert(this.state);
    }

    closeNewMessageChatWindow() {
        this.state.chatWindows.find(({ thread }) => !thread)?.close();
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
        const data = await this.orm.call("mail.channel", "channel_create", [
            name,
            this.state.internalUserGroupId,
        ]);
        const channel = this.createChannelThread(data);
        this.sortChannels();
        this.openDiscussion(channel);
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

    async leaveChannel(channel) {
        await this.orm.call("mail.channel", "action_unfollow", [channel.id]);
        channel.remove();
        this.setDiscussThread(
            this.state.discuss.channels.threads[0]
                ? this.state.threads[this.state.discuss.channels.threads[0]]
                : this.state.discuss.inbox
        );
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
            this.openDiscussion(chat);
        }
    }

    async toggleStar(message) {
        await this.orm.call("mail.message", "toggle_message_starred", [[message.id]]);
    }

    async setDone(message) {
        await this.orm.call("mail.message", "set_message_done", [[message.id]]);
    }

    updateMessageStarredState(message, isStarred) {
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

    /**
     * @param {import("@mail/new/core/follower_model").Follower} follower
     */
    async removeFollower(follower) {
        await this.orm.call(follower.followedThread.model, "message_unsubscribe", [
            [follower.followedThread.id],
            [follower.partner.id],
        ]);
        follower.delete();
    }

    notify(params) {
        const { message, ...options } = params;
        return this.notification.add(message, options);
    }
}
