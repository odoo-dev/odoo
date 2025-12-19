import { Component, onWillStart, plugin } from "@odoo/owl";
import { ControlPanel } from "@web_client/views/control_panel";
import { ViewPlugin } from "@web_client/views/view_plugin";
import { viewRegistry } from "@web_client/views/view_registry";
import { ORM } from "@web_core/orm";

export class KanbanView extends Component {
    static {
        viewRegistry.add("kanban", this);
    }

    static template = "web_client.KanbanView";
    static components = { ControlPanel };

    /** @type {Record<string, any>[]} */
    records = [];

    orm = plugin(ORM);
    view = plugin(ViewPlugin);

    setup() {
        onWillStart(async () => {
            const resModel = this.view.resModel();
            this.records = await this.orm.call(resModel, "search_read", {
                args: [[], ["id", "display_name"]],
                kwargs: {
                    limit: 20,
                },
            });
        });
    }
}
