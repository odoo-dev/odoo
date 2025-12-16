import { Component, plugin, props } from "@odoo/owl";
import { Overlay, OverlayPlugin } from "@web_core/overlay/overlay_plugin";

class OverlayContainerItem extends Component {
    static template = "web_core.OverlayContainerItem";

    props = props({
        overlay: Overlay,
    });
}

export class OverlayContainer extends Component {
    static template = "web_core.OverlayContainer";
    static components = { OverlayContainerItem };

    overlayContainer = plugin(OverlayPlugin);
}
