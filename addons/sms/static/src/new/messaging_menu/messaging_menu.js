/** @odoo-module */

import { MessagingMenu } from "@mail/new/messaging_menu/messaging_menu";
import { patch } from "@web/core/utils/patch";

patch(MessagingMenu.prototype, "sms/messaging_menu", {
    openFailureView(failure) {
        if (failure.type === "email") {
            return this._super(failure);
        }
        this.env.services.action.doAction({
            name: this.env._t("SMS Failures"),
            type: "ir.actions.act_window",
            view_mode: "kanban,list,form",
            views: [
                [false, "kanban"],
                [false, "list"],
                [false, "form"],
            ],
            target: "current",
            res_model: failure.resModel,
            domain: [["message_has_sms_error", "=", true]],
            context: { create: false },
        });
        this.close();
    },
});
