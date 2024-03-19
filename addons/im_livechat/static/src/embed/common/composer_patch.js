import { Composer } from "@mail/core/common/composer";

import { _t } from "@web/core/l10n/translation";
import { patch } from "@web/core/utils/patch";
import { session } from "@web/session";
import { isEmbedLivechatEnabled } from "./misc";

patch(Composer.prototype, {
    get placeholder() {
        if (!isEmbedLivechatEnabled(this.env)) {
            return super.placeholder;
        }
        if (this.thread?.channel_type !== "livechat") {
            return super.placeholder;
        }
        return session.livechatData.options.input_placeholder || _t("Say something...");
    },
});
