/* @odoo-module */

import { SESSION_STATE } from "@im_livechat/new/core/livechat_service";
import { ThreadService, threadService } from "@mail/core/thread_service";
import { createLocalId } from "@mail/utils/misc";
import { markup } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { patch } from "@web/core/utils/patch";
import { session } from "@web/session";

threadService.dependencies.push("im_livechat.livechat", "mail.chat_window", "notification");

patch(ThreadService.prototype, "im_livechat", {
    TEMPORARY_ID: "livechat_temporary_thread",

    setup(env, services) {
        this._super(env, services);
        this.livechatService = services["im_livechat.livechat"];
        this.chatWindowService = services["mail.chat_window"];
        this.notification = services.notification;
    },

    async post(thread, body, params) {
        const _super = this._super;
        if (this.livechatService.state !== SESSION_STATE.PERSISTED && thread.type === "livechat") {
            const chatWindow = this.store.chatWindows.find(
                (c) => c.threadLocalId === thread.localId
            );
            thread = await this.getLivechatThread({ persisted: true });
            if (!thread) {
                this.chatWindowService.close(chatWindow);
                return;
            }
            // replace temporary thread by the persisted one.
            chatWindow.thread = thread;
        }
        return _super(thread, body, params);
    },

    async openChat() {
        const thread = await this.getLivechatThread();
        if (!thread) {
            return;
        }
        const chatWindow = this.chatWindowService.insert({ thread });
        chatWindow.autofocus++;
    },

    insert(data) {
        const isUnknown = !(createLocalId(data.model, data.id) in this.store.threads);
        const thread = this._super(data);
        if (thread.type === "livechat" && isUnknown) {
            thread.welcomeMessage = this.messageService.insert({
                body: this.livechatService.options.default_message,
                resId: thread.id,
                resModel: thread.model,
                author: thread.operator,
            });
        }
        return thread;
    },

    async update(thread, data) {
        this._super(thread, data);
        if (data?.operator_pid) {
            thread.operator = this.personaService.insert({
                type: "partner",
                id: data.operator_pid[0],
                name: data.operator_pid[1],
            });
        }
    },

    avatarUrl(author, thread) {
        if (thread.type !== "livechat") {
            return this._super(...arguments);
        }
        if (author?.id === thread.operator.id && author.type === thread.operator.type) {
            return `${session.origin}/im_livechat/operator/${thread.operator.id}/avatar`;
        } else if (author) {
            return `${session.origin}/web/image/res.partner/${author.id}/avatar_128`;
        } else {
            return `${session.origin}/mail/static/src/img/smiley/avatar.jpg`;
        }
    },

    /**
     * @param {Object} param0
     * @param {boolean} param0.persisted
     * @returns {Promise<import("@mail/core/thread_model").Thread?>}
     */
    async getLivechatThread({ persisted = false } = {}) {
        const session = await this.livechatService.getSession({ persisted });
        if (!session?.operator_pid) {
            this.notification.add(_t("No available collaborator, please try again later."));
            return;
        }
        const thread = this.insert({
            ...session,
            id: session.id ?? this.TEMPORARY_ID,
            model: "discuss.channel",
            type: "livechat",
        });
        if (session.messages) {
            thread.messages = session.messages.map((message) => {
                if (message.parentMessage) {
                    message.parentMessage.body = markup(message.parentMessage.body);
                }
                message.body = markup(message.body);
                return this.messageService.insert(message);
            });
        }
        return thread;
    },
});
