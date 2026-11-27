import { KanbanRenderer, kanbanRendererProps } from "@web/views/kanban/kanban_renderer";
import { MediaManagerKanbanRecord } from "./kanban_record";
import { useBus, useService } from "@web/core/utils/hooks";
import {
    IMAGE_EXTENSIONS,
    IMAGE_MIMETYPES,
    IMAGE_TYPE,
    MEDIA_TYPES,
    VIDEO_TYPE,
} from "@html_editor/main/media/media_manager/helpers";
import {
    getVideoMimetype,
    matchPlatformUrl,
    PLATFORMS,
} from "@html_editor/main/media/video/video_providers";
import { onPatched, onWillStart, signal, t, useProps } from "@odoo/owl";
import { useDebounced } from "@web/core/utils/timing";
import { _t } from "@web/core/l10n/translation";

export const MediaManagerKanbanRendererProps = {
    ...kanbanRendererProps,
    baseResModel: t.string(),
    baseResId: t.number().optional(),
    filters: t.array().optional(),
    // the kinds of media that can be imported: IMAGE_TYPE (upload, url) and
    // VIDEO_TYPE (url of a third party platform). Default: the images.
    allowedMediaTypes: t.array(t.selection(MEDIA_TYPES)).optional(),
};

export class MediaManagerKanbanRenderer extends KanbanRenderer {
    static template = "ir.attachment.MediaManagerKanbanRenderer";
    static components = {
        ...KanbanRenderer.components,
        KanbanRecord: MediaManagerKanbanRecord,
    };
    props = useProps(MediaManagerKanbanRendererProps);
    // for the templates
    IMAGE_TYPE = IMAGE_TYPE;
    VIDEO_TYPE = VIDEO_TYPE;
    fileInputRef = signal.ref();
    urlInputRef = signal.ref();

    setup() {
        super.setup();
        this.uploadService = useService("upload");
        this.notificationService = useService("notification");
        this.orm = useService("orm");
        this.state.mediaTags = [];
        onWillStart(() => this.loadMediaTags());
        useBus(this.env.model.bus, "MEDIA_TAGS_CHANGED", () => this.loadMediaTags());
        this.state.isDraggingFile = false;

        this.debouncedValidateUrl = useDebounced(this.validateUrl, 500);
        // the kind of link imported by the url input: IMAGE_TYPE or VIDEO_TYPE
        this.state.urlImportType = this.canImport(IMAGE_TYPE) ? IMAGE_TYPE : VIDEO_TYPE;
        this.initialDomain = [...this.env.model.config.domain];
        // the url input is hidden until the next render, it can only be
        // focused once displayed
        this.focusUrlInput = false;
        onPatched(() => {
            if (this.focusUrlInput) {
                this.focusUrlInput = false;
                this.urlInputRef()?.focus();
            }
        });
    }

    /**
     * @param {import("@html_editor/main/media/media_manager/helpers").MediaType} type
     * @returns {boolean}
     */
    canImport(type) {
        return (this.props.allowedMediaTypes ?? [IMAGE_TYPE]).includes(type);
    }

    /**
     * @param {string} url
     * @returns {Promise<{ isValidUrl: boolean, isValidImageFormat: boolean, videoMatch: Object|null }>}
     *      `videoMatch` is the platform of a video url (see `matchPlatformUrl`),
     *      when the videos can be imported
     */
    async validateUrl(url) {
        const path = url.split("?")[0];
        const isValidUrl = isHttpUrl(path);
        // the video platforms urls are pages, not images
        const videoMatch =
            (isValidUrl && this.canImport(VIDEO_TYPE) && matchPlatformUrl(url)) || null;

        const isValidImageFormat =
            isValidUrl &&
            !videoMatch &&
            this.canImport(IMAGE_TYPE) &&
            (await new Promise((resolve) => {
                const img = new Image();
                img.src = path;
                img.onload = () => resolve(true);
                img.onerror = () => resolve(false);
            }));
        return { isValidUrl, isValidImageFormat, videoMatch };
    }

    // ----------------
    // Filter records :
    // ----------------

    filterRecords(domain) {
        if (domain) {
            this.env.model.env.searchModel.splitAndAddDomain(domain);
        } else {
            this.env.model.env.searchModel.clearQuery();
        }
    }

    // ---------------
    // Tag switches :
    // ---------------

    get searchModel() {
        return this.env.model.env.searchModel;
    }

    /**
     * Load the tags, with a filter of the search model for each of them. The
     * filters are hidden from the search menus and share a group: the media
     * with any of the tags switched on are listed, in a single facet.
     */
    async loadMediaTags() {
        const tags = await this.orm.searchRead("html_editor.media.tag", [], ["name", "color"], {
            order: "name",
        });
        const searchModel = this.searchModel;
        const tagItems = Object.values(searchModel.searchItems).filter((item) => item.mediaTagId);
        const searchItemIds = new Map(tagItems.map((item) => [item.mediaTagId, item.id]));
        const newTags = tags.filter((tag) => !searchItemIds.has(tag.id));
        if (newTags.length) {
            // inactive filters, in the group of the other tags or in a new one
            // (see `SearchModel.createNewFilters`)
            const { groupId, groupNumber } = tagItems[0] ?? {
                groupId: searchModel.nextGroupId++,
                groupNumber: searchModel.nextGroupNumber++,
            };
            for (const tag of newTags) {
                const id = searchModel.nextId++;
                searchModel.searchItems[id] = {
                    id,
                    groupId,
                    groupNumber,
                    type: "filter",
                    description: tag.name,
                    domain: `[("media_tag_ids", "in", [${tag.id}])]`,
                    invisible: "True",
                    mediaTagId: tag.id,
                };
                searchItemIds.set(tag.id, id);
            }
        }
        this.state.mediaTags = tags.map((tag) => ({
            ...tag,
            searchItemId: searchItemIds.get(tag.id),
        }));
    }

    /** @returns {number[]} the ids of the tags switched on */
    get activeMediaTagIds() {
        const { query, searchItems } = this.searchModel;
        return query
            .map(({ searchItemId }) => searchItems[searchItemId]?.mediaTagId)
            .filter(Boolean);
    }

    toggleMediaTag(tag) {
        this.searchModel.toggleSearchItem(tag.searchItemId);
    }

    // -----------------
    // Import from URL :
    // -----------------

    get urlPlaceholder() {
        return this.state.urlImportType === VIDEO_TYPE ? _t("Video url...") : _t("Image url...");
    }

    get urlWarningTitle() {
        if (this.state.urlImportType === VIDEO_TYPE) {
            return _t(
                "The URL does not seem to be a video of a supported platform: %s",
                Object.values(PLATFORMS)
                    .map((platform) => platform.name)
                    .join(", ")
            );
        }
        return _t(
            "The URL does not seem to be a supported image. Try with: %s",
            IMAGE_EXTENSIONS.join(", ")
        );
    }

    /**
     * @param {import("@html_editor/main/media/media_manager/helpers").MediaType} type
     * @returns {boolean} whether the url input is displayed to import this kind of link
     */
    isImportingUrl(type) {
        return this.state.showUrlInput && this.state.urlImportType === type;
    }

    /**
     * Display the url input, or import its link. Both kinds of link are
     * accepted whatever the button: the type only adapts the input.
     *
     * @param {import("@html_editor/main/media/media_manager/helpers").MediaType} [type]
     */
    async importLinkClicked(type = IMAGE_TYPE) {
        const inputEl = this.urlInputRef();
        if (this.isImportingUrl(type)) {
            inputEl.disabled = true;
            const url = inputEl.value;
            const { isValidUrl, isValidImageFormat, videoMatch } = await this.validateUrl(url);
            if (videoMatch) {
                await this.uploadVideoUrl(url, videoMatch);
                this.state.showUrlInput = false;
                inputEl.value = "";
            } else if (isValidImageFormat && isValidUrl) {
                await this.uploadFileFromUrl(url);
                this.state.showUrlInput = false;
                inputEl.value = "";
            } else {
                this.notificationService.add(_t("The provided URL is not valid."), {
                    type: "danger",
                    sticky: true,
                });
                inputEl.disabled = false;
            }
        } else {
            this.state.showUrlInput = true;
            this.state.urlImportType = type;
            inputEl.disabled = false;
            this.focusUrlInput = true;
        }
    }

    async uploadFileFromUrl(url) {
        await fetch(url)
            .then(async (result) => {
                const blob = await result.blob();
                blob.id = new Date().getTime();
                blob.name = new URL(url, window.location.href).pathname
                    .split("/")
                    .findLast((s) => s);
                await this.uploadFiles([blob]);
            })
            .catch(async () => {
                await new Promise((resolve) => {
                    // If the raw bytes upload failed, use URL.
                    const imageEl = document.createElement("img");
                    imageEl.onerror = () => {
                        // This message is about the blob fetch failure.
                        // It is only displayed if the fallback did not work.
                        this.notificationService.add(
                            _t("An error occurred while fetching the entered URL."),
                            {
                                type: "danger",
                                sticky: true,
                            }
                        );

                        resolve();
                    };
                    imageEl.onload = async () => {
                        await this.uploadUrl(url);
                        resolve();
                    };
                    imageEl.src = url;
                });
            });
    }

    async uploadUrl(url) {
        const uploadData = {
            resModel: this.props.baseResModel,
            resId: this.props.baseResId,
            isImage: true, // todo : we should have a way to fussy upload multiple file type. determine the file type in the upload service probably.
        };

        await this.uploadService.uploadUrl(url, uploadData, this._fileUploaded.bind(this));
    }

    /**
     * Store the url of a platform's video, the platform being given by the
     * mimetype.
     *
     * @param {string} url
     * @param {{ provider: typeof PLATFORMS[string], urlMatch: Array }} videoMatch
     */
    async uploadVideoUrl(url, { provider, urlMatch }) {
        const { videoId } = provider.getVideoUrlData(urlMatch);
        const uploadData = {
            resModel: this.props.baseResModel,
            resId: this.props.baseResId,
            name: videoId ? `${provider.name} - ${videoId}` : provider.name,
            mimetype: getVideoMimetype(provider),
        };
        await this.uploadService.uploadUrl(url, uploadData, this._fileUploaded.bind(this));
    }

    async onUrlInputInputed(ev) {
        this.state.isValidatingUrl = true;
        const { isValidUrl, isValidImageFormat, videoMatch } = await this.debouncedValidateUrl(
            ev.target.value
        );
        this.state.isValidMedia = isValidImageFormat || !!videoMatch;
        this.state.isValidUrl = isValidUrl;
        this.state.isValidatingUrl = false;
    }

    // --------------
    // Upload files :
    // --------------

    async uploadFileClicked() {
        this.fileInputRef().click();
    }

    async onFileInputChanged(ev) {
        const fileInputEl = ev.target;
        const inputFiles = fileInputEl.files;
        if (!inputFiles.length) {
            return;
        }
        await this.uploadFiles(inputFiles);
        fileInputEl.value = "";
    }

    /**
     * Only the files can be dropped, not the elements or links dragged from
     * the page (e.g. the image of a card).
     */
    uploadDragEnter(ev) {
        this.state.isDraggingFile =
            this.canImport(IMAGE_TYPE) && !!ev.dataTransfer?.types.includes("Files");
    }

    uploadDragLeave() {
        this.state.isDraggingFile = false;
    }

    uploadDrop(ev) {
        this.state.isDraggingFile = false;
        const files = [...ev.dataTransfer.items]
            // the other items (text, html, ...) have no file
            .filter((item) => item.kind === "file")
            .map((item) => item.getAsFile())
            // todo: add a way to configure the accepted file type ?
            .filter((file) => file && IMAGE_MIMETYPES.includes(file.type));
        if (files.length) {
            this.uploadFiles(files);
        }
    }

    async uploadFiles(files) {
        const uploadData = {
            resModel: this.props.baseResModel,
            resId: this.props.baseResId,
            isImage: true, // todo : we should have a way to fussy upload multiple file type. determine the file type in the upload service probably.
        };

        await this.uploadService.uploadFiles(files, uploadData, this._fileUploaded.bind(this));
    }

    _fileUploaded(_attachment) {
        return this.env.model.load();
    }
}

/**
 * Whether the url is an http(s) url, or a path on the current domain.
 *
 * @param {string} url
 * @returns {boolean}
 */
function isHttpUrl(url) {
    if (url.startsWith("/") && !url.startsWith("//")) {
        return url.length > 1;
    }
    return URL.canParse(url) && ["http:", "https:"].includes(new URL(url).protocol);
}
