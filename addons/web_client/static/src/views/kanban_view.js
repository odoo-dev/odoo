import { Component } from "@odoo/owl";
import { ControlPanel } from "@web_client/views/control_panel";
import { viewRegistry } from "@web_client/views/view_registry";

export class KanbanView extends Component {
    static {
        viewRegistry.add("kanban", this);
    }

    static template = "web_client.KanbanView";
    static components = { ControlPanel };

    records = [
        { id: 1, name: "Mitchell Admin" },
        { id: 2, name: "Marc Demo" },
        { id: 5, name: "Joel Willis" },
        { id: 15, name: "Azure Interior" },
        { id: 16, name: "Azure Interior, Brandon Freeman" },
    ];
}
