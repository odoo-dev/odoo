import { proxy, signal } from "@odoo/owl";
import { Plugin, shared } from "@html_editor/plugin";
import { throttleForAnimation } from "@web/core/utils/timing";
import { getScrollingElement, getScrollingTarget } from "@web/core/utils/scrolling";
import { BuilderOverlay, sizingY, sizingX, sizingGrid } from "./builder_overlay";
import { BuilderOverlayContainer } from "./builder_overlay_container";

function isResizable(el) {
    const isResizableY = el.matches(sizingY.selector) && !el.matches(sizingY.exclude);
    const isResizableX = el.matches(sizingX.selector) && !el.matches(sizingX.exclude);
    const isResizableGrid = el.matches(sizingGrid.selector) && !el.matches(sizingGrid.exclude);
    return isResizableY || isResizableX || isResizableGrid;
}

export class BuilderOverlayPlugin extends Plugin {
    static id = "builderOverlay";
    static dependencies = ["builderOptions", "localOverlay", "history", "operation"];
    static shared = shared(["showOverlayPreview", "hideOverlayPreview", "refreshOverlays"]);
    /** @type {import("plugins").BuilderResources} */
    resources = {
        on_committed_to_history_handlers: this.refreshOverlays.bind(this),
        on_current_options_containers_changed_handlers: this.openBuilderOverlays.bind(this),
        has_overlay_options: { hasOption: (el) => isResizable(el) },
        on_prepare_drag_handlers: () => {
            this.toggleOverlaysVisibility(false);
            return () => {}; // it will be refreshed by the call to `updateContainers` after drop (or cancel)
        },
    };

    setup() {
        this.hoverOverlay = signal(null);
        // TODO find how to not overflow the mobile preview.
        this.iframe = this.editable.ownerDocument.defaultView.frameElement;
        /** @type {[BuilderOverlay]} */
        this.overlays = proxy([]);
        this.builderOverlayContainer = this.dependencies.localOverlay.addLocalOverlay(
            "builder-overlay-container",
            BuilderOverlayContainer,
            {
                overlays: this.overlays,
                hoverOverlay: this.hoverOverlay,
                // If the user scrolls the mouse wheel while hovering an
                // overlay, no scroll will happen to the page. We need to
                // manually process wheel events happening on the overlays.
                onWheel: (ev) => (this.document.documentElement.scrollTop += ev.deltaY),
            }
        );
        // Refresh the overlays position everytime their target size changes.
        this.resizeObserver = new ResizeObserver(() => this.refreshPositions());

        this._refreshOverlays = throttleForAnimation(this.refreshOverlays.bind(this));

        // Recompute the overlay when the window is resized.
        this.addDomListener(window, "resize", this._refreshOverlays);
        this.documentResizeObserver = new ResizeObserver(() => this._refreshOverlays());
        this.documentResizeObserver.observe(this.document.documentElement);

        // On keydown, hide the overlay and then show it again when the mouse
        // moves.
        const onMouseMoveOrDown = throttleForAnimation(() => {
            this.toggleOverlaysVisibility(true);
            this.refreshPositions();
            this.editable.removeEventListener("mousemove", onMouseMoveOrDown);
            this.editable.removeEventListener("mousedown", onMouseMoveOrDown);
        });
        this.addDomListener(this.editable, "keydown", () => {
            this.toggleOverlaysVisibility(false);
            this.editable.addEventListener("mousemove", onMouseMoveOrDown);
            this.editable.addEventListener("mousedown", onMouseMoveOrDown);
        });

        // Hide the overlay when scrolling. Show it again when the scroll is
        // over and recompute its position.
        const scrollingElement = getScrollingElement(this.document);
        const scrollingTarget = getScrollingTarget(scrollingElement);
        this.addDomListener(
            scrollingTarget,
            "scroll",
            throttleForAnimation(() => {
                this.toggleOverlaysVisibility(false);
                clearTimeout(this.scrollingTimeout);
                this.scrollingTimeout = setTimeout(() => {
                    this.toggleOverlaysVisibility(true);
                    this.refreshPositions();
                }, 250);
            }),
            { capture: true, passive: true }
        );

        this.addDomListener(this.editable, "mouseleave", () => {
            this.removeHoverOverlay();
        });
        this.addDomListener(this.editable, "mousemove", (ev) => {
            const el = this.dependencies.builderOptions.closestWithOption(ev.target);
            el ? this.showHoverOverlay(el) : this.removeHoverOverlay();
        });

        this._cleanups.push(() => {
            this.removeBuilderOverlays();
            this.resizeObserver.disconnect();
            this.documentResizeObserver.disconnect();
        });
    }

    openBuilderOverlays(optionsContainer) {
        this.removeBuilderOverlays();
        if (!optionsContainer.length) {
            return;
        }

        // Create the overlays.
        optionsContainer.forEach((option) => {
            if (option.hideOverlay) {
                return;
            }
            const overlay = new BuilderOverlay(option.element, {
                iframe: this.iframe,
                getLocalOverlayContainerRect:
                    this.builderOverlayContainer.getLocalOverlayContainerRect,
                history: this.dependencies.history,
                hasOverlayOptions: option.hasOverlayOptions,
                next: this.dependencies.operation.next,
                isMobileView: this.config.isMobileView,
                mobileBreakpoint: this.config.mobileBreakpoint,
                isRtl: this.config.isEditableRTL,
            });
            this.overlays.push(overlay);
            this.resizeObserver.observe(overlay.overlayTarget, { box: "border-box" });
        });

        if (!this.overlays.length) {
            return;
        }

        // Activate the last overlay.
        const innermostOverlay = this.overlays.at(-1);
        innermostOverlay.toggleOverlay(true);

        // Also activate the closest overlay that should have overlay options.
        if (!innermostOverlay.hasOverlayOptions) {
            for (let i = this.overlays.length - 2; i >= 0; i--) {
                const parentOverlay = this.overlays[i];
                if (parentOverlay.hasOverlayOptions) {
                    parentOverlay.toggleOverlay(true);
                    break;
                }
            }
        }
    }

    removeHoverOverlay() {
        const hoverOverlay = this.hoverOverlay();
        if (hoverOverlay) {
            if (!this.overlays.find((o) => o.overlayTarget === hoverOverlay.overlayTarget)) {
                this.resizeObserver.unobserve(hoverOverlay.overlayTarget);
            }
            this.hoverOverlay.set(null);
        }
    }

    removeBuilderOverlays() {
        this.removeHoverOverlay();
        this.overlays.forEach((overlay) => {
            this.resizeObserver.unobserve(overlay.overlayTarget);
        });
        this.overlays.splice(0);
    }

    refreshOverlays() {
        this.hoverOverlay()?.refreshPosition();
        this.overlays.forEach((overlay) => {
            overlay.refreshPosition();
            overlay.refreshHandles();
        });
    }

    refreshPositions() {
        this.hoverOverlay()?.refreshPosition();
        this.overlays.forEach((overlay) => {
            overlay.refreshPosition();
        });
    }

    toggleOverlaysVisibility(show) {
        if (!show) {
            this.removeHoverOverlay();
        }
        this.overlays.forEach((overlay) => {
            overlay.toggleOverlayVisibility(show);
        });
    }

    showHoverOverlay(el) {
        if (this.hoverOverlay()?.overlayTarget === el) {
            return;
        }
        this.removeHoverOverlay();
        if (this.overlays.find((overlay) => overlay.overlayTarget === el && overlay.isActive())) {
            return;
        }
        const overlay = new BuilderOverlay(el, {
            iframe: this.iframe,
            getLocalOverlayContainerRect: this.builderOverlayContainer.getLocalOverlayContainerRect,
            history: this.dependencies.history,
            hasOverlayOptions: false,
            next: this.dependencies.operation.next,
            isMobileView: this.config.isMobileView,
            mobileBreakpoint: this.config.mobileBreakpoint,
            isRtl: this.config.isEditableRTL,
            isHoverOverlay: true,
        });
        this.hoverOverlay.set(overlay);
        this.resizeObserver.observe(overlay.overlayTarget, { box: "border-box" });
        // `refreshPosition` won't be called by the resize observer if the element was already observed
        overlay.refreshPosition();
    }

    showOverlayPreview(el) {
        // Hide all the active overlays.
        this.toggleOverlaysVisibility(false);
        // Show the preview of the one corresponding to the given element.
        const overlayToShow = this.overlays.find((overlay) => overlay.overlayTarget === el);
        if (!overlayToShow) {
            return;
        }
        overlayToShow.toggleOverlayPreview(true);
        overlayToShow.toggleOverlayVisibility(true);
    }

    hideOverlayPreview(el) {
        // Remove the preview.
        const overlayToHide = this.overlays.find((overlay) => overlay.overlayTarget === el);
        if (!overlayToHide) {
            return;
        }
        overlayToHide.toggleOverlayPreview(false);
        // Show back the active overlays.
        this.toggleOverlaysVisibility(true);
    }
}
