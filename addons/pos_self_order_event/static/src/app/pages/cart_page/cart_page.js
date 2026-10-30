import { usePlugin } from "@odoo/owl";
import { CartPage } from "@pos_self_order/app/pages/cart_page/cart_page";
import { _t } from "@web/core/l10n/translation";
import { patch } from "@web/core/utils/patch";
import { NotificationPlugin } from "@web/core/notifications/notification_plugin";

patch(CartPage.prototype, {
    async setup() {
        super.setup();
        this.notification = usePlugin(NotificationPlugin);
    },
    changeQuantity(line, increase) {
        if (!line.event_ticket_id) {
            return super.changeQuantity(line, increase);
        }
        return this.notification.add(
            _t("You cannot change quantity for a line linked with an event registration"),
            { type: "warning" }
        );
    },
});
