import { browser } from "@web/core/browser/browser";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";

export class OutdatedPageWatcherService {
    /**
     * @param {import("@web/env").OdooEnv}
     * @param {Partial<import("services").Services>} services
     */
    constructor(env, services) {
        this.notification = services.notification;
        services.bus_service.subscribe(
            "bus/has_missed_notifications",
            this.showOutdatedPageNotification.bind(this)
        );
    }

    showOutdatedPageNotification() {
        this.closeNotificationFn?.();
        this.closeNotificationFn = this.notification.add(
            _t("Save your work and refresh to get the latest updates and avoid potential issues."),
            {
                title: _t("The page is out of date"),
                type: "warning",
                sticky: true,
                buttons: [
                    {
                        name: _t("Refresh"),
                        primary: true,
                        onClick: () => browser.location.reload(),
                    },
                ],
            }
        );
    }
}

export const outdatedPageWatcherService = {
    dependencies: ["bus_service", "notification"],
    start(env, services) {
        return new OutdatedPageWatcherService(env, services);
    },
};

registry.category("services").add("bus.outdated_page_watcher", outdatedPageWatcherService);
