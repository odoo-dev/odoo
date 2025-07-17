import { fields } from "@mail/core/common/record";
import { Thread } from "@mail/core/common/thread_model";

import { _t } from "@web/core/l10n/translation";
import { patch } from "@web/core/utils/patch";

patch(Thread.prototype, {
    setup() {
        super.setup();
        this.livechat_agent_partner_ids = fields.Many("res.partner");
        this.livechat_bot_partner_ids = fields.Many("res.partner");
        this.livechat_customer_guest_ids = fields.Many("mail.guest");
        this.livechat_customer_partner_ids = fields.Many("res.partner");
        this.livechat_end_dt = fields.Datetime();
        this.livechat_operator_id = fields.One("res.partner");
        this.livechatVisitorMember = fields.One("discuss.channel.member", {
            inverse: "threadAsLivechatVisitorMember",
        });
        /** @type {true|undefined} */
        this.open_chat_window = fields.Attr(undefined, {
            /** @this {import("models").Thread} */
            onUpdate() {
                if (this.open_chat_window) {
                    this.open_chat_window = undefined;
                    this.openChatWindow({ focus: true });
                }
            },
        });
        this.livechatWelcomeMessage = fields.One("mail.message", {
            compute() {
                if (this.hasWelcomeMessage) {
                    return {
                        id: -0.2 - this.id,
                        body: this.store.livechat_options.default_message,
                        thread: this,
                        author_id: this.livechat_operator_id,
                    };
                }
            },
        });
        this.requested_by_operator = false;
    },
    get autoOpenChatWindowOnNewMessage() {
        return (
            (this.channel_type === "livechat" && !this.store.chatHub.compact) ||
            super.autoOpenChatWindowOnNewMessage
        );
    },
    get isTransient() {
        if (this.id instanceof String && this.id.startsWith("im_livechat.preview_")) {
            return true;
        }
        return super.isTransient;
    },
    get hasWelcomeMessage() {
        return (
            this.channel_type === "livechat" &&
            this.isSelfCustomer &&
            !this.livechat_bot_partner_ids.length &&
            !this.requested_by_operator
        );
    },
    get showCorrespondentCountry() {
        if (this.channel_type === "livechat") {
            return (
                this.livechat_operator_id?.eq(this.store.self) && Boolean(this.correspondentCountry)
            );
        }
        return super.showCorrespondentCountry;
    },
    get typesAllowingCalls() {
        return super.typesAllowingCalls.concat(["livechat"]);
    },

    get isChatChannel() {
        return this.channel_type === "livechat" || super.isChatChannel;
    },

    get composerDisabled() {
        return this.channel_type === "livechat" && this.livechat_end_dt;
    },

    get composerDisabledText() {
        return this.channel_type === "livechat" && this.livechat_end_dt
            ? _t("This livechat conversation has ended")
            : "";
    },
    get isSelfCustomer() {
        return (
            this.store.self_partner?.in(this.livechat_customer_partner_ids) ??
            this.store.self_guest.in(this.livechat_customer_guest_ids)
        );
    },
    get isSelfAgent() {
        return this.store.self_partner?.in(this.livechat_agent_partner_ids);
    },
    /**
     * @override
     * @param {import("models").Persona} persona
     */
    getPersonaName(persona) {
        if (this.channel_type === "livechat" && persona.user_livechat_username) {
            return persona.user_livechat_username;
        }
        if (persona.is_public && this.anonymous_name) {
            return this.anonymous_name;
        }
        return super.getPersonaName(persona);
    },
});
