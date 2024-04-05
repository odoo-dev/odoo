import { markRaw } from "@odoo/owl";
import { Plugin } from "../plugin";
import { EditorOverlay } from "./overlay";

/**
 * Provide the following feature:
 * - adding a component in overlay above the editor, with proper positioning
 */
export class OverlayPlugin extends Plugin {
    static name = "overlay";
    static shared = ["createOverlay"];

    overlays = [];

    setup() {
        // @todo @phoenix handle the case where the editable is in an iframe
        // => need to listen to event in main document/window and in iframe
        // => need to apply offsets
        this.addDomListener(this.document, "scroll", this.onScroll, true);
        this.addDomListener(this.document.defaultView, "resize", this.updatePositions, true);
    }

    destroy() {
        for (const overlay of this.overlays) {
            overlay.close();
        }
    }

    createOverlay(Component, config) {
        const overlay = new Overlay(this, Component, config);
        this.overlays.push(overlay);
        return overlay;
    }

    onScroll(ev) {
        if (ev.target.contains(this.editable)) {
            this.updatePositions();
        }
    }

    updatePositions() {
        for (const overlay of this.overlays) {
            overlay.updatePosition();
        }
    }
}

export class Overlay {
    constructor(plugin, C, config) {
        this.plugin = plugin;
        this.C = C;
        this.config = config;
        this.isOpen = false;
        this._remove = null;
        this.component = null;
    }
    /**
     * @param {HTMLElement | null} target for the overlay. If null, current selection will be used instead
     */
    open({ target, props }) {
        if (this.isOpen) {
            this.updatePosition();
        } else {
            this.isOpen = true;
            this._remove = this.plugin.services.overlay.add(
                EditorOverlay,
                markRaw({
                    config: this.config,
                    Component: this.C,
                    editable: this.plugin.editable,
                    props,
                    target,
                })
            );
        }
    }
    close() {
        this.isOpen = false;
        if (this._remove) {
            this._remove();
        }
        this.config.onClose?.();
    }

    updatePosition() {
        this.component?.updatePosition();
    }
}
