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

export function useOverlay(refName, config) {
    const env = useEnv();
    const ref = useRef(refName);
    const overlay = env.overlay;
    overlay.position = config.position;
    if (config.offsetY !== undefined) {
        overlay.offsetY = config.offsetY;
    }
    overlay.width = config.width;
    overlay.height = config.height;
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
        this.offsetY = null;
        this.position = null;
        this.width = null;
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
        const Y_OFFSET = this.offsetY !== null ? this.offsetY : 6;
        // autoclose if overlay target is out of view
        const target = this.target ? this.target.getBoundingClientRect() : this.getCurrentRect();
        if (target.bottom < elRect.top - 10 || target.top > elRect.bottom + Y_OFFSET) {
            // position below
            this.close();
            return;
        }
        // auto adapt width or height if necessary
        if (this.width === "auto") {
            this.el.style.width = target.width + "px";
        }
        if (this.height === "auto") {
            this.el.style.height = target.height + "px";
        }

        if (this.position === "left") {
            const left = target.left - overlayRect.width;
            this.el.style.left = left + "px";
            this.el.style.top = target.top + "px";
        } else {
            let top;
            const attemptTop = target.top - Y_OFFSET - overlayRect.height;
            const attemptBottom = target.bottom + Y_OFFSET;
            if (this.position === "top") {
                // try position === 'top'
                top = attemptTop;
                // if top does not work and bottom does work => fallback on bottom
                if (attemptTop < elRect.top && attemptBottom + overlayRect.height < elRect.bottom) {
                    top = attemptBottom;
                }
            } else {
                // try position === "bottom"
                top = attemptBottom;
                // if bottom does not work and top does work => fallback on top
                if (attemptBottom + overlayRect.height > elRect.bottom && attemptTop > elRect.top) {
                    top = attemptTop;
                }
            }
            const left = target.left;
            this.el.style.left = left + "px";
            this.el.style.top = top + "px";
        }
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
