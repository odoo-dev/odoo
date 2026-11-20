import { VideoPlugin } from "@html_editor/main/media/video/video_plugin";
import { EmbeddedVideoSelector } from "./video_selector_dialog/embedded_video_selector";
import { renderToElement } from "@web/core/utils/render";

/**
 * This plugin is meant to replace the Video plugin.
 */
export class EmbeddedVideoPlugin extends VideoPlugin {
    static dependencies = [
        "embeddedComponents",
        "selection",
        "history",
        "overlay",
        "media",
        "history",
        "dom",
    ];

    // Extends the base class resources
    /** @type {import("plugins").EditorResources} */
    resources = {
        ...this.resources,
        on_will_mount_component_handlers: this.extendEmbeddedVideoProps.bind(this),
    };

    /** @override */
    get componentForMediaDialog() {
        return EmbeddedVideoSelector;
    }

    /**
     * @override
     */
    createVideoElement(videoData) {
        const videoElement = renderToElement("html_editor.EmbeddedVideoBlueprint", {
            embeddedProps: JSON.stringify({
                baseUrl: videoData.baseUrl || "",
                videoId: videoData.videoId,
                platform: videoData.platform,
                params: videoData.options || {},
            }),
            isVertical: videoData.options?.isVertical || false,
        });
        return this.document.importNode(videoElement, true);
    }

    /**
     * @param {Object} props
     */
    extendEmbeddedVideoProps({ name, props }) {
        if (name === "video") {
            Object.assign(props, {
                createOverlay: (Component, props = {}, options) =>
                    this.dependencies.overlay.createOverlay(Component, props, options),
                focusEditable: () => this.dependencies.selection.focusEditable(),
                commit: () => this.dependencies.history.commit(),
                openVideoSelectorDialog: this.openVideoSelectorDialog.bind(this),
            });
        }
    }

    /**
     * Open media dialog allowing the user to insert a video
     * @param {function} save
     * @param {HTMLIFrameElement} iframe
     */
    openVideoSelectorDialog(save, iframe) {
        this.dependencies.media.openMediaDialog({
            node: iframe,
            save: (elements, [media]) => {
                if (media.embedUrl) {
                    // we need to replace embedUrl by src in order to stay retro compatible with the existing embed video component
                    media.src = media.embedUrl;
                    delete media.embedUrl;
                    save(media);
                }
            },
            visibleTabs: ["VIDEOS"],
        });
    }
}
