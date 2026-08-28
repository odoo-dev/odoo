import { useRef } from "@web/owl2/utils";
import { _t } from "@web/core/l10n/translation";
import { useService, useChildRef } from "@web/core/utils/hooks";
import { Dialog } from "@web/core/dialog/dialog";
import { SearchBar } from "@web/search/search_bar/search_bar";

import { Component, onMounted, proxy } from "@odoo/owl";
import { user } from "@web/core/user";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { rpc } from "@web/core/network/rpc";
import { AttachmentError } from "@html_editor/main/media/media_dialog/file_selector"; // todo : remove dependancy

import {
    QueryHelper,
    IMAGE_MIMETYPES,
    VIDEO_MIMETYPES,
    ATTACHMENT_FIELDS,
    QUERRY_ORDERS_BY,
} from "@html_editor/main/media/media_manager/helpers";
import { useModel, Model } from "@web/model/model";

// todo : why TF do I have to do this for useModel to work ?
class IrAttachment extends Model {
    _name = "ir.attachment";
}

class MediaManagerMediaItem extends Component {
    static template = "html_editor.MediaManagerMediaItem";
    static props = {
        id: { type: Number },
        attachment: { type: Object },
        selected: { type: Boolean, optional: true },
        onStarToggleCallback: Function,
        onSelectedToggleCallback: Function,
        onRemovedCallback: Function,
    };

    setup() {
        this.container = useRef("media-item-container");
        this.dialogs = useService("dialog");

        this.state = proxy({
            loaded: false,
            starred: this.getLocalStorageStarredState(),
            selected: !!this.props.selected,
        });
    }

    getLocalStorageStarredState() {
        const allStarredItems = JSON.parse(localStorage.getItem("media-item-is-starred")) || {};
        return !!allStarredItems[`id-${this.props.id}`];
    }

    updateLocalStorageStarredState() {
        const allStarredItems = JSON.parse(localStorage.getItem("media-item-is-starred")) || {};
        allStarredItems[`id-${this.props.id}`] = this.state.starred;
        localStorage.setItem("media-item-is-starred", JSON.stringify(allStarredItems));
    }

    toggleStarred() {
        this.state.starred = !this.state.starred;
        this.updateLocalStorageStarredState();

        this.props.onStarToggleCallback(this.props.id, this.state.starred);
    }

    toggleSelected() {
        this.state.selected = !this.state.selected;
        this.props.onSelectedToggleCallback(this.props.id, this.state.selected);
    }

    removeItem() {
        console.warn("removeItem", this.props.id);
        this.dialogs.add(ConfirmationDialog, {
            body: _t("Are you sure you want to delete this file?"),
            confirmLabel: _t("Delete"),
            confirmClass: "btn-danger",
            cancel: () => {},
            confirm: async () => {
                const prevented = await rpc("/html_editor/attachment/remove", {
                    ids: [this.props.id],
                });
                if (!Object.keys(prevented).length) {
                    this.props.onRemovedCallback(this.props.id);
                } else {
                    this.dialogs.add(AttachmentError, {
                        views: prevented[this.props.id],
                    });
                }
            },
        });
    }

    displayMedia(ev) {
        if (ev.target === this.container.el || ev.target.closest(".media-item-preview")) {
            console.warn("displayMedia", this.props.id);
        }
    }
}

export class MediaManager extends Component {
    static template = "html_editor.MediaManager";
    static components = {
        Dialog,
        SearchBar,
        MediaManagerMediaItem,
    };
    /** Params send to the old media dialog
     * => todo: check what should we keep and what should be removed.
     * Uncaught Promise > Invalid props for component 'MediaManager':
     * unknown key 'resModel',
     * unknown key 'resId',
     * unknown key 'field',
     * unknown key 'useMediaLibrary',
     * unknown key 'media',
     * unknown key 'onAttachmentChange',
     * unknown key 'noImages',
     * unknown key 'extraTabs',
     * unknown key 'activeTab',
     * unknown key 'tempMediaManagerSwitch',
     * unknown key 'addHistoryStep',
     * unknown key 'editorSelection',
     * unknown key 'save',
     * unknown key 'close'
     * */
    static props = {
        resModel: { type: String },
        resId: { type: Number },
        allowedMedia: { type: Array, optional: true, element: String },
        activeFilter: { type: String, optional: true },
        mediaToLoadAtStart: { type: Number, optional: true },
        mediaToLoadMore: { type: Number, optional: true },
        close: Function,
        validateCallback: Function,
        // "*": true, // todo this seems lazy
    };
    static defaultProps = {
        useMediaLibrary: true,
        extraTabs: [],
        mediaToLoadAtStart: 30,
        mediaToLoadMore: 30,
    };

    setup() {
        console.log("----------------------\nMEDIA MANAGER setup() \n----------------------");
        console.log("props : ", { ...this.props });
        console.log("this.env : ", this.env);
        this.contentClass = "o_select_media_dialog h-100"; // todo : necessary ?
        this.size = "xl";
        this.title = _t("Select a media");
        this.modalRef = useChildRef();

        this.orm = useService("orm");
        this.notificationService = useService("notification");
        this.uploadService = useService("upload");
        this.queryHelper = new QueryHelper({ ...this.props, env: this.env });

        this.confirmButtonRef = useRef("confirm-button");
        this.fileInputRef = useRef("file-input");

        this.errorMessages = {}; // todo : add in a proxy ?

        this.state = proxy({
            activeFilters: {},
            isLoading: true,
            isSaving: false,
            isDraggingFile: false,
            mediaItems: [],
        });

        this.selectedMediaIds = new Set([]);

        // useLayoutEffect( // todo : reimplement
        //     (nbSelectedAttachments) => {
        //         // Disable/enable the confirm button,
        //         // depending on whether media are selected or not.
        //         this.confirmButtonRef.el.toggleAttribute(
        //             "disabled",
        //             !nbSelectedAttachments || this.state.isSaving
        //         );
        //     },
        //     () => [this.selectedMedia[this.state.activeTab].length, this.state.isSaving]
        // );
        this.abortUploads = null; // todo : usage ?

        this.model = proxy(useModel(IrAttachment, this.modelParams, this.modelOptions));
        //useSubEnv({ model: this.model });
        console.log("this.env : ", this.env);

        onMounted(this.onMounted.bind(this));
    }

    async onMounted() {
        await this.resetMediaItems();
    }

    get modelParams() {
        const modelConfig = {
            resModel: this.props.resModel,
            fields: ATTACHMENT_FIELDS, // todo : should this be a deferent list ?
            activeFields: ATTACHMENT_FIELDS,
            openGroupsByDefault: false,
        };

        return {
            config: modelConfig,
            state: this.props.state?.modelState,
            groupByInfo: {}, // todo we could make use of this ?
            limit: this.props.mediaToLoadAtStart,
            countLimit: this.props.mediaToLoadAtStart, // todo should probably not be the same than limit
            defaultOrderBy: QUERRY_ORDERS_BY[this.state.activeFilters.order],
            // groupsLimit: this.archInfo.groupsLimit,
            // activeIdsLimit: session.active_ids_limit,
            hooks: {
                // onRecordSaved: this.onRecordSaved.bind(this),
                // onWillSaveRecord: this.onWillSaveRecord.bind(this),
                // onWillSaveMulti: this.onWillSaveMulti.bind(this),
                // onAskMultiSaveConfirmation: this.onAskMultiSaveConfirmation.bind(this),
                // onWillSetInvalidField: this.onWillSetInvalidField.bind(this),
            },
        };
    }

    get modelOptions() {
        return {
            lazy: false,
        };
    }

    // ----------------------------------
    // Attachments processing :
    // --------------

    addMediaItems(mediaItems) {
        console.warn("addMediaItems :: ", mediaItems);
        console.log("existing media items", this.state.mediaItems);
        for (const media of mediaItems) {
            // skip media that are already in mediaItems to avoid duplicates.
            // This can happen when uploading an image already existing as an attachment.
            // this might also append when loading more items from the db but some attachements have been removed from the db in the meantime.
            if (this.state.mediaItems.some((item) => item.id === media.id)) {
                continue;
            }

            const mediaItem = { id: media.id, attachment: media, mediaType: "attachment" };
            if (IMAGE_MIMETYPES.includes(media.mimetype)) {
                mediaItem.mediaType = "image";
            } else if (VIDEO_MIMETYPES.includes(media.mimetype)) {
                mediaItem.mediaType = "video";
            }
            this.state.mediaItems.push(mediaItem);
        }
    }

    // ----------------------------------
    // Attachments ORM calls :
    // --------------

    async resetMediaItems() {
        this.state.isLoading = true;
        this.state.mediaItems = [];
        // todo : add a debounce to avoid multiple rpc if user click filters rapidly ?
        const mediaItems = await this.fetchAttachment(this.props.mediaToLoadAtStart, 0);
        this.addMediaItems(mediaItems);
        this.state.isLoading = false;
    }

    async fetchAttachment(limit, offset, queryString = "") {
        if (!user.isInternalUser) {
            // Reading mediaItems as a portal user is not permitted and will raise
            // an access error, so we don't return any attachment
            return [];
        }
        this.state.isFetchingAttachments = true;

        // domain filter
        const domain = this.queryHelper.recordDomain;
        if (queryString) {
            domain.push(...this.queryHelper.search(queryString));
        }
        domain.push(...this.queryHelper.imagesDomain);

        // order by
        const order = QUERRY_ORDERS_BY[this.state.activeFilters.order];

        // todo : search only mediaItems linked to the current record or orphaned ??
        const mediaItems = await this.orm.call("ir.attachment", "search_read", [], {
            domain,
            fields: ATTACHMENT_FIELDS,
            order,
            // Try to fetch the first record of the next page just to know whether there is a next page.
            limit: limit + 1,
            offset,
        });
        // mediaItems.forEach((attachment) => (attachment.mediaType = "attachment"));
        this.state.canLoadMoreAttachments = mediaItems.length > limit;
        this.state.isFetchingAttachments = false;
        return mediaItems;
    }

    // ----------------------------------
    // Upload files :
    // --------------

    uploadDragEnter(ev) {
        this.state.isDraggingFile = true;
    }

    uploadDragLeave(ev) {
        this.state.isDraggingFile = false;
    }

    uploadDrop(ev) {
        this.state.isDraggingFile = false;
        const files = [...ev.dataTransfer.items]
            .map((item) => item.getAsFile())
            .filter((file) => {
                // todo: add a way to configure the accepted file type ?
                if (IMAGE_MIMETYPES.includes(file.type)) {
                    return file;
                }
            });
        this.uploadFiles(files);
    }

    /*
    async uploadUrl(url) {
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
                    // If it works from an image, use URL.
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
                    imageEl.onload = () => {
                        this.onLoadUploadedUrl(url, resolve);
                    };
                    imageEl.src = url;
                });
            });
    }

    async onLoadUploadedUrl(url, resolve) {
        await this.uploadService.uploadUrl(
            url,
            {
                resModel: this.props.resModel,
                resId: this.props.resId,
            },
            (attachment) => this.onUploaded(attachment)
        );
        resolve();
    }

    async onUploaded(attachment) {
        this.state.mediaItems = [
            attachment,
            ...this.state.mediaItems.filter((attach) => attach.id !== attachment.id),
        ];
        this.selectAttachment(attachment);
        if (!this.props.multiSelect) {
            await this.props.save();
        }
        if (this.props.onAttachmentChange) {
            this.props.onAttachmentChange(attachment);
        }
    }*/

    async uploadFiles(files) {
        let abortFn;

        const uploadPromise = this.uploadService.uploadFiles(
            files,
            {
                resModel: this.props.resModel,
                resId: this.props.resId,
                isImage: true, // todo : we should have a way to fussy upload multiple file type. determine the file type in the upload service probably.
            },
            this._fileUploaded.bind(this),
            (abort) => {
                // todo
                abortFn = abort;
            }
        );
        this.props?.setAbortUploadsCallback?.(() => abortFn?.()); // todo : refactor the way we expose abort function ?
        return uploadPromise;
    }

    _fileUploaded(attachment) {
        console.log("_fileUploaded", attachment);
        this.addMediaItems([attachment]);
    }

    // ----------------------------------
    // Media Items related :
    // --------------

    itemStarToggled(id, starred) {
        // todo : maybe this callback is not necessary since all the logic is in the MediaItem (at least for now )
        //console.warn("itemStarToggled", id, starred);
    }

    itemSelectedToggled(id, selected) {
        console.log(`itemSelectedToggled ${selected ? "add" : "remove"} `, id);
        if (selected) {
            this.selectedMediaIds.add(id);
        } else {
            this.selectedMediaIds.delete(id);
        }
        console.log("  `->", this.selectedMediaIds);
    }

    itemRemoved(id) {
        console.warn("itemRemoved", id);
        this.state.mediaItems = this.state.mediaItems.filter((item) => item.id !== id);
        this.selectedMediaIds.delete(id);
    }

    async renderSelectedMedia() {
        const htmlElements = [];
        console.warn("renderSelectedMedia", this.selectedMediaIds);
        console.log(this.state.mediaItems);

        // todo : create a MediaItem class ?? undertood by templates and component and comptaining the renderHtml logic etc ?
        for (const mediaId of this.selectedMediaIds) {
            const attachment = this.state.mediaItems.find(
                (item) => item.id === mediaId
            )?.attachment;
            if (!attachment) {
                console.error("Attachment not found for mediaId", mediaId);
                continue;
            }
            const imageEl = document.createElement("img");
            let src = attachment.image_src;
            if (!attachment.public && !attachment.url) {
                let accessToken = attachment.access_token;
                if (!accessToken) {
                    [accessToken] = await this.orm.call("ir.attachment", "generate_access_token", [
                        attachment.id,
                    ]);
                }
                src += `?access_token=${encodeURIComponent(accessToken)}`;
            }
            imageEl.src = src;
            imageEl.alt = attachment.description || "";
            imageEl.dataset.attachmentId = attachment.id;
            htmlElements.push(imageEl);
        }

        return htmlElements;
    }

    // ----------------------------------
    // UI interactions :
    // --------------

    async uploadFileClicked() {
        this.fileInputRef.el.click();
    }

    async onChangeFileInput(ev) {
        const fileInputEl = ev.target;
        const inputFiles = fileInputEl.files;
        if (!inputFiles.length) {
            return;
        }
        await this.uploadFiles(inputFiles);
        fileInputEl.value = "";
    }

    async importLinkClicked() {
        console.log("importLinkClicked");
    }

    resetFilters() {
        this.state.activeFilters = {};
        this.resetMediaItems();
    }

    applyFilters(options = {}) {
        console.log("applyFilter", options);
        this.state.activeFilters = { ...this.state.activeFilters, ...options };
        this.resetMediaItems();
    }

    async confirmClicked() {
        // todo saving media + call necessary stuffs
        // todo : improve : see image_selector.js line 375
        console.log("confirmClicked");
        await this.validate(); // todo : paralelize validate and close ?
        await this.close({ closeReason: "validate" });
    }

    async discardClicked() {
        // invalidate stuffs ??
        console.log("discardClicked");
        await this.close({ closeReason: "discard" });
    }

    async validate() {
        console.log("validate");
        const htmlElements = await this.renderSelectedMedia();
        this.props.validateCallback(htmlElements);
    }

    async close(closeParams = {}) {
        if (this.abortUploads) {
            this.abortUploads();
            delete this.abortUploads;
        }
        this.state.isSaving = false;
        await this.props.close(closeParams);
    }
}
