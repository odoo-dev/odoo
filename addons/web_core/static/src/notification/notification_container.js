import { Component, props } from "@odoo/owl";
import { Notification } from "@web_core/notification/notification";

export class NotificationContainer extends Component {
    static template = "web_core.NotificationContainer";
    static components = { Notification };

    props = props({
        notifications: Function,
    });
}
