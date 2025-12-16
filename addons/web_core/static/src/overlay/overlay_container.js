import { Component, plugin, props } from "@odoo/owl";
import { OverlayContainerPlugin } from "@web_core/overlay/overlay_container_plugin";

class OverlayContainerItem extends Component {
    static template = "web_core.OverlayContainerItem";

    props = props({
        overlay: {
            type: Object,
            shape: {
                alivePromise: Promise,
                bringToFront: Function,
                component: Function,
                id: Number,
                isAlive: Boolean,
                pop: Function,
                props: Object,
                section: Number,
                zindex: Number,
            },
        },
    });
}

export class OverlayContainer extends Component {
    static template = "web_core.OverlayContainer";
    static components = { OverlayContainerItem };

    overlayContainer = plugin(OverlayContainerPlugin);
}
