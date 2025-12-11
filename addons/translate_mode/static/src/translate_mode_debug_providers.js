/** @odoo-module **/

import { browser } from "@web/core/browser/browser";
import { registry } from "@web/core/registry";

const commandProviderRegistry = registry.category("command_provider");

if (commandProviderRegistry.contains("debug")) {
    const { provide } = commandProviderRegistry.get("debug");

    commandProviderRegistry.add(
        "debug",
        {
            provide: (env, options) => {
                const result = provide(env, options);
                const existingDebugKeys = new Set(env.debug?.split(",").filter(Boolean) || []);
                if (existingDebugKeys.has("translate")) {
                    result.unshift({
                        action() {
                            existingDebugKeys.delete("translate");
                            browser.location.search = `?debug=${[...existingDebugKeys].join(",")}`;
                        },
                        category: "debug",
                        name: "Deactivate interactive translation mode",
                    });
                } else {
                    result.unshift({
                        action() {
                            existingDebugKeys.add("translate");
                            browser.location.search = `?debug=${[...existingDebugKeys].join(",")}`;
                        },
                        category: "debug",
                        name: "Activate interactive translation mode",
                    });
                }
                return result;
            },
        },
        { force: true }
    );
}
