import { useState } from "@odoo/owl";

import { ListController } from "@web/views/list/list_controller";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";

export class DiscussChannelListController extends ListController {
    setup() {
        super.setup(...arguments);
        this.store = useState(useService("mail.store"));
        this.ui = useState(useService("ui"));
    }

    async openRecord(record) {
        if (!this.ui.isSmall) {
            return this.actionService.doAction("mail.action_discuss", {
                name: _t("Discuss"),
                //isLiveChatSession is set to true when the session open from Session History
                additionalContext: { active_id: record.resId, isLivechatSession: true },
            });
        }
        let thread = this.store.Thread.get({
            model: "discuss.channel",
            id: record.resId,
        });
        if (!thread?.channel_type) {
            thread = await thread.fetchChannelInfo();
        }
        if (thread) {
            return thread.open();
        }
        return super.openRecord(record);
    }
}
