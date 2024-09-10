import { markRaw, EventBus } from "@odoo/owl";
import { Plugin } from "../plugin";
import { EditorOverlay } from "./overlay";
import { throttleForAnimation } from "@web/core/utils/timing";
import { findUpTo } from "@html_editor/utils/dom_traversal";

/**
 * Provide the following feature:
 * - adding a component in overlay above the editor, with proper positioning
 */
export class OverlayPlugin extends Plugin {
    static name = "overlay";
    static shared = ["createOverlay"];

    handleCommand(command) {
        switch (command) {
            case "STEP_ADDED":
                this.container = this.getScrollContainer();
                break;
        }
    }

    overlays = [];

    setup() {
        this.iframe = this.document.defaultView.frameElement;
        this.topDocument = this.iframe?.ownerDocument || this.document;
        this.container = this.getScrollContainer();
        this.throttledUpdateContainer = throttleForAnimation(() => {
            this.container = this.getScrollContainer();
        });
        this.addDomListener(this.topDocument.defaultView, "resize", this.throttledUpdateContainer);
    }

    destroy() {
        this.throttledUpdateContainer.cancel();
        super.destroy();
        for (const overlay of this.overlays) {
            overlay.close();
        }
    }

    createOverlay(Component, config = {}) {
        const overlay = new Overlay(this, Component, () => this.container, config);
        this.overlays.push(overlay);
        return overlay;
    }

    getScrollContainer() {
        const isScrollable = (element) =>
            element.scrollHeight > element.clientHeight &&
            ["auto", "scroll"].includes(getComputedStyle(element).overflowY);

        return (
            findUpTo(this.iframe || this.editable, null, isScrollable) ||
            this.topDocument.documentElement
        );
    }
}

export class Overlay {
    constructor(plugin, C, getContainer, config) {
        this.plugin = plugin;
        this.C = C;
        this.config = config;
        this.isOpen = false;
        this._remove = null;
        this.component = null;
        this.bus = new EventBus();
        this.getContainer = getContainer;
    }

    /**
     * @param {Object} options
     * @param {HTMLElement | null} [options.target] for the overlay.
     *  If null or undefined, the current selection will be used instead
     * @param {any} [options.props] overlay component props
     */
    open({ target, props }) {
        if (this.isOpen) {
            this.updatePosition();
        } else {
            this.isOpen = true;
            const selection = this.plugin.editable.ownerDocument.getSelection();
            let initialSelection;
            if (selection && selection.type !== "None") {
                initialSelection = {
                    range: selection.getRangeAt(0),
                };
            }
            this._remove = this.plugin.services.overlay.add(
                EditorOverlay,
                markRaw({
                    config: this.config,
                    Component: this.C,
                    editable: this.plugin.editable,
                    props,
                    target,
                    initialSelection,
                    bus: this.bus,
                    getContainer: this.getContainer,
                }),
                {
                    sequence: this.config.sequence || 50,
                }
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
        this.bus.trigger("updatePosition");
    }
}
