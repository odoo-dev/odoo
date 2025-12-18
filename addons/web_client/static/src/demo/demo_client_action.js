import { Component, plugin } from "@odoo/owl";
import { ActionPlugin } from "@web_client/action_plugin";
import { actionRegistry } from "@web_client/action_registry";
import { notify } from "@web_core/notification/notification_plugin";

export class DemoClientAction extends Component {
    static template = "web_client.DemoClientAction";
    static {
        actionRegistry.add("demo", this);
    }
    
    action = plugin(ActionPlugin);

    async notify() {
        const rnd = Math.random().toString(36).substring(2, 10);
        /** @type {any} */
        const types = ["danger", "info", "success", "warning"];
        await notify(rnd, {
            title: "Notification",
            type: types[Math.floor(Math.random() * types.length)],
        });
    }

    switchAction() {
        this.action.doAction("other");
    }
}
