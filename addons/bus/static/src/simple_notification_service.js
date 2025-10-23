import { registry } from "@web/core/registry";

export const simpleNotificationService = {
    dependencies: ["bus_service", "notification", "action"],
    start(env, { bus_service, notification: notificationService, action: actionService }) {
        bus_service.subscribe(
            "simple_notification",
            ({ message, sticky, title, type, buttons }) => {
                notificationService.add(message, {
                    sticky,
                    title,
                    type,
                    buttons: buttons
                        ? buttons.map((button) => ({
                              name: button.name,
                              primary: button.primary,
                              onClick: () => actionService.doAction(button.action),
                          }))
                        : undefined,
                });
            }
        );
        bus_service.start();
    },
};

registry.category("services").add("simple_notification", simpleNotificationService);
