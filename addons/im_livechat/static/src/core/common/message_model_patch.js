import { Message } from "@mail/core/common/message_model";
import { fields } from "@mail/model/export";

import { _t } from "@web/core/l10n/translation";
import { patch } from "@web/core/utils/patch";

/** @type {import("models").Message} */
const messagePatch = {
    setup() {
        super.setup(...arguments);
        this.chatbotStep = fields.One("ChatbotStep", { inverse: "message" });
    },
    get canReplyTo() {
        if (this.thread?.channel?.channel_type === "livechat") {
            return (
                !this.isEmpty &&
                !this.thread.composerDisabled &&
                !this.thread.channel.composerHidden
            );
        }
        return super.canReplyTo;
    },
    getMemberNotificationText({ type, user, invitee }) {
        if (this.thread?.channel?.channel_type !== "livechat" || type !== "channel-joined") {
            return super.getMemberNotificationText(...arguments);
        }
        if (invitee) {
            return _t("%(user)s invited %(invitee)s to the conversation", { user, invitee });
        }
        return _t("%(user)s joined the conversation", { user });
    },
    get isTranslatable() {
        return (
            super.isTranslatable ||
            (this.store.hasMessageTranslationFeature &&
                this.channel_id?.channel_type === "livechat" &&
                (this.store.self_user?.share === false || !this.isSelfAuthored))
        );
    },
};
patch(Message.prototype, messagePatch);
