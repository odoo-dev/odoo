import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";

function getCurrentRect(selection) {
    const range = selection.getRangeAt(0);
    let rect = range.getBoundingClientRect();
    if (rect.x === 0 && rect.width === 0 && rect.height === 0) {
        const clonedRange = range.cloneRange();
        const shadowCaret = document.createTextNode("|");
        clonedRange.insertNode(shadowCaret);
        clonedRange.selectNode(shadowCaret);
        rect = clonedRange.getBoundingClientRect();
        shadowCaret.remove();
        clonedRange.detach();
    }
    return rect;
}

/**
 * Provide the following feature:
 * - adding a component in overlay above the editor, with proper positioning
 */
export class OverlayPlugin extends Plugin {
    static name = "overlay";
    static shared = ["createOverlay"];

    setup() {
        this.overlays = [];
        this.addDomListener(document, "scroll", this.onScroll, true);
        this.addDomListener(window, "resize", this.updatePositions, true);
    }

    destroy() {
        for (const overlay of this.overlays) {
            overlay.close();
        }
    }

    createOverlay(Component, position, props) {
        const overlay = new Overlay(this, Component, position, props);
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
    constructor(plugin, C, position, props) {
        this.plugin = plugin;
        this.el = null;
        this.isOpen = false;
        this.C = C;
        this.position = position;
        this.props = props;
        this._remove = null;
    }
    open() {
        if (this.isOpen) {
            this.updatePosition();
        } else {
            this.isOpen = true;
            this._remove = this.plugin.services.overlay.add(this.C, {
                close: () => this.close(),
                onMounted: (el) => {
                    this.el = el;
                    this.updatePosition();
                },
                ...this.props,
            });
        }
    }
    close() {
        this.isOpen = false;
        if (this._remove) {
            this._remove();
            this.el = null;
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
        const rect = getCurrentRect(this.plugin.document.getSelection());
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
}

registry.category("phoenix_plugins").add(OverlayPlugin.name, OverlayPlugin);
