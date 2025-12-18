import { Component, plugin } from "@odoo/owl";
import { ViewPlugin } from "@web_client/view_plugin";

export class ControlPanel extends Component {
    static template = "web_client.ControlPanel";

    view = plugin(ViewPlugin);
}
