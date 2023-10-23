/** @odoo-module **/

import { registry } from "@web/core/registry";

const commandProviderRegistry = registry.category("command_provider");
commandProviderRegistry.add("todo", {
    provide: (env) => {
        const result = [];
        result.push({
            action() {
                env.services.action.doAction({
                    type: "ir.actions.client",
                    tag: "todo_list_step4",
                });
            },
            category: "app",
            name: "Active Todo List Step 4",
        });
        return result;
    },
});
