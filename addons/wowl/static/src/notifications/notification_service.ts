import { Component, core, tags } from "@odoo/owl";
import type { Odoo, OdooEnv, Service } from "../types";
import { Notification as NotificationComponent } from "./notification";

declare const odoo: Odoo;
const { EventBus } = core;
const AUTOCLOSE_DELAY: number = 4000;

interface DisplayOptions {
  className?: string;
  icon?: string;
  sticky?: boolean;
  title?: string;
  type?: "danger" | "warning" | "success" | "info";
}

interface Notification extends DisplayOptions {
  id: number;
  message: string;
}

export interface NotificationService {
  close: (id: number) => void;
  create: (message: string, options?: DisplayOptions) => number;
}

class NotificationManager extends Component<{}, OdooEnv> {
  static template = tags.xml`
    <div class="o_notification_manager">
        <t t-foreach="notifications" t-as="notification" t-key="notification.id">
            <NotificationComponent t-props="notification" t-transition="o_notification_fade"/>
        </t>
    </div>`;
  static components = { NotificationComponent };

  notifications: Notification[] = [];
}

export const notificationService: Service<NotificationService> = {
  name: "notifications",
  deploy(env: OdooEnv): NotificationService {
    let notifId: number = 0;
    let notifications: Notification[] = [];
    const bus = new EventBus();

    class ReactiveNotificationManager extends NotificationManager {
      constructor() {
        super(...arguments);
        bus.on("UPDATE", this, () => {
          this.notifications = notifications;
          this.render();
        });
      }
    }
    env.registries.Components.add("NotificationManager", ReactiveNotificationManager);

    function close(id: number): void {
      const index = notifications.findIndex((n) => n.id === id);
      if (index > -1) {
        notifications.splice(index, 1);
        bus.trigger("UPDATE");
      }
    }

    function create(message: string, options?: DisplayOptions): number {
      const notif: Notification = Object.assign({}, options, {
        id: ++notifId,
        message,
      });
      notifications.push(notif);
      bus.trigger("UPDATE");
      if (!notif.sticky) {
        odoo.browser.setTimeout(() => close(notif.id), AUTOCLOSE_DELAY);
      }
      return notif.id;
    }

    return { close, create };
  },
};
