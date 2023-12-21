/** @odoo-module */

import { orm } from "@web/core/orm";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Component } from "@odoo/owl";

class ButtonWithNotification extends Component {
    static template = "purchase.ButtonWithNotification";
    setup() {
        this.notification = useService("notification");
    }

    async onClick() {
        const result = await orm.call(this.props.record.resModel, this.props.method, [
            this.props.record.resId,
        ]);
        const message = result.toast_message;
        this.notification.add(message, { type: "success" });
    }
}

export const buttonWithNotification = {
    component: ButtonWithNotification,
    extractProps: ({ attrs }) => {
        return {
            method: attrs.button_name,
            title: attrs.title,
        };
    },
};
registry.category("view_widgets").add("toaster_button", buttonWithNotification);
