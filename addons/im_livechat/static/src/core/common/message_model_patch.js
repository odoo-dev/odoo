import { Message } from "@mail/core/common/message_model";
import { Record } from "@mail/model/record";
import { htmlReplaceAll } from "@mail/utils/common/html";
import { markup } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";

import { patch } from "@web/core/utils/patch";

/** @type {import("models").Message} */
const messagePatch = {
    setup() {
        super.setup(...arguments);
        this.chatbotStep = Record.one("ChatbotStep", { inverse: "message" });
    },
    canReplyTo(thread) {
        return (
            super.canReplyTo(thread) &&
            (thread?.channel_type !== "livechat" || !thread.composerDisabled)
        );
    },
    isTranslatable(thread) {
        return (
            super.isTranslatable(thread) ||
            (this.store.hasMessageTranslationFeature &&
                thread?.channel_type === "livechat" &&
                thread?.selfMember?.persona?.isInternalUser)
        );
    },
    get authorName() {
        return this.author.getContextualName(this.thread);
    },

    _computeNotificationBody() {
        if (this.notification_data?.type === "livechat-feedback") {
            let reason = this.notification_data.payload.reason;
            reason = reason
                ? markup(`<br/>${htmlReplaceAll(reason, /\r\n|\r|\n/g, () => markup("<br>"))}`)
                : "";
            const imgSrc = markup(
                `<img class="o_livechat_emoji_rating" src="/rating/static/src/img/rating_${
                    this.notification_data.payload.rating
                }.png" alt="${_t("Rating")}"/>`
            );
            return _t("Rating: %(imgSrc)s.%(reason)s", { imgSrc, reason });
        }
        return super._computeNotificationBody();
    },
};
patch(Message.prototype, messagePatch);
