import { Plugin, signal } from "@odoo/owl";

export class ViewPlugin extends Plugin {
    static id = this.name;

    viewType = signal("list");
}
