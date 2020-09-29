import { Component, tags } from "@odoo/owl";
import type { OdooEnv } from "../env";
import { Notification as NotificationComponent } from "../components/notification/notification";

const AUTOCLOSE_DELAY: number = 4000;

interface DisplayOptions {
  className?: string;
  icon?: string;
  sticky?: boolean;
  title?: string;
  type?: string;
}

interface Notification extends DisplayOptions {
  id: number;
  message: string;
}

export interface NotificationService {
  close: (id: number) => void;
  display: (message: string, options?: DisplayOptions) => number;
}

export class NotificationManager extends Component<{}, OdooEnv> {
  static template = tags.xml`
    <div class="o_notification_manager">
        <t t-foreach="notifications" t-as="notification" t-key="notification.id">
            <NotificationComponent t-props="notification"/>
        </t>
    </div>`;
  static components = { NotificationComponent };
  notifications: Notification[] = [];

  constructor() {
    super(...arguments);
    this.env.bus.on("NOTIFICATIONS_CHANGE", this, (notifications) => {
      this.notifications = notifications;
      this.render();
    });
    // todo test event coming before manager is in dom
  }
}

export const notificationService = {
  name: "notifications",
  deploy(env: OdooEnv): NotificationService {
    let notifId: number = 0;
    let notifications: Notification[] = [];

    function close(id: number): void {
      const index = notifications.findIndex((n) => n.id === id);
      notifications.splice(index, 1);
      env.bus.trigger("NOTIFICATIONS_CHANGE", notifications);
    }

    function display(message: string, options?: DisplayOptions): number {
      const notif: Notification = Object.assign({}, options, {
        id: ++notifId,
        message,
      });
      notifications.push(notif);
      env.bus.trigger("NOTIFICATIONS_CHANGE", notifications);
      if (!notif.sticky) {
        env.browser.setTimeout(() => close(notif.id), AUTOCLOSE_DELAY);
      }
      return notif.id;
    }

    return { close, display };
  },
};
