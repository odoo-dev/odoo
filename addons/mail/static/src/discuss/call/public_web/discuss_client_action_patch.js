import { DiscussClientAction } from "@mail/core/public_web/discuss_client_action";
import { useState } from "@odoo/owl";

import { useService } from "@web/core/utils/hooks";
import { patch } from "@web/core/utils/patch";

patch(DiscussClientAction.prototype, {
    setup() {
        super.setup(...arguments);
        this.rtc = useState(useService("discuss.rtc"));
    },
    async restoreDiscussThread() {
        await super.restoreDiscussThread(...arguments);
        const action = this.props.action;
        if (!action) {
            return;
        }
        const call = action.context?.call || action.params?.call;
        if (call === "accept") {
            await this.rtc.toggleCall(this.store.discuss.thread);
        }
    },
});
