/* @odoo-module */

import { DiscussClientAction } from "@mail/core/web/discuss_client_action";

import { patch } from "@web/core/utils/patch";

patch(DiscussClientAction.prototype, {
    async restoreDiscussThread() {
        if (this.store.hasLivechatAccess) {
            await this.store.livechatChannels.fetch();
        }
        return super.restoreDiscussThread(...arguments);
    },
});
