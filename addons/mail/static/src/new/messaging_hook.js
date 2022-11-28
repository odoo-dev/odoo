/** @odoo-module */

import { reactive, useState } from "@odoo/owl";
import { useBus, useService } from "@web/core/utils/hooks";
import { removeFromArrayWithPredicate } from "./utils";

/**
 * @typedef {import("@mail/new/messaging").Messaging} Messaging
 */

/**
 *  @returns {Messaging} messaging
 */
export function useMessaging() {
    return useState(useService("mail.messaging"));
}

export function useMessageHighlight(duration = 2000) {
    let timeout;
    const state = reactive({
        async highlightMessage(msgId) {
            const lastHighlightedMessageId = state.highlightedMessageId;
            clearHighlight();
            if (lastHighlightedMessageId === msgId) {
                // Give some time for the state to update.
                await new Promise(setTimeout);
            }
            state.highlightedMessageId = msgId;
            timeout = setTimeout(clearHighlight, duration);
        },
        highlightedMessageId: null,
    });
    function clearHighlight() {
        clearTimeout(timeout);
        timeout = null;
        state.highlightedMessageId = null;
    }
    return state;
}

function dataUrlToBlob(data, type) {
    const binData = window.atob(data);
    const uiArr = new Uint8Array(binData.length);
    uiArr.forEach((_, index) => (uiArr[index] = binData.charCodeAt(index)));
    return new Blob([uiArr], { type });
}

export function useAttachmentUploader({ threadId, messageId }) {
    const { bus, upload } = useService("file_upload");
    const notification = useService("notification");
    const messaging = useService("mail.messaging");
    let abortByUploadId = {};
    const uploadingAttachmentIds = new Set();
    const state = useState({
        attachments: [],
        async upload(fileData) {
            const { name, data, type } = fileData;
            const thread =
                messaging.state.threads[threadId || messaging.state.messages[messageId].resId];
            const file = new File([dataUrlToBlob(data, type)], name, { type });
            const tmpId = messaging.nextId++;
            uploadingAttachmentIds.add(tmpId);
            upload("/mail/attachment/upload", [file], {
                buildFormData(formData) {
                    formData.append("thread_id", thread.resId || thread.id);
                    formData.append("thread_model", thread.resModel || "mail.channel");
                    formData.append("is_pending", true);
                    formData.append("temporary_id", tmpId);
                },
            }).catch((e) => {
                if (e.name !== "AbortError") {
                    throw e;
                }
            });
        },
        async unlink(attachment) {
            const abort = abortByUploadId[attachment.id];
            if (abort) {
                abort();
                return;
            }
            await messaging.unlinkAttachment(attachment);
            removeFromArrayWithPredicate(state.attachments, ({ id }) => id === attachment.id);
        },
        async unlinkAll() {
            const proms = [];
            this.attachments.forEach((attachment) => proms.push(this.unlink(attachment)));
            await Promise.all(proms);
            this.reset();
        },
        reset() {
            abortByUploadId = {};
            uploadingAttachmentIds.clear();
            state.attachments = [];
        },
    });
    useBus(bus, "FILE_UPLOAD_ADDED", ({ detail: { upload } }) => {
        if (!uploadingAttachmentIds.has(parseInt(upload.data.get("temporary_id")))) {
            return;
        }
        const threadId = upload.data.get("thread_id");
        const threadModel = upload.data.get("thread_model");
        const originThread =
            messaging.state.threads[
                threadModel === "mail.channel" ? parseInt(threadId) : `${threadModel},${threadId}`
            ];
        abortByUploadId[upload.id] = upload.xhr.abort.bind(upload.xhr);
        state.attachments.push({
            filename: upload.title,
            id: upload.id,
            mimetype: upload.type,
            name: upload.title,
            originThread,
            size: upload.total,
            uploading: true,
        });
    });
    useBus(bus, "FILE_UPLOAD_LOADED", ({ detail: { upload } }) => {
        const tmpId = parseInt(upload.data.get("temporary_id"));
        if (!uploadingAttachmentIds.has(tmpId)) {
            return;
        }
        uploadingAttachmentIds.delete(tmpId);
        delete abortByUploadId[upload.id];
        const response = JSON.parse(upload.xhr.response);
        if (response.error) {
            notification.add(response.error, { type: "danger" });
            return;
        }
        const threadId = upload.data.get("thread_id");
        const threadModel = upload.data.get("thread_model");
        const originThread =
            messaging.state.threads[
                threadModel === "mail.channel" ? parseInt(threadId) : `${threadModel},${threadId}`
            ];
        const attachment = {
            ...response,
            originThread,
        };
        const index = state.attachments.findIndex(({ id }) => id === upload.id);
        if (index >= 0) {
            state.attachments[index] = attachment;
        } else {
            state.attachments.push(attachment);
        }
    });
    useBus(bus, "FILE_UPLOAD_ERROR", ({ detail: { upload } }) => {
        delete abortByUploadId[upload.id];
        uploadingAttachmentIds.delete(parseInt(upload.data.get("temporary_id")));
    });

    return state;
}
