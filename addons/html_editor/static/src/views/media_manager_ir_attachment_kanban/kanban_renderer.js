import { KanbanRenderer, kanbanRendererProps } from "@web/views/kanban/kanban_renderer";
import { MediaManagerKanbanRecord } from "./kanban_record";
import { useService } from "@web/core/utils/hooks";
import { IMAGE_MIMETYPES } from "@html_editor/main/media/media_manager/helpers";
import { signal, t, useProps } from "@odoo/owl";
import { useDebounced } from "@web/core/utils/timing";
import { _t } from "@web/core/l10n/translation";

export const MediaManagerKanbanRendererProps = {
    ...kanbanRendererProps,
    baseResModel: t.string(),
    baseResId: t.number().optional(),
    filters: t.array().optional(),
};

export class MediaManagerKanbanRenderer extends KanbanRenderer {
    static template = "ir.attachment.MediaManagerKanbanRenderer";
    static components = {
        ...KanbanRenderer.components,
        KanbanRecord: MediaManagerKanbanRecord,
    };
    props = useProps(MediaManagerKanbanRendererProps);
    fileInputRef = signal.ref();
    urlInputRef = signal.ref();

    setup() {
        console.groupCollapsed("%c MediaManagerKanbanRenderer :: setup()", "background: #9f9;");
        console.warn("setup() trace");
        console.log("this : ", this);
        console.log("props : ", this.props);
        console.groupEnd();
        super.setup();
        this.uploadService = useService("upload");
        this.notificationService = useService("notification");
        this.state.isDraggingFile = false;

        this.debouncedValidateUrl = useDebounced(this.validateUrl, 500);
    }

    async validateUrl(url) {
        console.warn("validateUrl", url);
        const path = url.split("?")[0];
        const isValidUrl = /^.+\..+$/.test(path); // TODO improve

        const isValidImageFormat =
            isValidUrl &&
            (await new Promise((resolve) => {
                const img = new Image();
                img.src = path;
                img.onload = () => resolve(true);
                img.onerror = () => resolve(false);
            }));
        return { isValidUrl, isValidImageFormat };
    }

    // ----------------
    // Filter records :
    // ----------------

    filterRecords(domain) {
        console.warn("filterRecords", domain);
        console.log("this.env.model : ", this.env.model);
        this.env.model.load();
    }

    // -----------------
    // Import from URL :
    // -----------------

    async importLinkClicked() {
        const inputEl = this.urlInputRef();
        if (this.state.showUrlInput) {
            inputEl.disabled = true;
            const url = inputEl.value;
            const { isValidUrl, isValidImageFormat } = await this.validateUrl(url);
            if (isValidImageFormat && isValidUrl) {
                await this.uploadFileFromUrl(url);
                this.state.showUrlInput = false;
                inputEl.value = "";
            } else {
                this.notificationService.add(_t("The provided URL is not valid."), {
                    type: "danger",
                    sticky: true,
                });
            }
        } else {
            this.state.showUrlInput = true;
            inputEl.disabled = false;
            inputEl.focus();
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
                        await this.onLoadUploadedUrl(url);
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

    async onUrlInputInputed(ev) {
        this.state.isValidatingUrl = true;
        const { isValidUrl, isValidFileFormat } = await this.debouncedValidateUrl(ev.target.value);
        this.state.isValidImageFormat = isValidFileFormat;
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

    uploadDragEnter(ev) {
        this.state.isDraggingFile = true;
    }

    uploadDragLeave(ev) {
        this.state.isDraggingFile = false;
    }

    uploadDrop(ev) {
        console.log("uploadDrop", ev);
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

    async uploadFiles(files) {
        const uploadData = {
            resModel: this.props.baseResModel,
            resId: this.props.baseResId,
            isImage: true, // todo : we should have a way to fussy upload multiple file type. determine the file type in the upload service probably.
        };

        await this.uploadService.uploadFiles(files, uploadData, this._fileUploaded.bind(this));
    }

    _fileUploaded(attachment) {
        return this.env.model.load();
    }
}
