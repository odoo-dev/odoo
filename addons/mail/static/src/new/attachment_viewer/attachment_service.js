/** @odoo-module */

import { Attachment } from "../core/attachment_model";
import { createLocalId } from "../core/thread_model.create_local_id";

export class AttachmentService {
    constructor(env, store) {
        this.env = env;
        /** @type {import("@mail/new/core/store_service").Store} */
        this.store = store;
    }

    insert(data) {
        const attachment = new Attachment();
        attachment._store = this.store;
        if ("id" in data) {
            attachment.id = data.id;
        }
        if ("checksum" in data) {
            attachment.checksum = data.checksum;
        }
        if ("filename" in data) {
            attachment.filename = data.filename;
        }
        if ("mimetype" in data) {
            attachment.mimetype = data.mimetype;
        }
        if ("name" in data) {
            attachment.name = data.name;
            attachment.extension = attachment.name.split(".").pop();
        }
        if ("type" in data) {
            attachment.type = data.type;
        }
        if ("url" in data) {
            attachment.url = data.url;
        }
        if ("accessToken" in data) {
            attachment.accessToken = data.accessToken;
        }
        if ("originThread" in data) {
            const threadData = Array.isArray(data.originThread)
                ? data.originThread[0][1]
                : data.originThread;
            attachment.originThreadLocalId = createLocalId(threadData.model, threadData.model);
        }
        return attachment;
    }
}

export const attachmentService = {
    dependencies: ["mail.store"],
    start(env, { "mail.store": store }) {
        return new AttachmentService(env, store);
    },
};
