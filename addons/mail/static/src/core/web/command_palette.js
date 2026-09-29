import { usePlugin } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";

// Add an activity category for the command palette
registry.category("command_categories").add("activity", {}, { sequence: 45 });

const commandProviderRegistry = registry.category("command_provider");

commandProviderRegistry.add("activity", {
    provide() {
        const action = usePlugin(ActionPlugin);
        return [
            {
                name: _t("Show My Activities"),
                category: "activity",
                action() {
                    action.doAction("mail.mail_activity_action_my", {
                        target: "current",
                        clearBreadcrumbs: true,
                    });
                },
            },
            {
                name: _t("Show All Activities"),
                category: "activity",
                action() {
                    action.doAction("mail.mail_activity_action", {
                        target: "current",
                        clearBreadcrumbs: true,
                    });
                },
            },
        ];
    },
});
