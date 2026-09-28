import { DiscussChannel } from "@mail/discuss/core/common/discuss_channel_model";
import { fields } from "@mail/model/misc";

import { patch } from "@web/core/utils/patch";

/** @type {import("models").DiscussChannel} */
const discussChannelPatch = {
    setup() {
        super.setup(...arguments);
        /** @type {{ title: string; url: string; visit_datetime: string }[]} */
        this.livechatVisitorHistory = fields.Attr([], { asProxy: true });
        /** @type {string|undefined} */
        this.livechatVisitorHistoryRequestId = undefined;
        /** @type {"idle"|"loading"|"ready"|"empty"|"error"|"unavailable"} */
        this.livechatVisitorHistoryStatus = "idle";
    },
};
patch(DiscussChannel.prototype, discussChannelPatch);
