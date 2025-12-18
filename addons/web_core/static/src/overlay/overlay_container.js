import { Component, plugin } from "@odoo/owl";
import { OverlayPlugin } from "@web_core/overlay/overlay_plugin";

export class OverlayContainer extends Component {
    static template = "web_core.OverlayContainer";

    overlayContainer = plugin(OverlayPlugin);
}
