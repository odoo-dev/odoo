/* @odoo-module */

import { ThreadService } from "@mail/core/thread_service";
import { registry } from "@web/core/registry";
import { patch } from "@web/core/utils/patch";

const commandRegistry = registry.category("discuss.channel_commands");

patch(ThreadService.prototype, "discuss", {
    /**
     * @override
     * @param {import("@mail/core/thread_model").Thread} thread
     * @param {string} textContent
     * @param {string} body
     */
    async post(thread, textContent, body) {
        if (thread.model === "discuss.channel" && textContent.startsWith("/")) {
            const [firstWord] = textContent.substring(1).split(/\s/);
            const command = commandRegistry.get(firstWord, false);
            if (
                command &&
                (!command.channel_types || command.channel_types.includes(thread.type))
            ) {
                await this.executeCommand(thread, command, textContent);
                return;
            }
        }
        return this._super(...arguments);
    },
});
