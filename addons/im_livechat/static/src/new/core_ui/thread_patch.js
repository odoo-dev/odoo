/* @odoo-module */

import { Thread } from "@mail/core_ui/thread";
import { useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { patch } from "@web/core/utils/patch";
import { session } from "@web/session";

patch(Thread.prototype, "im_livechat", {
    setup() {
        this._super();
        this.session = session;
        this.chatbotService = useState(useService("im_livechat.chatbot"));
    },
});
