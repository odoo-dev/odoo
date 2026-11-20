import { Plugin } from "@html_editor/plugin";
import { VideoSelector } from "@html_editor/main/media/media_dialog/video_selector";
import { matchPlatformUrl, renderVideoElements } from "./video_providers";
import { _t } from "@web/core/l10n/translation";

export class VideoPlugin extends Plugin {
    static id = "video";
    static dependencies = ["history", "dom"];
    static defaultConfig = {
        allowVideo: true,
        allowVideoFile: false,
    };

    /** @type {import("plugins").EditorResources} */
    resources = {
        ...(this.config.allowVideo && {
            media_dialog_extra_tabs: {
                id: "VIDEOS",
                title: _t("Videos"),
                Component: this.componentForMediaDialog,
                sequence: 30,
                props: {
                    allowVideoFile: !!this.config.allowVideoFile,
                },
            },
            paste_media_url_command_providers: this.getCommandForVideoUrlPaste.bind(this),
        }),
    };

    get componentForMediaDialog() {
        return VideoSelector;
    }

    /**
     * Provide a powerbox command to embed the video in the document if the url is supported.
     * The command is based on the subclasses implementation of :
     *  - isValidVideoUrl static method
     *  - embedCommandTitle static property
     *  - embedCommandDescription static property
     *
     * @param {string} url
     * @returns {Object|undefined}
     */
    getCommandForVideoUrlPaste(url) {
        const match = matchPlatformUrl(url);
        if (match) {
            const { provider, urlMatch } = match;
            return {
                title: _t("Embed %s Video", provider.name),
                description: _t("Embed the %s video in the document.", provider.name),
                icon: "play_circle",
                run: () => this.insertVideoElement(urlMatch, provider),
            };
        }
    }

    /**
     * Insert a video element in the document based on the provided url.
     *
     * @param {array} urlMatch The result of the regex match of the url
     * @param {type} platform The video platform Class
     */
    insertVideoElement(urlMatch, platform) {
        const videoData = platform.getVideoUrlData(urlMatch);
        const videoElement = this.createVideoElement(videoData);
        this.dependencies.dom.insert(videoElement);
        this.dependencies.history.commit();
    }

    /**
     * @param {Object} videoData see `getVideoUrlData` of the providers
     * @returns {HTMLElement} the element to insert in the document
     */
    createVideoElement(videoData) {
        return renderVideoElements([videoData], { document: this.document })[0];
    }
}
