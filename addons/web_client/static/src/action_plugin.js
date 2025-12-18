import { computed, Plugin, signal } from "@odoo/owl";
import { actionRegistry } from "./action_registry";
import { serviceRegistry } from "@web_core/services";

export class ActionPlugin extends Plugin {
    static id = this.name;
    static {
        serviceRegistry.addById(this);
    }

    actionId = signal("demo");

    action = computed(() => {
        const id = this.actionId();
        const C = actionRegistry.get(id);
        return C;
    });

    /**
     * @param {string} actionId 
     */
    doAction(actionId) {
        const obj = {}
        if (actionRegistry.get(actionId, obj) === obj) {
            throw new Error("Nope, action does not exist");
        }
        this.actionId.set(actionId);
    }
}