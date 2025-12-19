import { Component, plugin } from "@odoo/owl";
import { ViewPlugin } from "@web_client/views/view_plugin";
import { ViewSwitcher } from "@web_client/views/view_switcher";

export class ControlPanel extends Component {
    static template = "web_client.ControlPanel";
    static components = { ViewSwitcher };

    view = plugin(ViewPlugin);
}
