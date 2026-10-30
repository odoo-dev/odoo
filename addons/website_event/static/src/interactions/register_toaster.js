import { usePlugin } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { NotificationPlugin } from "@web/core/notifications/notification_plugin";
import { registry } from "@web/core/registry";
import { Interaction } from "@web/public/interaction";

export class RegisterToaster extends Interaction {
    static selector = ".o_wevent_register_toaster";

    setup() {
        this.notification = usePlugin(NotificationPlugin);
        const message = this.el.dataset.message;
        if (message && message.length) {
            this.notification.add(message, {
                title: _t("Register"),
                type: 'info',
            });
        }
    }
}

registry
    .category("public.interactions")
    .add("website_event.register_toaster", RegisterToaster);
