import { computed, plugin, Plugin, signal } from "@odoo/owl";
import { NotificationContainer } from "@web_core/notification/notification_container";
import { OverlayPlugin } from "@web_core/overlay/overlay_plugin";
import { service, serviceRegistry } from "@web_core/services";

/**
 * @type {NotificationPlugin["push"]}
 */
export function notify(message, options = {}) {
    const notification = service(NotificationPlugin);
    return notification.push(message, options);
}

export class NotificationPlugin extends Plugin {
    static id = this.name;
    static {
        serviceRegistry.addById(this);
    }

    /** @private */
    _overlayContainer = plugin(OverlayPlugin);

    /** @private */
    _nextId = 0;

    /** @private @type {import("@odoo/owl").Signal<{ [K: number]: {} }>} */
    _notificationMap = signal({});

    notifications = computed(() => Object.values(this._notificationMap()));
    overlay = this._overlayContainer.createOverlay(NotificationContainer, {
        props: {
            notifications: this.notifications,
        },
        section: "notifications",
    });

    /**
     * @param {string} message
     * @param {{
     *  buttons?: {
     *      action(): (void | Promise<void>);
     *      icon?: string;
     *      isPrimary?: boolean;
     *      label: string;
     *  }[];
     *  duration?: number;
     *  title?: string;
     *  type?: "danger" | "info" | "success" | "warning";
     * }} [options]
     */
    push(message, options = {}) {
        const id = ++this._nextId;
        const buttons = Array.from(options.buttons ?? [], (button) => ({
            action: button.action,
            icon: button.icon ?? "",
            isPrimary: button.icon ?? false,
            label: button.label,
        }));

        const { promise, resolve } = Promise.withResolvers();

        const notification = {
            buttons,
            id,
            duration: options.duration ?? (buttons.length ? 10_000 : 4_000),
            message,
            /** @param {any} result */
            close: (result) => {
                delete this._notificationMap()[id];
                this._notificationMap.update();
                if (!this.notifications().length) {
                    this.overlay.pop();
                }
                resolve(result);
            },
            title: options.title,
            type: options.type ?? "warning",
        };

        this._notificationMap()[id] = notification;
        this._notificationMap.update();

        this.overlay.push();

        return promise;
    }
}
