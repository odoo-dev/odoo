import { Component, onWillStart, plugin, useResource } from "@odoo/owl";
import { DebugPlugin } from "@web_client/debug_menu/debug_plugin";
import { ControlPanel } from "@web_client/views/control_panel";
import { ViewPlugin } from "@web_client/views/view_plugin";
import { viewRegistry } from "@web_client/views/view_registry";
import { ORM } from "@web_core/orm";

export class FormView extends Component {
    static {
        viewRegistry.add("form", this);
    }

    static template = "web_client.FormView";
    static components = { ControlPanel };

    /** @type {Record<string, any>} */
    record = {};

    debug = plugin(DebugPlugin);
    orm = plugin(ORM);
    view = plugin(ViewPlugin);

    setup() {
        useResource(this.debug.items, [
            { label: "Record Metadata", action: () => console.log("Open Record Metadata") },
            { label: "Record Data", action: () => console.log("Open Record Data") },
        ]);
        onWillStart(async () => {
            const resModel = this.view.resModel();
            const recordId = this.view.recordId();
            if (recordId) {
                [this.record] = await this.orm.call(resModel, "read", {
                    args: [[recordId], ["id", "display_name"]],
                });
            } else {
                this.record = await this.orm.call(resModel, "onchange", {
                    args: [[], [], ["id", "display_name"], {}],
                });
            }
        });
    }
}
