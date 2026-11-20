import { Youtube } from "@html_editor/main/media/video/providers/youtube";
import { Dailymotion } from "@html_editor/main/media/video/providers/dailymotion";
import { Vimeo } from "@html_editor/main/media/video/providers/vimeo";
import { GDriveVideo } from "@html_editor/main/media/video/providers/gdrive_video";
import { Instagram } from "@html_editor/main/media/video/providers/instagram";
import { Facebook } from "@html_editor/main/media/video/providers/facebook";
import { Twitch } from "@html_editor/main/media/video/providers/twitch";
import { Loom } from "@html_editor/main/media/video/providers/loom";
import { VideoFile } from "@html_editor/main/media/video/providers/video_file";

/**
 * The video pipe of the editor: find the provider of a video url and build the
 * element inserted in the document. The url validation and the embed url
 * building stay in the providers (see `providers/`).
 *
 * Note: media_dialog/video_selector.js has its own copy of this pipe, used by
 * the old media dialog. Both are kept until that dialog is removed.
 */

/** The third party video platforms. */
export const PLATFORMS = {
    youtube: Youtube,
    instagram: Instagram,
    facebook: Facebook,
    gDrive: GDriveVideo,
    dailymotion: Dailymotion,
    vimeo: Vimeo,
    twitch: Twitch,
    loom: Loom,
};

/** The platforms, plus the video files referenced by their url. */
export const VIDEO_PROVIDERS = {
    ...PLATFORMS,
    [VideoFile.id]: VideoFile,
};

/**
 * The mimetype of the url attachments of a platform's videos (see
 * SUPPORTED_VIDEO_URL_MIMETYPES on the server).
 *
 * @param {typeof PLATFORMS[string]} platform
 * @returns {string}
 */
export function getVideoMimetype(platform) {
    return `video/x-${platform.id.toLowerCase()}`;
}

/** The mimetypes of the url attachments of the platforms' videos. */
export const VIDEO_URL_MIMETYPES = Object.values(PLATFORMS).map(getVideoMimetype);

/** The class of the video elements built by {@link renderVideoElements}. */
export const VIDEO_CLASS = "media_iframe_video";

/**
 * Find the platform of a video url.
 *
 * @param {string} url
 * @returns {{ provider: typeof PLATFORMS[string], urlMatch: Array } | null}
 */
export function matchPlatformUrl(url) {
    for (const provider of Object.values(PLATFORMS)) {
        const urlMatch = provider.isValidVideoUrl(url);
        if (urlMatch) {
            return { provider, urlMatch };
        }
    }
    return null;
}

/**
 * Find the provider of a video url: a platform, or a video file when they are
 * allowed (checking a video file loads it, hence the promise).
 *
 * @param {string} url
 * @param {Object} [params]
 * @param {boolean} [params.allowVideoFile=false]
 * @returns {Promise<{ provider: typeof VIDEO_PROVIDERS[string], urlMatch: Array } | null>}
 */
export async function matchVideoUrl(url, { allowVideoFile = false } = {}) {
    if (!URL.canParse(url)) {
        return null;
    }
    const platformMatch = matchPlatformUrl(url);
    if (platformMatch || !allowVideoFile) {
        return platformMatch;
    }
    const urlMatch = await VideoFile.isValidVideoUrl(url);
    return urlMatch ? { provider: VideoFile, urlMatch } : null;
}

/**
 * Build the elements to insert in the document for the given videos.
 *
 * @param {Array<Object>} videos the video data (see `getVideoUrlData` of the
 *      providers): { baseUrl, platform, videoId, embedUrl, options }
 * @param {Object} [params]
 * @param {Document} [params.document]
 * @returns {HTMLElement[]}
 */
export function renderVideoElements(videos, { document = window.document } = {}) {
    return videos.map((videoData) => {
        const div = document.createElement("div");
        div.classList.add(VIDEO_CLASS);
        div.dataset.platform = videoData.platform;
        div.dataset.baseUrl = videoData.baseUrl;
        div.dataset.embedUrl = videoData.embedUrl;
        if (videoData.platform === VideoFile.id) {
            // A video file has no id, and its options are not encoded in its
            // url: the container has to carry them, being the only thing the
            // `<video>` element can be rebuilt from.
            div.dataset.videoOptions = JSON.stringify(videoData.options || {});
        } else {
            div.dataset.videoId = videoData.videoId;
        }
        let sizeClass = "media_iframe_video_size";
        if (videoData.options?.isVertical) {
            div.dataset.isVertical = "true";
            sizeClass = "media_iframe_video_size_for_vertical";
        }
        div.innerHTML = `
            <div class="css_editable_mode_display"></div>
            <div class="${sizeClass}" contenteditable="false"></div>
        `;
        div.append(VIDEO_PROVIDERS[videoData.platform].createPlayerElement(videoData, document));
        return div;
    });
}
