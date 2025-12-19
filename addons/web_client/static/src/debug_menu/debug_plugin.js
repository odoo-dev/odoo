import { Plugin, Resource } from "@odoo/owl";
import { serviceRegistry } from "@web_core/services";

export class DebugPlugin extends Plugin {
    static id = this.name;
    static {
        serviceRegistry.addById(this);
    }

    items = new Resource();
}
