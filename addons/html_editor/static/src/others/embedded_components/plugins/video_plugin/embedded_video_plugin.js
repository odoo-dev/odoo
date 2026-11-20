import { VideoPlugin } from "@html_editor/main/media/video/video_plugin";
import { EmbeddedVideoSelector } from "./video_selector_dialog/embedded_video_selector";
import { renderToElement } from "@web/core/utils/render";
import { _t } from "@web/core/l10n/translation";
import { matchPlatformUrl } from "@html_editor/main/media/video/video_providers";

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
        "dialog",
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
     * Let the user edit the options of an embedded video.
     *
     * @param {function} save called with the new video data
     * @param {Object} video
     * @param {string} video.url
     * @param {Object} video.options
     */
    async openVideoSelectorDialog(save, { url, options }) {
        if (!matchPlatformUrl(url)) {
            return;
        }
        const videoData = await this.openVideoOptionsDialog({
            url,
            options,
            confirmLabel: _t("Save"),
        });
        if (videoData) {
            // the embedded video component expects `src` instead of `embedUrl`
            const { embedUrl, ...media } = videoData;
            save({ ...media, src: embedUrl });
        }
    }
}
