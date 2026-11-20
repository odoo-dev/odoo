import { Plugin } from "@html_editor/plugin";
import { VideoSelector } from "@html_editor/main/media/media_dialog/video_selector";
import {
    getVideoElementData,
    matchPlatformUrl,
    renderVideoElements,
    VIDEO_CLASS,
} from "./video_providers";
import { VideoOptionsDialog } from "./video_options_dialog/video_options_dialog";
import { _t } from "@web/core/l10n/translation";

export class VideoPlugin extends Plugin {
    static id = "video";
    static dependencies = ["history", "dom", "dialog"];
    static shared = ["editVideoElement"];
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
            media_manager_video_element_providers: this.createMediaManagerVideoElement.bind(this),
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
     * Build the element of a platform's video chosen in the media manager,
     * once the user has set its options.
     *
     * @param {Object} params
     * @param {string} params.url
     * @returns {Promise<HTMLElement|undefined>} undefined if the url is not the
     *      video of a supported platform, or if the user discarded the options
     */
    async createMediaManagerVideoElement({ url }) {
        if (!matchPlatformUrl(url)) {
            return;
        }
        const videoData = await this.openVideoOptionsDialog({ url });
        return videoData && this.createVideoElement(videoData);
    }

    /**
     * Edit the options of a platform's video of the document (built by
     * `renderVideoElements`, the embedded videos have their own menu).
     *
     * @param {HTMLElement} videoEl
     */
    async editVideoElement(videoEl) {
        const videoElementData = getVideoElementData(videoEl);
        if (!videoElementData) {
            return;
        }
        const videoData = await this.openVideoOptionsDialog({
            ...videoElementData,
            confirmLabel: _t("Save"),
        });
        if (videoData) {
            videoEl.closest(`.${VIDEO_CLASS}`).replaceWith(this.createVideoElement(videoData));
            this.dependencies.history.commit();
        }
    }

    /**
     * Let the user set the options of a platform's video.
     *
     * @param {Object} params
     * @param {string} params.url the url of a platform's video
     * @param {Object} [params.options] the current options of the video
     * @param {string} [params.confirmLabel]
     * @returns {Promise<Object|undefined>} the video data (see `getVideoUrlData`
     *      of the providers), undefined if the user discarded the options
     */
    async openVideoOptionsDialog({ url, options, confirmLabel }) {
        let videoData;
        await this.dependencies.dialog.addDialog(VideoOptionsDialog, {
            url,
            ...(options && { options }),
            ...(confirmLabel && { confirmLabel }),
            confirm: (data) => (videoData = data),
        });
        return videoData;
    }

    /**
     * @param {Object} videoData see `getVideoUrlData` of the providers
     * @returns {HTMLElement} the element to insert in the document
     */
    createVideoElement(videoData) {
        return renderVideoElements([videoData], { document: this.document })[0];
    }
}
