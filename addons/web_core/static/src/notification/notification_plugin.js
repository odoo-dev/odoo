import { computed, effect, onWillDestroy, plugin, Plugin, signal } from "@odoo/owl";
import { NotificationContainer } from "@web_core/notification/notification_container";
import { OverlayContainerPlugin } from "@web_core/overlay/overlay_container_plugin";
import { registry } from "@web_core/registry";
import { service } from "@web_core/services";

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
        registry.get("services").addById(this);
    }

    /** @private */
    overlayContainer = plugin(OverlayContainerPlugin);

    /** @private */
    nextId = 0;

    /** @private @type {import("@odoo/owl").Signal<{ [K: number]: {} }>} */
    notifications = signal({});

    setup() {
        const notificationValues = computed(() => Object.values(this.notifications()));

        /** @type {import("@web_core/overlay/overlay_container_plugin").OverlayContainerPluginItem | null} */
        let overlay = null;
        onWillDestroy(effect(() => {
            if (!overlay?.isAlive && notificationValues().length) {
                overlay = this.overlayContainer.push(NotificationContainer, {
                    props: { notifications: notificationValues },
                    section: "notifications",
                });
            }
            if (overlay?.isAlive && !notificationValues().length) {
                overlay.pop();
            }
        }));
    }

    /**
     * @param {string} message
     * @param {{
     *  buttons?: {
     *      action(): (void | Promise<void>);
     *      icon?: string;
     *      isPrimary?: boolean;
     *      label: string;
     *  }[];
     *  lifespan?: number | "sticky";
     *  title?: string;
     *  type?: "danger" | "info" | "success" | "warning";
     * }} [options]
     */
    push(message, options = {}) {
        const id = ++this.nextId;
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
            lifespan: options.lifespan ?? (buttons.length ? 10_000 : 4_000),
            message,
            /** @param {any} result */
            pop: (result) => {
                delete this.notifications()[id];
                this.notifications.update();
                resolve(result);
            },
            title: options.title,
            type: options.type ?? "warning",
        };

        this.notifications()[id] = notification;
        this.notifications.update();

        return promise;
    }
}
