import { Component, usePlugin, useProps } from "@odoo/owl";

import { browser } from "@web/core/browser/browser";
import { DialogPlugin } from "@web/core/dialog/dialog_plugin";
import { NotificationAlertDialog } from "@web/core/notification_alert_dialog/notification_alert_dialog";
import { registry } from "@web/core/registry";
import { standardWidgetProps } from "@web/views/widgets/standard_widget_props";

export class NotificationAlert extends Component {
    props = useProps(standardWidgetProps);
    static template = "web.NotificationAlert";

    setup() {
        this.dialog = usePlugin(DialogPlugin);
    }

    get isNotificationBlocked() {
        return browser.Notification && browser.Notification.permission === "denied";
    }

    openNotificationDialog() {
        this.dialog.add(NotificationAlertDialog);
    }
}

export const notificationAlert = {
    component: NotificationAlert,
};

registry.category("view_widgets").add("notification_alert", notificationAlert);
