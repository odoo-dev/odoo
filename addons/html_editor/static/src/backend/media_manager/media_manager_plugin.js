import { MediaPlugin } from "@html_editor/main/media/media_plugin";
import { Domain } from "@web/core/domain";
import {
    getRecordDomain,
    IMAGES_DOMAIN,
    VIDEOS_DOMAIN,
} from "@html_editor/main/media/media_manager/domain_helper";
import {
    VIDEO_ELEMENT_SELECTOR,
    VIDEO_URL_MIMETYPES,
} from "@html_editor/main/media/video/video_providers";
import { MAIN_PLUGINS } from "@html_editor/plugin_sets";
import { loadImage } from "@html_editor/utils/image_processing";
import {
    getBaseResId,
    getMediaManagertDialogProps,
    MediaManagerDialog,
} from "./media_manager_dialog";

/**
 * @typedef {((params: { url: string }) => Promise<HTMLElement|undefined>)[]} media_manager_video_element_providers
 * Build the element of a video chosen in the media manager (see VideoPlugin).
 * The videos are only listed when there is a provider.
 */

/**
 * Opens the media manager instead of the media dialog. The media manager relies
 * on backend views (SelectCreateDialog, kanban view), so this plugin is only
 * part of the backend assets: the editors of the frontend keep the MediaPlugin.
 */
export class MediaManagerPlugin extends MediaPlugin {
    /**
     * Domain of the media to display in the media manager. Override it to
     * adapt the media to the context the editor is used in (see
     * domain_helper.js).
     *
     * @param {Object} recordInfo the edited record ({ resModel, resId, ... })
     * @param {Object} params the params given to `openMediaDialog`
     * @returns {Array}
     */
    getDomain(recordInfo, params) {
        return getRecordDomain(recordInfo.resModel, getBaseResId(recordInfo.resId));
    }

    /**
     * @override
     */
    openMediaDialog(params = {}, editableEl = null) {
        if (params.useOldMediaDialog) {
            return super.openMediaDialog(params, editableEl);
        }
        const videoElementProviders = this.getResource("media_manager_video_element_providers");
        const recordInfo = this.getRecordInfo(editableEl);
        let domain = this.getDomain(recordInfo, params);
        // A custom `save` callback (builder options) needs an image.
        const canUseVideos = !!videoElementProviders.length && !params.save;
        // A video is replaced by a video, an image by an image.
        const videoToReplace = canUseVideos && params.node?.closest?.(VIDEO_ELEMENT_SELECTOR);
        let mediaToReplace = videoToReplace || params.node || null;
        const allowVideos = canUseVideos && (!params.node || !!videoToReplace);
        if (videoToReplace) {
            domain = Domain.and([domain, VIDEOS_DOMAIN]).toList();
        } else if (!allowVideos) {
            domain = Domain.and([domain, IMAGES_DOMAIN]).toList();
        }
        return this.dependencies.dialog.addDialog(MediaManagerDialog, {
            ...getMediaManagertDialogProps(recordInfo),
            domain,
            allowVideos,
            onSelected: async (resIds, records) => {
                if (!records.length) {
                    return;
                }
                const elements = [];
                for (const record of records) {
                    if (VIDEO_URL_MIMETYPES.includes(record.mimetype)) {
                        const videoEl = await this.createVideoElement(videoElementProviders, {
                            url: record.url,
                        });
                        if (videoEl) {
                            elements.push(videoEl);
                        }
                        continue;
                    }
                    const imageEl = await loadImage(record.local_url);
                    imageEl.alt = record.display_name ?? "";
                    elements.push(imageEl);
                }
                const promises = [];
                for (const el of elements) {
                    promises.push(this.onSaveMediaDialog(el, mediaToReplace));
                    mediaToReplace = null;
                }
                await Promise.all(promises);
            },
            multiSelect: !mediaToReplace,
        });
    }

    /**
     * @param {media_manager_video_element_providers} providers
     * @param {{ url: string }} params
     * @returns {Promise<HTMLElement|undefined>}
     */
    async createVideoElement(providers, params) {
        for (const provider of providers) {
            const videoEl = await provider(params);
            if (videoEl) {
                return videoEl;
            }
        }
    }
}

const mediaPluginIndex = MAIN_PLUGINS.indexOf(MediaPlugin);
if (mediaPluginIndex !== -1) {
    MAIN_PLUGINS.splice(mediaPluginIndex, 1, MediaManagerPlugin);
}
