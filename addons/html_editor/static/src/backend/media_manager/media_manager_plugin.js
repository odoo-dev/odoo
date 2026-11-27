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
import { IMAGE_TYPE, VIDEO_TYPE } from "@html_editor/main/media/media_manager/helpers";
import {
    getBaseResId,
    getMediaManagertDialogProps,
    MediaManagerDialog,
} from "./media_manager_dialog";

/**
 * The media of each kind, see `allowedMediaTypes` of `openMediaManager`.
 * FILE_TYPE has none yet: it is never available.
 */
const MEDIA_TYPE_DOMAINS = {
    [IMAGE_TYPE]: IMAGES_DOMAIN,
    [VIDEO_TYPE]: VIDEOS_DOMAIN,
};

/**
 * @typedef {((params: { url: string, options?: Object }) => Promise<HTMLElement|undefined>)[]} media_manager_video_element_providers
 * Build the element of a video chosen in the media manager (see VideoPlugin),
 * with the given options if any (see `videoOptions` of `openMediaManager`).
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
     * @param {Object} params the params given to `openMediaManager`
     * @returns {Array}
     */
    getDomain(recordInfo, params) {
        return getRecordDomain(recordInfo.resModel, getBaseResId(recordInfo.resId));
    }

    /**
     * The kinds of media the media manager can list and import here: the
     * images, and the videos when the editor can insert them.
     *
     * @param {Object} params the params given to `openMediaManager`
     * @returns {import("@html_editor/main/media/media_manager/helpers").MediaType[]}
     */
    getAvailableMediaTypes(params) {
        const mediaTypes = [IMAGE_TYPE];
        if (this.getResource("media_manager_video_element_providers").length) {
            mediaTypes.push(VIDEO_TYPE);
        }
        return mediaTypes;
    }

    /**
     * @override
     * Opens the media manager, or the old media dialog with
     * `params.useOldMediaDialog`.
     */
    openMediaDialog(params = {}, editableEl = null) {
        if (params.useOldMediaDialog) {
            return super.openMediaDialog(params, editableEl);
        }
        return this.openMediaManager(params, editableEl);
    }

    /**
     * Opens the media manager to insert or replace media.
     *
     * @param {Object} [params]
     * @param {HTMLElement} [params.node] the media to replace
     * @param {import("@html_editor/main/media/media_manager/helpers").MediaType[]} [params.allowedMediaTypes]
     *      the kinds of media that can be chosen and imported (IMAGE_TYPE,
     *      VIDEO_TYPE), among the available ones. By default, the kind of the
     *      replaced media, the images for a custom `save` callback (e.g. of a
     *      builder option), or all the available ones.
     * @param {boolean} [params.multiSelect] whether several media can be
     *      chosen. By default, only when no media is replaced.
     * @param {Object} [params.searchDefaults] the filters of the search view
     *      active by default, e.g. `{ my_media_filter: 1 }` (as the
     *      `search_default_*` keys of a context)
     * @param {Object} [params.videoOptions] the options of the chosen videos
     *      (autoplay, loop, hideControls, ...), not set by the user then (e.g.
     *      a background video).
     * @param {Function} [params.save] called with the chosen element (their
     *      list with `multiSelect`), the chosen attachments, `undefined` (the
     *      tab of the media dialog) and the replaced media, instead of
     *      inserting the chosen media.
     * @param {HTMLElement} [editableEl] the editable of the edited record
     */
    openMediaManager(params = {}, editableEl = null) {
        const videoElementProviders = this.getResource("media_manager_video_element_providers");
        const recordInfo = this.getRecordInfo(editableEl);
        const availableMediaTypes = this.getAvailableMediaTypes(params);
        // A video is replaced by a video, an image by an image.
        const videoToReplace =
            availableMediaTypes.includes(VIDEO_TYPE) &&
            params.node?.closest?.(VIDEO_ELEMENT_SELECTOR);
        let mediaToReplace = videoToReplace || params.node || null;
        let defaultMediaTypes = availableMediaTypes;
        if (videoToReplace) {
            defaultMediaTypes = [VIDEO_TYPE];
        } else if (mediaToReplace || params.save) {
            defaultMediaTypes = [IMAGE_TYPE];
        }
        const allowedMediaTypes = (params.allowedMediaTypes ?? defaultMediaTypes).filter((type) =>
            availableMediaTypes.includes(type)
        );
        const domain = Domain.and([
            this.getDomain(recordInfo, params),
            Domain.or(allowedMediaTypes.map((type) => MEDIA_TYPE_DOMAINS[type])),
        ]).toList();
        const multiSelect = params.multiSelect ?? !mediaToReplace;
        const dialogProps = getMediaManagertDialogProps(recordInfo);
        const searchDefaults = Object.entries(params.searchDefaults ?? {}).map(([name, value]) => [
            `search_default_${name}`,
            value,
        ]);
        return this.dependencies.dialog.addDialog(MediaManagerDialog, {
            ...dialogProps,
            context: { ...dialogProps.context, ...Object.fromEntries(searchDefaults) },
            domain,
            allowedMediaTypes,
            multiSelect,
            onSelected: async (resIds, records) => {
                if (!records.length) {
                    return;
                }
                const elements = [];
                for (const record of records) {
                    if (VIDEO_URL_MIMETYPES.includes(record.mimetype)) {
                        const videoEl = await this.createVideoElement(videoElementProviders, {
                            url: record.url,
                            options: params.videoOptions,
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
                if (params.save) {
                    // same arguments as the media dialog (without its tab)
                    const selection = multiSelect ? elements : elements[0];
                    await params.save(selection, records, undefined, mediaToReplace);
                    return;
                }
                const promises = [];
                for (const el of elements) {
                    promises.push(this.onSaveMediaDialog(el, mediaToReplace));
                    mediaToReplace = null;
                }
                await Promise.all(promises);
            },
        });
    }

    /**
     * @param {media_manager_video_element_providers} providers
     * @param {{ url: string, options?: Object }} params
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
