/* @odoo-module */

import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { session } from "@web/session";
import { sprintf } from "@web/core/utils/strings";
import { reactive } from "@odoo/owl";
import { Deferred } from "@web/core/utils/concurrency";

/**
 * @typedef LivechatRule
 * @property {"auto_popup"|undefined} [action]
 * @property {number?} [auto_popup_timer]
 */

export const RATING = Object.freeze({
    GOOD: 5,
    OK: 3,
    BAD: 1,
});

export const RATING_TO_EMOJI = {
    [RATING.GOOD]: "😊",
    [RATING.OK]: "😐",
    [RATING.BAD]: "😞",
};

export const SESSION_STATE = Object.freeze({
    NONE: "NONE",
    CREATED: "CREATED",
    PERSISTED: "PERSISTED",
    CLOSED: "CLOSED",
});

export class LivechatService {
    SESSION_COOKIE = "im_livechat_session";
    OPERATOR_COOKIE = "im_livechat_previous_operator_pid";
    /** @type {keyof typeof SESSION_STATE} */
    state = SESSION_STATE.NONE;
    /** @type {LivechatRule} */
    rule;
    initializedDeferred = new Deferred();
    initialized = false;
    available = false;
    /** @type {string} */
    userName;

    constructor(env, services) {
        this.env = env;
        this.cookie = services.cookie;
        this.notification = services.notification;
        this.busService = services.bus_service;
        this.rpc = services.rpc;
        this.available = session.livechatData?.isAvailable;
        this.userName = this.options.default_username ?? _t("Visitor");
    }

    async initialize() {
        const init = await this.rpc("/im_livechat/init", {
            channel_id: this.options.channel_id,
        });
        this.available = init.available_for_me ?? this.available;
        this.rule = init.rule;
        this.initialized = true;
        this.initializedDeferred.resolve();
    }

    async _createSession({ persisted = false } = {}) {
        const session = await this.rpc(
            "/im_livechat/get_session",
            {
                channel_id: this.options.channel_id,
                anonymous_name: this.userName,
                previous_operator_id: this.cookie.current[this.OPERATOR_COOKIE],
                persisted,
            },
            { shadow: true }
        );
        if (!session) {
            this.cookie.deleteCookie(this.SESSION_COOKIE);
            return;
        }
        session.isLoaded = true;
        session.status = "ready";
        if (session.operator_pid) {
            this.state = persisted ? SESSION_STATE.PERSISTED : SESSION_STATE.CREATED;
            this.updateSession(session);
        }
        return session;
    }

    /**
     * Update the session with the given values and update the cookies.
     * Ignore if the session is not active.
     *
     * @param {Object} values
     */
    updateSession(values) {
        if ([SESSION_STATE.NONE, SESSION_STATE.CLOSED].includes(this.state)) {
            return;
        }
        const session = JSON.parse(this.cookie.current[this.SESSION_COOKIE] ?? "{}");
        Object.assign(session, values);
        this.cookie.deleteCookie(this.SESSION_COOKIE);
        this.cookie.deleteCookie(this.OPERATOR_COOKIE);
        this.cookie.setCookie(this.SESSION_COOKIE, JSON.stringify(session), 60 * 60 * 24); // 1 day cookie.
        if (session?.operator_pid) {
            this.cookie.setCookie(this.OPERATOR_COOKIE, session.operator_pid[0], 7 * 24 * 60 * 60); // 1 week cookie.
        }
    }

    /**
     * @param {object} param0
     * @param {boolean} param0.notifyServer Whether to call the
     * `visitor_leave_session` route. Note that this route will
     * never be called if the session was not persisted.
     */
    async leaveSession({ notifyServer = true } = {}) {
        const session = JSON.parse(this.cookie.current[this.SESSION_COOKIE] ?? "{}");
        this.cookie.deleteCookie(this.SESSION_COOKIE);
        this.state = SESSION_STATE.CLOSED;
        if (!session?.uuid || !notifyServer) {
            return;
        }
        this.busService.deleteChannel(session.uuid);
        await this.rpc("/im_livechat/visitor_leave_session", { uuid: session.uuid });
    }

    async getSession({ persisted = false } = {}) {
        let session = JSON.parse(this.cookie.current[this.SESSION_COOKIE] ?? false);
        if (session?.uuid && this.state === SESSION_STATE.NONE) {
            // Channel is already created on the server.
            session.messages = await this.rpc("/im_livechat/chat_history", {
                uuid: session.uuid,
            });
            session.messages.reverse();
            this.busService.addChannel(session.uuid);
        }
        if (!session || (!session.uuid && persisted)) {
            session = await this._createSession({ persisted });
            if (session?.uuid) {
                this.busService.addChannel(session.uuid);
            }
        }
        if (this.state === SESSION_STATE.NONE && session) {
            this.state = session?.uuid ? SESSION_STATE.PERSISTED : SESSION_STATE.CREATED;
        }
        return session;
    }

    get options() {
        return session.livechatData?.options ?? {};
    }

    get shouldRestoreSession() {
        if (this.state !== SESSION_STATE.NONE) {
            return false;
        }
        return Boolean(this.cookie.current[this.SESSION_COOKIE]);
    }

    /**
     * @param {number} rate
     * @param {string} reason
     */
    async sendFeedback(uuid, rate, reason) {
        await this.rpc("/im_livechat/feedback", { reason, rate, uuid });
        await this.rpc("/im_livechat/chat_post", {
            uuid,
            message_content: sprintf(_t("Rating: %s"), RATING_TO_EMOJI[rate]),
        });
        if (reason) {
            await this.rpc("/im_livechat/chat_post", {
                uuid,
                message_content: sprintf(_t("Rating reason: %s"), reason),
            });
        }
    }

    /**
     * @param {number} uuid
     * @param {string} email
     */
    sendTranscript(uuid, email) {
        return this.rpc("/im_livechat/email_livechat_transcript", { uuid, email });
    }
}

export const livechatService = {
    dependencies: ["cookie", "notification", "rpc", "bus_service"],
    start(env, services) {
        const livechat = reactive(new LivechatService(env, services));
        if (livechat.available) {
            livechat.initialize();
        }
        return livechat;
    },
};
registry.category("services").add("im_livechat.livechat", livechatService);
