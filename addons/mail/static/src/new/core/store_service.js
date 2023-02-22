/* @odoo-module */

import { reactive } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";

export class Store {
    constructor(env) {
        this.setup(env);
    }

    setup(env) {
        this.env = env;
        this.isSmall = env.isSmall;
    }

    get self() {
        return this.guest ?? this.user;
    }

    // base data

    /**
     * This is the current logged partner
     *
     * @type {import("@mail/new/core/persona_model").Persona}
     */
    user = null;
    /**
     * This is the current logged guest
     *
     * @type {import("@mail/new/core/persona_model").Persona}
     */
    guest = null;

    /**
     * Indicates whether the current user is using the application through the
     * public page.
     */
    inPublicPage = false;

    /** @type {Object.<number, import("@mail/new/core/channel_member_model").ChannelMember>} */
    channelMembers = {};
    /** @type {import("@mail/new/core_ui/message").Message|null} */
    clickedMessage = null;
    companyName = "";

    /** @type {Object.<number, import("@mail/new/core/notification_model").Notification>} */
    notifications = {};
    notificationGroups = [];

    /** @type {Object.<number, import("@mail/new/core/follower_model").Follower>} */
    followers = {};

    /**
     * This is Odoobot
     *
     * @type {import("@mail/new/core/persona_model").Persona}
     */
    partnerRoot = null;
    /** @type {Object.<number, import("@mail/new/core/persona_model").Persona>} */
    personas = {};

    /** @type {import("@mail/new/rtc/rtc_session_model").rtcSession{}} */
    rtcSessions = {};
    users = {};
    internalUserGroupId = null;
    registeredImStatusPartners = null;
    ringingThreads = null;

    // messaging menu
    menu = {
        counter: 0,
    };

    // discuss app
    discuss = {
        activeTab: "all", // can be 'mailbox', 'all', 'channel' or 'chat'
        isActive: false,
        threadLocalId: null,
        channels: {
            extraClass: "o-mail-category-channel",
            id: "channels",
            name: _t("Channels"),
            isOpen: false,
            canView: true,
            canAdd: true,
            serverStateKey: "is_discuss_sidebar_category_channel_open",
            addTitle: _t("Add or join a channel"),
            threads: [], // list of ids
        },
        chats: {
            extraClass: "o-mail-category-chat",
            id: "chats",
            name: _t("Direct messages"),
            isOpen: false,
            canView: false,
            canAdd: true,
            serverStateKey: "is_discuss_sidebar_category_chat_open",
            addTitle: _t("Start a conversation"),
            threads: [], // list of ids
        },
        // mailboxes in sidebar
        /** @type {import("@mail/new/core/thread_model").Thread} */
        inbox: null,
        /** @type {import("@mail/new/core/thread_model").Thread} */
        starred: null,
        /** @type {import("@mail/new/core/thread_model").Thread} */
        history: null,
    };
    cannedResponses = [];

    /** @type {Object.<number, import("@mail/new/web/activity/activity_model").Activity>} */
    activities = {};
    activityCounter = 0;
    /** @type {Object.<number, import("@mail/new/attachments/attachment_model").Attachment>} */
    attachments = {};

    /** @type {import("@mail/new/web/chat_window/chat_window_model").ChatWindow[]} */
    chatWindows = [];

    /** @type {Object.<number, import("@mail/new/core/message_model").Message>} */
    messages = {};

    /** @type {Object.<string, import("@mail/new/core/thread_model").Thread>} */
    threads = {};
}

export const storeService = {
    dependencies: ["ui"],

    start(env, { ui }) {
        const res = reactive(new Store(env));
        res.discuss.activeTab = res.isSmall ? "mailbox" : "all";
        ui.bus.addEventListener("resize", () => {
            res.isSmall = ui.isSmall;
            if (!res.isSmall) {
                res.discuss.activeTab = "all";
            }
        });
        return res;
    },
};

registry.category("services").add("mail.store", storeService);
