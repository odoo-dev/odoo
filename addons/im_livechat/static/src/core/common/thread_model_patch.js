import { fields } from "@mail/core/common/record";
import { Thread } from "@mail/core/common/thread_model";

import { _t } from "@web/core/l10n/translation";
import { patch } from "@web/core/utils/patch";

patch(Thread.prototype, {
    setup() {
        super.setup();
        this.livechat_agent_partner_ids = fields.Many("Persona");
        this.livechat_bot_partner_ids = fields.Many("Persona");
        this.livechat_customer_guest_ids = fields.Many("Persona");
        this.livechat_customer_partner_ids = fields.Many("Persona");
        this.livechat_end_dt = fields.Datetime();
        this.livechat_operator_id = fields.One("res.partner");
        this.livechat_conversation_tag_ids = fields.Many("im_livechat.conversation.tag");
        this.livechatVisitorMember = fields.One("discuss.channel.member", {
            compute() {
                if (this.channel_type !== "livechat") {
                    return;
                }
                // For livechat threads, the correspondent is the first
                // channel member that is not the operator.
                const orderedChannelMembers = [...this.channel_member_ids].sort(
                    (a, b) => a.id - b.id
                );
                const isFirstMemberOperator = orderedChannelMembers[0]?.partner_id?.eq(
                    this.livechat_operator_id
                );
                const visitor = isFirstMemberOperator
                    ? orderedChannelMembers[1]
                    : orderedChannelMembers[0];
                return visitor;
            },
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
                    const livechatService = this.store.env.services["im_livechat.livechat"];
                    return {
                        id: -0.2 - this.id,
                        body: livechatService.options.default_message,
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

    get allowDescription() {
        return this.channel_type === "livechat" || super.allowDescription;
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
        return super.getPersonaName(persona);
    },
});
