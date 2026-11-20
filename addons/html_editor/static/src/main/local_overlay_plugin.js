import { Resource, signal } from "@odoo/owl";
import { uniqueId } from "@web/core/utils/functions";
import { useRootCreator } from "@web/core/utils/hooks";
import { LocalOverlayContainer } from "../local_overlay_container";
import { Plugin, shared } from "../plugin";

/**
 * This plugins provides a way to create a "local" overlays so that their
 * visibility is relative to the overflow of their ancestors.
 */
export class LocalOverlayPlugin extends Plugin {
    static id = "localOverlay";
    static shared = shared(["addLocalOverlay"]);

    // Mounts the local overlay container of the iframe.
    createRoot = useRootCreator();

    setup() {
        // Keeps the local overlay keys of editors sharing a container apart.
        this.localOverlayPrefix = uniqueId("local_overlay");
        // Lets destroy() remove the local overlays this editor still shows.
        this.localOverlayCleanups = new Set();
    }

    /**
     * Render a component in its own local overlay. It is removed by the
     * `remove` method of the returned handle, or when the editor is destroyed.
     * Local overlays start at the top left corner of their container, so their
     * content is positioned from the `getLocalOverlayContainerRect` method of
     * the handle.
     *
     * @param {string} localOverlayId set as `data-oe-local-overlay-id` on the local overlay
     * @param {typeof import("@odoo/owl").Component} Component
     * @param {Object} [props]
     * @param {Object} [options]
     * @param {boolean} [options.renderInsideIframe] render it in `this.document.body`
     *        so that it scrolls with the page (e.g. inside the website iframe).
     *        The container is mounted on the next animation frame, so
     *        `getLocalOverlayContainerRect` is available from then on.
     * @returns {{ remove: () => void, getLocalOverlayContainerRect: () => DOMRect }}
     */
    addLocalOverlay(localOverlayId, Component, props, { renderInsideIframe = false } = {}) {
        const localOverlayContainers = renderInsideIframe
            ? this.getIframeLocalOverlayContainers()
            : this.config.localOverlayContainers;
        const localOverlays = localOverlayContainers.localOverlays;
        // Same localOverlayId, same key: removing and adding a local overlay
        // again updates its component instead of mounting a new one.
        const localOverlay = {
            key: `${this.localOverlayPrefix}_${localOverlayId}`,
            localOverlayId,
            Component,
            props,
        };
        localOverlays.add(localOverlay);
        const remove = () => {
            localOverlays.delete(localOverlay);
            this.localOverlayCleanups.delete(remove);
        };
        this.localOverlayCleanups.add(remove);
        return {
            remove,
            // An empty rect once the container is unmounted, like a removed element.
            getLocalOverlayContainerRect: () =>
                localOverlayContainers.ref()?.getBoundingClientRect() ?? new DOMRect(),
        };
    }

    /**
     * The local overlay container of the iframe is mounted at the end of its
     * body, for the first local overlay that needs it.
     *
     * @returns {{ ref: () => HTMLElement, localOverlays: Resource }}
     */
    getIframeLocalOverlayContainers() {
        if (!this.iframeLocalOverlayContainers) {
            // Same shape as config.localOverlayContainers, so that
            // addLocalOverlay() uses both containers the same way.
            this.iframeLocalOverlayContainers = {
                ref: signal.ref(),
                localOverlays: new Resource(),
            };
            // Lets destroy() remove this container.
            this.iframeLocalOverlayRoot = this.createRoot(LocalOverlayContainer, {
                props: {
                    localOverlays: this.iframeLocalOverlayContainers.localOverlays,
                    localOverlayRef: this.iframeLocalOverlayContainers.ref,
                },
            });
            this.iframeLocalOverlayRoot.mount(this.document.body);
        }
        return this.iframeLocalOverlayContainers;
    }

    destroy() {
        for (const localOverlayCleanup of this.localOverlayCleanups) {
            localOverlayCleanup();
        }
        this.iframeLocalOverlayRoot?.destroy();
        super.destroy();
    }
}
