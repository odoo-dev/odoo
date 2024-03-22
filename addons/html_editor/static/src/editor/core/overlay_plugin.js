import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { onMounted, useEnv, useRef } from "@odoo/owl";

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

    createOverlay(Component, props) {
        const overlay = new Overlay(this, Component, props, this.services);
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

export function useOverlay(refName, position) {
    const env = useEnv();
    const ref = useRef(refName);
    const overlay = env.overlay;
    overlay.position = position;
    onMounted(() => {
        overlay.el = ref.el;
        ref.el.style.position = "absolute";
        overlay.updatePosition();
    });
    return overlay;
}

export class Overlay {
    constructor(plugin, C, props, services) {
        this.plugin = plugin;
        this.services = services;
        this.target = null;
        this.el = null;
        this.isOpen = false;
        this.C = C;
        this.position = null;
        this.props = props;
        this._remove = null;
    }
    /**
     * @param {HTMLElement | null} target for the overlay. If null, current selection will be used instead
     */
    open(target = null) {
        this.target = target;
        if (this.isOpen) {
            this.updatePosition();
        } else {
            this.isOpen = true;
            this._remove = this.plugin.services.overlay.add(this.C, this.props, {
                env: { overlay: this, services: this.services },
            });
        }
    }
    close() {
        this.isOpen = false;
        if (this._remove) {
            this._remove();
            this.el = null;
            this.target = null;
        }
    }
    updatePosition() {
        if (!this.el) {
            return;
        }
        const elRect = this.plugin.editable.getBoundingClientRect();
        const overlayRect = this.el.getBoundingClientRect();
        const Y_OFFSET = 6;

        // autoclose if overlay target is out of view
        const rect = this.target ? this.target.getBoundingClientRect() : this.getCurrentRect();
        if (rect.bottom < elRect.top - 10 || rect.top > elRect.bottom + Y_OFFSET) {
            // position below
            this.close();
            return;
        }

        let top;
        if (this.position === "top") {
            // try position === 'top'
            top = rect.top - Y_OFFSET - overlayRect.height;
            // fallback on position === 'bottom'
            if (top < elRect.top) {
                top = rect.bottom + Y_OFFSET;
            }
        } else {
            // try position === "bottom"
            top = rect.bottom + Y_OFFSET;
            if (top > elRect.bottom) {
                top = rect.top - Y_OFFSET - overlayRect.height;
            }
        }
        const left = rect.left;
        this.el.style.left = left + "px";
        this.el.style.top = top + "px";
    }

    getCurrentRect() {
        const doc = this.plugin.document;
        const selection = doc.getSelection();
        const range = selection.getRangeAt(0);
        let rect = range.getBoundingClientRect();
        if (rect.x === 0 && rect.width === 0 && rect.height === 0) {
            const clonedRange = range.cloneRange();
            const shadowCaret = doc.createTextNode("|");
            clonedRange.insertNode(shadowCaret);
            clonedRange.selectNode(shadowCaret);
            rect = clonedRange.getBoundingClientRect();
            shadowCaret.remove();
            clonedRange.detach();
        }
        return rect;
    }
}

registry.category("phoenix_plugins").add(OverlayPlugin.name, OverlayPlugin);
