import { isMobileOS } from "@web/core/browser/feature_detection";
import { useService } from "@web/core/utils/hooks";
import { getEmbeddedProps } from "@html_editor/others/embedded_component_utils";
import { checkURL, excalidrawWebsiteDomainList } from "@html_editor/utils/url";
import { Component, onWillStart, useRef, useState } from "@odoo/owl";
import { useMouseResizeListeners } from "@html_editor/others/embedded_components/excalidraw/excalidraw_utils";

/**
 * This Behavior loads an Excalidraw iframe to grant users the ability to present schematics and
 * slides.
 */
export class ReadonlyExcalidrawEmbeddedComponent extends Component {
    static template = "html_editor.ReadonlyExcalidrawEmbedded";
    static props = {
        height: { type: String, optional: true },
        source: { type: String },
        width: { type: String, optional: true },
    };

    setup() {
        super.setup();
        this.isMobile = isMobileOS();
        this.dialog = useService("dialog");
        this.state = useState({
            height: this.props.height || "400px",
            width: this.isMobile ? "100%" : this.props.width || "100%",
        });
        this.drawContainer = useRef("drawContainer");

        onWillStart(() => this.setupIframe());

        this.onHandleMouseDown = useMouseResizeListeners({
            onMouseDown: this.onMouseDown,
            onMouseMove: this.onMouseMove,
            onMouseUp: this.onMouseUp,
        });
    }

    //--------------------------------------------------------------------------
    // TECHNICAL
    //--------------------------------------------------------------------------

    setupIframe() {
        const url = checkURL(this.props.source, excalidrawWebsiteDomainList);
        if (url) {
            this.setURL(url);
        } else {
            this.state.hasError = true;
        }
    }

    //--------------------------------------------------------------------------
    // HANDLERS
    //--------------------------------------------------------------------------

    onMouseDown() {
        if (!this.drawContainer.el) {
            return;
        }
        this.state.isResizing = true;
        const bounds = this.drawContainer.el.getBoundingClientRect();
        this.refPoint = {
            x: bounds.x + bounds.width / 2,
            y: bounds.y,
        };
    }

    onMouseMove(event) {
        event.preventDefault();
        this.state.width = this.isMobile
            ? this.state.width
            : `${Math.max(2 * Math.abs(this.refPoint.x - event.clientX), 300)}px`;
        this.state.height = `${Math.max(event.clientY - this.refPoint.y, 300)}px`;
    }

    onMouseUp() {
        this.state.isResizing = false;
    }

    setURL(url) {
        this.state.source = url;
    }
}

export const readonlyEmbeddedExcalidraw = {
    name: "draw",
    Component: ReadonlyExcalidrawEmbeddedComponent,
    getProps: (host) => {
        return { host, ...getEmbeddedProps(host) };
    },
};
