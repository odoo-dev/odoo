/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { Message } from "@mail/new/thread/message";
import { useService } from "@web/core/utils/hooks";

patch(Message.prototype, "mail/message", {
    setup() {
        this._super(...arguments);
        this.action = useService("action");
    },

    openRecord() {
        if (this.message.resModel === "mail.channel") {
            this.threadService.open(this.message.originThread);
        } else {
            this.action.doAction({
                type: "ir.actions.act_window",
                res_id: this.message.resId,
                res_model: this.message.resModel,
                views: [[false, "form"]],
            });
        }
    },
});
