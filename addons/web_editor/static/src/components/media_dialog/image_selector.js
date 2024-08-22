/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";
import weUtils from '@web_editor/js/common/utils';
import { Attachment, FileSelector, IMAGE_MIMETYPES, IMAGE_EXTENSIONS } from './file_selector';
import { KeepLast } from "@web/core/utils/concurrency";

import { useRef, useState, useEffect } from "@odoo/owl";

export class AutoResizeImage extends Attachment {
    static template = "web_editor.AutoResizeImage";
    setup() {
        super.setup();

        this.image = useRef('auto-resize-image');
        this.container = useRef('auto-resize-image-container');

        this.state = useState({
            loaded: false,
        });

        useEffect(() => {
            this.image.el.addEventListener('load', () => this.onImageLoaded());
            return this.image.el.removeEventListener('load', () => this.onImageLoaded());
        }, () => []);
    }

    async onImageLoaded() {
        if (!this.image.el) {
            // Do not fail if already removed.
            return;
        }
        if (this.props.onLoaded) {
            await this.props.onLoaded(this.image.el);
            if (!this.image.el) {
                // If replaced by colored version, aspect ratio will be
                // computed on it instead.
                return;
            }
        }
        const aspectRatio = this.image.el.offsetWidth / this.image.el.offsetHeight;
        const width = aspectRatio * this.props.minRowHeight;
        this.container.el.style.flexGrow = width;
        this.container.el.style.flexBasis = `${width}px`;
        this.state.loaded = true;
    }
}
const newLocal = "img-fluid";
export class ImageSelector extends FileSelector {
    static mediaSpecificClasses = ["img", newLocal, "o_we_custom_image"];
    static mediaSpecificStyles = [];
    static mediaExtraClasses = [
        "rounded-circle",
        "rounded",
        "img-thumbnail",
        "shadow",
        "w-25",
        "w-50",
        "w-75",
        "w-100",
    ];
    static tagNames = ["IMG"];
    static attachmentsListTemplate = "web_editor.ImagesListTemplate";
    static components = {
        ...FileSelector.components,
        AutoResizeImage,
    };

    setup() {
        super.setup();

        this.keepLastLibraryMedia = new KeepLast();

        this.state.libraryMedia = [];
        this.state.libraryResults = null;
        this.state.isFetchingLibrary = false;
        this.state.searchService = 'all';
        this.NUMBER_OF_MEDIA_TO_DISPLAY = 10;

        this.uploadText = _t("Upload an image");
        this.urlPlaceholder = "https://www.odoo.com/logo.png";
        this.addText = _t("Add URL");
        this.searchPlaceholder = _t("Search an image");
        this.urlWarningTitle = _t("Uploaded image's format is not supported. Try with: " + IMAGE_EXTENSIONS.join(', '));
        this.allLoadedText = _t("All images have been loaded");
        this.MIN_ROW_HEIGHT = 128;

        this.fileMimetypes = IMAGE_MIMETYPES.join(',');
    }

    get canLoadMore() {
        // The user can load more library media only when the filter is set.
        if (this.state.searchService === 'media-library') {
            return this.state.libraryResults && this.state.libraryMedia.length < this.state.libraryResults;
        }
        return super.canLoadMore;
    }

    get hasContent() {
        if (this.state.searchService === 'all') {
            return super.hasContent || !!this.state.libraryMedia.length;
        } else if (this.state.searchService === 'media-library') {
            return !!this.state.libraryMedia.length;
        }
        return super.hasContent;
    }

    get isFetching() {
        return super.isFetching || this.state.isFetchingLibrary;
    }

    get selectedMediaIds() {
        return this.props.selectedMedia[this.props.id].filter(media => media.mediaType === 'libraryMedia').map(({ id }) => id);
    }

    get allAttachments() {
        return [...super.allAttachments, ...this.state.libraryMedia];
    }

    get attachmentsDomain() {
        const domain = super.attachmentsDomain;
        domain.push(['mimetype', 'in', IMAGE_MIMETYPES]);
        if (!this.props.useMediaLibrary) {
            domain.push('|', ['url', '=', false], '!', ['url', '=ilike', '/web_editor/shape/%']);
        }
        domain.push('!', ['name', '=like', '%.crop']);
        domain.push('|', ['type', '=', 'binary'], '!', ['url', '=like', '/%/static/%']);

        // There is no point to fetch optimized images (meaning they are related
        // to an `original_id`) as those are not shown. Worst, it leads to bugs:
        // it might fetch only optimized images when clicking on "load more"
        // which will look like it's bugged as no images will appear on screen
        // (they all will be hidden).
        domain.push(['original_id', '=', false]);

        return domain;
    }

    async uploadFiles(files) {
        await this.uploadService.uploadFiles(files, { resModel: this.props.resModel, resId: this.props.resId, isImage: true }, (attachment) => this.onUploaded(attachment));
    }

    async uploadUrl(url) {
        await fetch(url).then(async result => {
            const blob = await result.blob();
            blob.id = new Date().getTime();
            blob.name = new URL(url, window.location.href).pathname.split("/").findLast(s => s);
            await this.uploadFiles([blob]);
        }).catch(async () => {
            await new Promise(resolve => {
                // If it works from an image, use URL.
                const imageEl = document.createElement("img");
                imageEl.onerror = () => {
                    // This message is about the blob fetch failure.
                    // It is only displayed if the fallback did not work.
                    this.notificationService.add(_t("An error occurred while fetching the entered URL."), {
                        title: _t("Error"),
                        sticky: true,
                    });
                    resolve();
                };
                imageEl.onload = () => {
                    super.uploadUrl(url).then(resolve);
                };
                imageEl.src = url;
            });
        });
    }

    async validateUrl(...args) {
        const { isValidUrl, path } = super.validateUrl(...args);
        const isValidFileFormat = isValidUrl && await new Promise(resolve => {
            const img = new Image();
            img.src = path;
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
        });
        return { isValidUrl, isValidFileFormat };
    }

    isInitialMedia(attachment) {
        if (this.props.media.dataset.originalSrc) {
            return this.props.media.dataset.originalSrc === attachment.image_src;
        }
        return this.props.media.getAttribute('src') === attachment.image_src;
    }

    async fetchAttachments(limit, offset) {
        const attachments = await super.fetchAttachments(limit, offset);
        // Color-substitution for dynamic SVG attachment
        const primaryColors = {};
        for (let color = 1; color <= 5; color++) {
            primaryColors[color] = weUtils.getCSSVariableValue('o-color-' + color);
        }
        return attachments.map(attachment => {
            if (attachment.image_src.startsWith('/')) {
                const newURL = new URL(attachment.image_src, window.location.origin);
                // Set the main colors of dynamic SVGs to o-color-1~5
                if (attachment.image_src.startsWith('/web_editor/shape/')) {
                    newURL.searchParams.forEach((value, key) => {
                        const match = key.match(/^c([1-5])$/);
                        if (match) {
                            newURL.searchParams.set(key, primaryColors[match[1]]);
                        }
                    });
                } else {
                    // Set height so that db images load faster
                    newURL.searchParams.set('height', 2 * this.MIN_ROW_HEIGHT);
                }
                attachment.thumbnail_src = newURL.pathname + newURL.search;
            }
            if (this.selectInitialMedia() && this.isInitialMedia(attachment)) {
                this.selectAttachment(attachment);
            }
            return attachment;
        });
    }

    async fetchLibraryMedia(offset) {
        if (!this.state.needle) {
            return { media: [], results: null };
        }

        this.state.isFetchingLibrary = true;
        try {
            const response = await rpc(
                '/web_editor/media_library_search',
                {
                    'query': this.state.needle,
                    'offset': offset,
                },
                {
                    silent: true,
                }
            );
            this.state.isFetchingLibrary = false;
            const media = (response.media || []).slice(0, this.NUMBER_OF_MEDIA_TO_DISPLAY);
            media.forEach(record => record.mediaType = 'libraryMedia');
            return { media, results: response.results };
        } catch {
            // Either API endpoint doesn't exist or is misconfigured.
            console.error(`Couldn't reach API endpoint.`);
            this.state.isFetchingLibrary = false;
            return { media: [], results: null };
        }
    }

    async loadMore(...args) {
        await super.loadMore(...args);
        if (!this.props.useMediaLibrary
            // The user can load more library media only when the filter is set.
            || this.state.searchService !== 'media-library'
        ) {
            return;
        }
        return this.keepLastLibraryMedia.add(this.fetchLibraryMedia(this.state.libraryMedia.length)).then(({ media }) => {
            // This is never reached if another search or loadMore occurred.
            this.state.libraryMedia.push(...media);
        });
    }

    async search(...args) {
        await super.search(...args);
        if (!this.props.useMediaLibrary) {
            return;
        }
        if (!this.state.needle) {
            this.state.searchService = 'all';
        }
        this.state.libraryMedia = [];
        this.state.libraryResults = 0;
        return this.keepLastLibraryMedia.add(this.fetchLibraryMedia(0)).then(({ media, results }) => {
            // This is never reached if a new search occurred.
            this.state.libraryMedia = media;
            this.state.libraryResults = results;
        });
    }

    async onClickAttachment(attachment) {
        this.selectAttachment(attachment);
        if (!this.props.multiSelect) {
            await this.props.save();
        }
    }

    async onClickMedia(media) {
        this.props.selectMedia({ ...media, mediaType: 'libraryMedia' });
        if (!this.props.multiSelect) {
            await this.props.save();
        }
    }

    /**
     * Utility method used by the MediaDialog component.
     */
    static async createElements(selectedMedia, { orm }) {
        // Create all media-library attachments.
        const toSave = Object.fromEntries(selectedMedia.filter(media => media.mediaType === 'libraryMedia').map(media => [
            media.id, {
                query: media.query || '',
                is_dynamic_svg: !!media.isDynamicSVG,
                dynamic_colors: media.dynamicColors,
            }
        ]));
        let savedMedia = [];
        if (Object.keys(toSave).length !== 0) {
            savedMedia = await rpc('/web_editor/save_library_media', { media: toSave });
        }
        const selected = selectedMedia.filter(media => media.mediaType === 'attachment').concat(savedMedia).map(attachment => {
            // Color-customize dynamic SVGs with the theme colors
            if (attachment.image_src && attachment.image_src.startsWith('/web_editor/shape/')) {
                const colorCustomizedURL = new URL(attachment.image_src, window.location.origin);
                colorCustomizedURL.searchParams.forEach((value, key) => {
                    const match = key.match(/^c([1-5])$/);
                    if (match) {
                        colorCustomizedURL.searchParams.set(key, weUtils.getCSSVariableValue(`o-color-${match[1]}`));
                    }
                });
                attachment.image_src = colorCustomizedURL.pathname + colorCustomizedURL.search;
            }
            return attachment;
        });
        return Promise.all(selected.map(async (attachment) => {
            const imageEl = document.createElement('img');
            let src = attachment.image_src;
            if (!attachment.public && !attachment.url) {
                let accessToken = attachment.access_token;
                if (!accessToken) {
                    [accessToken] = await orm.call(
                        'ir.attachment',
                        'generate_access_token',
                        [attachment.id],
                    );
                }
                src += `?access_token=${encodeURIComponent(accessToken)}`;
            }
            imageEl.src = src;
            imageEl.alt = attachment.description || '';
            return imageEl;
        }));
    }

    async onImageLoaded(imgEl, attachment) {
        this.debouncedScrollUpdate();
        if (attachment.mediaType === 'libraryMedia' && !imgEl.src.startsWith('blob')) {
            // This call applies the theme's color palette to the
            // loaded illustration. Upon replacement of the image,
            // `onImageLoad` is called again, but the replacement image
            // has an URL that starts with 'blob'. The condition above
            // uses this to avoid an infinite loop.
            await this.onLibraryImageLoaded(imgEl, attachment);
        }
    }

    /**
     * This converts the colors of an svg coming from the media library to
     * the palette's ones, and make them dynamic.
     *
     * @param {HTMLElement} imgEl
     * @param {Object} media
     * @returns
     */
    async onLibraryImageLoaded(imgEl, media) {
        const mediaUrl = imgEl.src;
        try {
            const response = await fetch(mediaUrl);
            if (response.headers.get('content-type') === 'image/svg+xml') {
                let svg = await response.text();
                const dynamicColors = {};
                const combinedColorsRegex = new RegExp(Object.values(weUtils.DEFAULT_PALETTE).join('|'), 'gi');
                svg = svg.replace(combinedColorsRegex, match => {
                    const colorId = Object.keys(weUtils.DEFAULT_PALETTE).find(key => weUtils.DEFAULT_PALETTE[key] === match.toUpperCase());
                    const colorKey = 'c' + colorId
                    dynamicColors[colorKey] = weUtils.getCSSVariableValue('o-color-' + colorId);
                    return dynamicColors[colorKey];
                });
                const fileName = mediaUrl.split('/').pop();
                const file = new File([svg], fileName, {
                    type: "image/svg+xml",
                });
                imgEl.src = URL.createObjectURL(file);
                if (Object.keys(dynamicColors).length) {
                    media.isDynamicSVG = true;
                    media.dynamicColors = dynamicColors;
                }
            }
        } catch {
            console.error('CORS is misconfigured on the API server, image will be treated as non-dynamic.');
        }
    }
}
