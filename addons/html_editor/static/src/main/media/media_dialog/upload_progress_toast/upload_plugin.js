import { Plugin, proxy, signal, usePlugin } from "@odoo/owl";
import { rpc } from "@web/core/network/rpc";
import { NotificationPlugin } from "@web/core/notifications/notification_plugin";
import { registry } from "@web/core/registry";
import { services } from "@web/core/services";
import { UploadProgressToast } from "./upload_progress_toast";
import { _t } from "@web/core/l10n/translation";
import { checkFileSize } from "@web/core/utils/files";
import { humanNumber } from "@web/core/utils/numbers";
import { getDataURLFromFile } from "@web/core/utils/urls";

export const AUTOCLOSE_DELAY = 3000;
export const AUTOCLOSE_DELAY_LONG = 8000;

export class UploadPlugin extends Plugin {
    /** @private */
    notification = usePlugin(NotificationPlugin);

    fileId = 0;
    files = proxy({});
    isVisible = signal(false);

    setup() {
        registry.category("main_components").add("UploadProgressToast", {
            Component: UploadProgressToast,
            props: {
                close: () => this.isVisible.set(false),
            },
        });
    }

    incrementId() {
        this.fileId++;
    }

    addFile(file) {
        this.files[file.id] = file;
        this.isVisible.set(true);
        file.cancelUpload = () => {
            this.deleteFile(file.id);
        };
        return this.files[file.id];
    }

    deleteFile(fileId) {
        delete this.files[fileId];
        if (!Object.keys(this.files).length) {
            this.isVisible.set(false);
        }
    }

    async uploadUrl(url, { resModel, resId }, onUploaded) {
        const attachment = await rpc("/html_editor/attachment/add_url", {
            url,
            res_model: resModel,
            res_id: resId,
        });
        await onUploaded(attachment);
    }

    /**
     * This takes an array of files (from an input HTMLElement), and
     * uploads them while managing the UploadProgressToast.
     *
     * @param {Array<File>} files
     * @param {Object} options
     * @param {Function} onUploaded
     * @param {Function} setAbortCallback // Optional - To abort uploads
     */
    async uploadFiles(files, { resModel, resId, isImage }, onUploaded, setAbortCallback) {
        // Upload the smallest file first to block the user the least possible.
        const sortedFiles = Array.from(files).sort((a, b) => a.size - b.size);

        const controller = new AbortController();
        const { signal: abortSignal } = controller;

        let currentXHR = null;
        let addAttachmentRpc = null;

        setAbortCallback?.(() => {
            controller.abort();
            addAttachmentRpc?.abort?.();
            currentXHR?.abort?.();
        });

        for (const file of sortedFiles) {
            if (abortSignal.aborted) {
                return;
            }

            let fileSize = file.size;
            if (!checkFileSize(fileSize, this.notification)) {
                return null;
            }
            if (!fileSize) {
                fileSize = "";
            } else {
                fileSize = humanNumber(fileSize) + "B";
            }

            const id = ++this.fileId;
            file.progressToastId = id;
            // This reactive object, built based on the files array,
            // is given as a prop to the UploadProgressToast.
            this.addFile({
                id,
                name: file.name,
                size: fileSize,
                mimetype: file.type,
            });
        }

        // Upload one file at a time: no need to parallel as upload is
        // limited by bandwidth.
        for (const sortedFile of sortedFiles) {
            if (abortSignal.aborted) {
                break;
            }

            const file = this.files[sortedFile.progressToastId];
            if (!file) {
                // A file could be deleted before uploading started,
                // in such case, we wouldn't proceed further.
                continue;
            }
            let dataURL;
            try {
                dataURL = await getDataURLFromFile(sortedFile);
                if (abortSignal.aborted) {
                    break;
                }
            } catch {
                this.deleteFile(file.id);
                this.notification.add(_t('Could not load the file "%s".', sortedFile.name), {
                    type: "danger",
                });
                continue;
            }

            currentXHR = new XMLHttpRequest();
            addAttachmentRpc = null;

            const onProgress = (ev) => {
                if (ev.lengthComputable) {
                    file.progress = (ev.loaded / ev.total) * 100;
                }
            };
            const onLoad = () => (file.progress = 100);
            const onFileAbort = () => {
                this.deleteFile(file.id);
                file.aborted = true;
            };

            currentXHR.upload.addEventListener("progress", onProgress);
            currentXHR.upload.addEventListener("load", onLoad);
            currentXHR.addEventListener("abort", onFileAbort);

            try {
                const rpcProm = rpc(
                    "/html_editor/attachment/add_data",
                    {
                        name: file.name,
                        data: dataURL.split(",")[1],
                        res_id: resId,
                        res_model: resModel,
                        is_image: !!isImage,
                        width: 0,
                        quality: 0,
                    },
                    { xhr: currentXHR }
                );
                addAttachmentRpc = rpcProm;
                file.cancelUpload = () => {
                    rpcProm.abort();
                };
                const attachment = await addAttachmentRpc;
                if (abortSignal.aborted) {
                    break;
                }

                if (attachment.error) {
                    file.hasError = true;
                    file.errorMessage = attachment.error;
                } else {
                    if (attachment.mimetype === "image/webp") {
                        try {
                            // Generate alternate format for reports.
                            await this._convertWebpToJpeg(dataURL, file.name, attachment.id);
                        } catch (convErr) {
                            console.warn("[UploadPlugin] webp conversion failed:", convErr);
                        }
                    }
                    file.uploaded = true;
                    await onUploaded(attachment);
                }
            } catch (err) {
                if (abortSignal.aborted || file.aborted) {
                    break;
                }
                file.hasError = true;
                console.error("Upload error:", err);
                throw err;
            } finally {
                currentXHR.upload.removeEventListener("progress", onProgress);
                currentXHR.upload.removeEventListener("load", onLoad);
                currentXHR.removeEventListener("abort", onFileAbort);
                // If there's an error, display the error message for longer
                const message_autoclose_delay = file.hasError
                    ? AUTOCLOSE_DELAY_LONG
                    : AUTOCLOSE_DELAY;
                setTimeout(() => this.deleteFile(file.id), message_autoclose_delay);
                dataURL = null;
            }
        }

        currentXHR = null;
        addAttachmentRpc = null;
    }

    /** @private */
    async _convertWebpToJpeg(dataURL, name, attachmentId) {
        const image = document.createElement("img");
        image.src = `data:image/webp;base64,${dataURL.split(",")[1]}`;
        await new Promise((res, rej) => {
            image.onload = res;
            image.onerror = rej;
        });

        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;

        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0);

        const altDataURL = canvas.toDataURL("image/jpeg", 0.75);

        await rpc("/web_editor/attachment/add_data", {
            name: name.replace(/\.webp$/, ".jpg"),
            data: altDataURL.split(",")[1],
            res_id: attachmentId,
            res_model: "ir.attachment",
            is_image: true,
            width: 0,
            quality: 0,
        });
    }
}

services.add(UploadPlugin);

/**
 * -----------------------------------------------------------------------------
 * @todo owl3 migration
 * temporary - to remove when all use of the upload service are removed
 * -----------------------------------------------------------------------------
 */
export const uploadService = {
    dependencies: ["notification"],
    start() {
        const uploadPlugin = usePlugin(UploadPlugin);
        const service = Object.create(uploadPlugin);
        Object.defineProperty(service, "fileId", {
            get() {
                return uploadPlugin.fileId;
            },
        });
        Object.defineProperty(service, "progressToast", {
            value: {
                files: uploadPlugin.files,
                get isVisible() {
                    return uploadPlugin.isVisible();
                },
                set isVisible(value) {
                    uploadPlugin.isVisible.set(value);
                },
            },
        });
        service.incrementId = uploadPlugin.incrementId.bind(uploadPlugin);
        service.addFile = uploadPlugin.addFile.bind(uploadPlugin);
        service.deleteFile = uploadPlugin.deleteFile.bind(uploadPlugin);
        service.uploadUrl = uploadPlugin.uploadUrl.bind(uploadPlugin);
        service.uploadFiles = uploadPlugin.uploadFiles.bind(uploadPlugin);
        return service;
    },
};

registry.category("services").add("upload", uploadService);
