import { Component, t, useProps } from "@odoo/owl";

/**
 * Frames the elements whose options are open (with their sizing handles) and
 * the hovered element.
 */
export class BuilderOverlayContainer extends Component {
    static template = "html_builder.BuilderOverlayContainer";
    props = useProps({
        overlays: t.array(),
        hoverOverlay: t.signal(),
        onWheel: t.function(),
    });

    onSizingStart(ev, overlay) {
        if (overlay.hasSizingHandles) {
            overlay.onSizingStart(ev);
        }
    }
}
