/* @odoo-module */

import { reactive } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { createLocalId } from "./thread_model.create_local_id";

export class Store {
    constructor(env) {
        this.env = env;
    }

    get isSmall() {
        return this.env.isSmall;
    }

    get self() {
        if (this.currentGuest) {
            return this.currentGuest;
        }
        return this.personas[createLocalId("partner", this.user.partnerId)];
    }

    // base data
    user = {
        partnerId: null,
        uid: null,
        avatarUrl: null,
        isAdmin: false,
    };
    currentGuest = null;

    /** @type {Object.<number, import("@mail/new/core/channel_member_model").ChannelMember>} */
    channelMembers = {};
    companyName = "";

    /** @type {Object.<number, import("@mail/new/core/notification_model").Notification>} */
    notifications = {};
    notificationGroups = [];

    /** @type {Object.<number, import("@mail/new/core/follower_model").Follower>} */
    followers = {};

    partnerRoot = {};
    /** @type {Object.<number, import("@mail/new/core/persona_model").Persona>} */
    personas = {};

    /** @type {import("@mail/new/rtc/rtc_session_model").rtcSession{}} */
    rtcSessions = {};
    users = {};
    internalUserGroupId = null;
    registeredImStatusPartners = null;
    outOfFocusUnreadMessageCounter = 0;

    // messaging menu
    menu = {
        counter: 0,
    };

    // discuss app
    discuss = {
        isActive: false,
        messageToReplyTo: null,
        threadLocalId: null,
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
    };
    cannedResponses = [];

    /** @type {Object.<number, import("@mail/new/core/activity_model").Activity>} */
    activities = {};
    activityCounter = 0;

    /** @type {import("@mail/new/core/chat_window_model").ChatWindow[]} */
    chatWindows = [];

    /** @type {Object.<number, import("@mail/new/core/message_model").Message>} */
    messages = {};

    /** @type {Object.<string, import("@mail/new/core/thread_model").Thread>} */
    threads = {};
}

export const storeService = {
    start(env) {
        return reactive(new Store(env));
    },
};
