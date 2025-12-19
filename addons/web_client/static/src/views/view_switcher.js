import { Component, plugin } from "@odoo/owl";
import { ViewPlugin } from "@web_client/views/view_plugin";
import { session } from "@web_core/session";

export class ViewSwitcher extends Component {
    static template = "web_client.ViewSwitcher";

    view = plugin(ViewPlugin);

    /**
     * @param {string} mode
     */
    getModeInfo(mode) {
        return session.view_info[mode];
    }
}
