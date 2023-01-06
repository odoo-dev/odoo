/* @odoo-module */

import { markup, reactive } from "@odoo/owl";
import { Deferred } from "@web/core/utils/concurrency";
import { memoize } from "@web/core/utils/functions";
import { cleanTerm, htmlToTextContentInline } from "@mail/new/utils/format";
import { removeFromArray } from "@mail/new/utils/arrays";
import { ChatWindow } from "./chat_window_model";
import { Thread } from "./thread_model";
import { Partner } from "./partner_model";
import { Guest } from "./guest_model";
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

const PREVIEW_MSG_MAX_SIZE = 350; // optimal for native English speakers
export const OTHER_LONG_TYPING = 60000;

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
        state,
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
        userSettings,
        chatWindow,
        thread,
        message
    ) {
        this.env = env;
        this.rpc = rpc;
        this.orm = orm;
        this.notification = notification;
        this.soundEffects = soundEffects;
        this.userSettings = userSettings;
        this.chatWindow = chatWindow;
        this.thread = thread;
        this.message = message;
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
        this.state = state;
        Object.assign(this.state, {
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
            currentGuest: null,
            /** @type {Object.<number, import("@mail/new/core/channel_member_model").ChannelMember>} */
            channelMembers: {},
            companyName: "",
            /** @type {Object.<number, import("@mail/new/core/notification_model").Notification>} */
            notifications: {},
            notificationGroups: [],
            /** @type {Object.<number, import("@mail/new/core/follower_model").Follower>} */
            followers: {},
            /** @type {Object.<number, Partner>} */
            partners: {},
            partnerRoot: {},
            guests: {},
            /** @type {import("@mail/new/rtc/rtc_session_model").rtcSession{}} */
            rtcSessions: {},
            users: {},
            internalUserGroupId: null,
            registeredImStatusPartners: this.registeredImStatusPartners,
            outOfFocusUnreadMessageCounter: 0,
            // messaging menu
            menu: {
                counter: 0,
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
            if (data.current_partner) {
                Partner.insert(this.state, data.current_partner);
            }
            if (data.currentGuest) {
                this.state.currentGuest = Guest.insert(this.state, data.currentGuest);
            }
            this.loadFailures();
            this.state.partnerRoot = Partner.insert(this.state, data.partner_root);
            for (const channelData of data.channels) {
                const thread = this.thread.createChannelThread(channelData);
                if (channelData.is_minimized && channelData.state !== "closed") {
                    ChatWindow.insert(this.state, {
                        autofocus: 0,
                        folded: channelData.state === "folded",
                        thread,
                    });
                }
            }
            this.thread.sortChannels();
            const settings = data.current_user_settings;
            this.userSettings.updateFromCommands(settings);
            this.userSettings.id = settings.id;
            this.state.companyName = data.companyName;
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
            messages.map((messageData) =>
                Message.insert(this.state, {
                    ...messageData,
                    body: messageData.body ? markup(messageData.body) : messageData.body,
                    // implicit: failures are sent by the server at
                    // initialization only if the current partner is
                    // author of the message
                    author: this.state.partners[this.state.user.partnerId],
                })
            );
            this.state.notificationGroups.sort((n1, n2) => n2.lastMessage.id - n1.lastMessage.id);
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
                        Promise.resolve(channel ?? this.thread.joinChat(message.author.id)).then(
                            (channel) => {
                                if ("parentMessage" in message && message.parentMessage.body) {
                                    message.parentMessage.body = markup(message.parentMessage.body);
                                }
                                const data = Object.assign(message, { body: markup(message.body) });
                                Message.insert(this.state, data, channel);
                                if (
                                    !this.presence.isOdooFocused() &&
                                    channel.type === "chat" &&
                                    channel.chatPartnerId !== this.state.partnerRoot.id
                                ) {
                                    this.notifyOutOfFocusMessage(message, channel);
                                }
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
                        if (notif.payload.RtcSession) {
                            RtcSession.insert(this.state, notif.payload.RtcSession);
                        }
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
                        if (notif.payload.Guest) {
                            const guests = Array.isArray(notif.payload.Guest)
                                ? notif.payload.Guest
                                : [notif.payload.Guest];
                            for (const guest of guests) {
                                if (guest.im_status) {
                                    Guest.insert(this.state, guest);
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
                            Message.insert(this.state, {
                                ...messageData,
                                body: messageData.body
                                    ? markup(messageData.body)
                                    : messageData.body,
                            });
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
                        id: notif.payload.channel.id,
                        model: "mail.channel",
                        serverData: notif.payload,
                        type: notif.payload.channel.channel_type,
                    });
                    break;
                case "mail.channel/transient_message":
                    return this.message.createTransient(
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
                        this.thread.fetchMessages(this.state.discuss.inbox);
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
                        this.message.updateStarred(message, starred);
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
                case "mail.message/notification_update":
                    {
                        notif.payload.elements.map((message) => {
                            Message.insert(this.state, {
                                ...message,
                                body: markup(message.body),
                                // implicit: failures are sent by the server at
                                // initialization only if the current partner is
                                // author of the message
                                author: this.state.partners[this.state.user.partnerId],
                            });
                        });
                    }
                    break;
            }
        }
    }

    _updateRtcSessions(channelId, sessionsData, command) {
        const channel = this.state.threads[createLocalId("mail.channel", channelId)];
        if (!channel) {
            return;
        }
        const oldCount = Object.keys(channel.rtcSessions).length;
        switch (command) {
            case "insert-and-unlink":
                for (const sessionData of sessionsData) {
                    RtcSession.delete(this.state, sessionData.id);
                }
                break;
            case "insert":
                for (const sessionData of sessionsData) {
                    const session = RtcSession.insert(this.state, sessionData);
                    channel.rtcSessions[session.id] = session;
                }
                break;
        }
        if (Object.keys(channel.rtcSessions).length > oldCount) {
            this.soundEffects.play("channel-join");
        } else if (Object.keys(channel.rtcSessions).length < oldCount) {
            this.soundEffects.play("member-leave");
        }
    }

    // -------------------------------------------------------------------------
    // actions that can be performed on the messaging system
    // -------------------------------------------------------------------------

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

    openDocument({ id, model }) {
        this.env.services.action.doAction({
            type: "ir.actions.act_window",
            res_model: model,
            views: [[false, "form"]],
            res_id: id,
        });
    }

    async unlinkAttachment(attachment) {
        return this.rpc("/mail/attachment/delete", {
            attachment_id: attachment.id,
        });
    }
}
