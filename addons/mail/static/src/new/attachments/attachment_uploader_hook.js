/* @odoo-module */

import { status, useComponent, useState } from "@odoo/owl";
import { Deferred } from "@web/core/utils/concurrency";
import { useBus, useService } from "@web/core/utils/hooks";
import { createLocalId } from "@mail/new/utils/misc";
import { removeFromArrayWithPredicate } from "@mail/new/utils/arrays";
import { _t } from "@web/core/l10n/translation";

function dataUrlToBlob(data, type) {
    const binData = window.atob(data);
    const uiArr = new Uint8Array(binData.length);
    uiArr.forEach((_, index) => (uiArr[index] = binData.charCodeAt(index)));
    return new Blob([uiArr], { type });
}

let nextId = -1;

/**
 * @param {import("@mail/new/core/thread_model").Thread} pThread
 */
export function useAttachmentUploader(pThread, isPending = false) {
    const component = useComponent();
    const { bus, upload } = useService("file_upload");
    const notification = useService("notification");
    /** @type {import("@mail/new/core/store_service").Store} */
    const store = useService("mail.store");
    /** @type {import("@mail/new/core/thread_service").ThreadService} */
    const threadService = useService("mail.thread");
    /** @type {import("@mail/new/attachments/attachment_service").AttachmentService} */
    const attachmentService = useService("mail.attachment");
    const abortByAttachmentId = new Map();
    const deferredByAttachmentId = new Map();
    const uploadingAttachmentIds = new Set();
    const state = useState({
        uploadData({ data, name, type }) {
            const file = new File([dataUrlToBlob(data, type)], name, { type });
            return this.uploadFile(file);
        },
        async uploadFile(file) {
            const thread = pThread;
            const tmpId = nextId--;
            uploadingAttachmentIds.add(tmpId);
            await upload("/mail/attachment/upload", [file], {
                buildFormData(formData) {
                    formData.append("thread_id", thread.id);
                    formData.append("thread_model", thread.model);
                    formData.append("is_pending", isPending);
                    formData.append("temporary_id", tmpId);
                },
            }).catch((e) => {
                if (e.name !== "AbortError") {
                    throw e;
                }
            });
            const uploadDoneDeferred = new Deferred();
            deferredByAttachmentId.set(tmpId, uploadDoneDeferred);
            return uploadDoneDeferred;
        },
        async unlink(attachment) {
            const thread = pThread;
            const abort = abortByAttachmentId.get(attachment.id);
            abortByAttachmentId.delete(attachment.id);
            deferredByAttachmentId.delete(attachment.id);
            if (abort) {
                abort();
                return;
            }
            await attachmentService.delete(attachment);
            removeFromArrayWithPredicate(
                thread.pendingAttachments,
                ({ id }) => id === attachment.id
            );
        },
        async unlinkAll() {
            const thread = pThread;
            const proms = [];
            thread.pendingAttachments.forEach((attachment) => proms.push(this.unlink(attachment)));
            await Promise.all(proms);
            this.clear();
        },
        clear() {
            const thread = pThread;
            abortByAttachmentId.clear();
            deferredByAttachmentId.clear();
            uploadingAttachmentIds.clear();
            // prevent queuing of a render that will never be resolved.
            if (status(component) !== "destroyed") {
                thread.pendingAttachments = [];
            }
        },
    });
    useBus(bus, "FILE_UPLOAD_ADDED", ({ detail: { upload } }) => {
        const tmpId = parseInt(upload.data.get("temporary_id"));
        if (!uploadingAttachmentIds.has(tmpId)) {
            return;
        }
        const threadId = parseInt(upload.data.get("thread_id"));
        const threadModel = upload.data.get("thread_model");
        const originThread = threadService.insert({ model: threadModel, id: threadId });
        abortByAttachmentId.set(tmpId, upload.xhr.abort.bind(upload.xhr));
        const attachment = attachmentService.insert({
            filename: upload.title,
            id: tmpId,
            mimetype: upload.type,
            name: upload.title,
            originThread: isPending ? undefined : originThread,
            extension: upload.title.split(".").pop(),
            uploading: true,
        });
        originThread.pendingAttachments.push(attachment);
    });
    useBus(bus, "FILE_UPLOAD_LOADED", ({ detail: { upload } }) => {
        const tmpId = parseInt(upload.data.get("temporary_id"));
        if (!uploadingAttachmentIds.has(tmpId)) {
            return;
        }
        uploadingAttachmentIds.delete(tmpId);
        abortByAttachmentId.delete(tmpId);
        if (upload.xhr.status === 413) {
            notification.add(_t("File too large"), { type: "danger" });
            return;
        }
        if (upload.xhr.status !== 200) {
            notification.add(_t("Server error"), { type: "danger" });
            return;
        }
        const response = JSON.parse(upload.xhr.response);
        if (response.error) {
            notification.add(response.error, { type: "danger" });
            return;
        }
        const threadId = parseInt(upload.data.get("thread_id"));
        const threadModel = upload.data.get("thread_model");
        const originThread = store.threads[createLocalId(threadModel, threadId)];
        const attachment = attachmentService.insert({
            ...response,
            extension: upload.title.split(".").pop(),
            originThread: isPending ? undefined : originThread,
        });
        const index = originThread.pendingAttachments.findIndex(({ id }) => id === tmpId);
        const def = deferredByAttachmentId.get(tmpId);
        if (index >= 0) {
            state.unlink(originThread.pendingAttachments[index]);
            originThread.pendingAttachments[index] = attachment;
        } else {
            originThread.pendingAttachments.push(attachment);
        }
        if (def) {
            def.resolve(attachment);
            deferredByAttachmentId.delete(tmpId);
        }
    });
    useBus(bus, "FILE_UPLOAD_ERROR", ({ detail: { upload } }) => {
        const tmpId = parseInt(upload.data.get("temporary_id"));
        if (!uploadingAttachmentIds.has(tmpId)) {
            return;
        }
        abortByAttachmentId.delete(tmpId);
        deferredByAttachmentId.delete(tmpId);
        uploadingAttachmentIds.delete(parseInt(upload.data.get("temporary_id")));
    });

    return state;
}
