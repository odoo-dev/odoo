/* @odoo-module */

import { Record, modelRegistry } from "@mail/core/common/record";
import { assignDefined } from "@mail/utils/common/misc";

import { url } from "@web/core/utils/urls";

export class Attachment extends Record {
    static ids = ["id"];
    /** @type {Object.<number, Attachment>} */
    static records = {};

    static insert(data) {
        if (!("id" in data)) {
            throw new Error("Cannot insert attachment: id is missing in data");
        }
        let attachment = this.records[data.id];
        if (!attachment) {
            this.records[data.id] = new Attachment();
            attachment = this.records[data.id];
            Object.assign(attachment, { _store: this.store, id: data.id });
        }
        this.update(attachment, data);
        return attachment;
    }

    static update(attachment, data) {
        assignDefined(attachment, data, [
            "checksum",
            "filename",
            "mimetype",
            "name",
            "type",
            "url",
            "uploading",
            "extension",
            "accessToken",
            "tmpUrl",
            "message",
        ]);
        if (!("extension" in data) && data["name"]) {
            attachment.extension = attachment.name.split(".").pop();
        }
        if (data.originThread !== undefined) {
            const threadData = Array.isArray(data.originThread)
                ? data.originThread[0][1]
                : data.originThread;
            this.store.Thread.insert({
                model: threadData.model,
                id: threadData.id,
            });
            attachment.originThreadLocalId = this.store.Thread.toId(threadData);
            const thread = attachment.originThread;
            if (attachment.notIn(thread.attachments)) {
                thread.attachments.push(attachment);
                thread.attachments.sort((a1, a2) => (a1.id < a2.id ? 1 : -1));
            }
        }
    }

    /** @type {import("@mail/core/common/store_service").Store */
    _store;
    accessToken;
    checksum;
    extension;
    filename;
    id;
    mimetype;
    name;
    originThreadLocalId;
    type;
    /** @type {string} */
    tmpUrl;
    /** @type {string} */
    url;
    /** @type {boolean} */
    uploading;
    /** @type {import("@mail/core/common/message_model").Message} */
    message;

    /** @type {import("@mail/core/common/thread_model").Thread} */
    get originThread() {
        return this._store.Thread.records[this.originThreadLocalId];
    }

    get isDeletable() {
        return true;
    }

    get displayName() {
        return this.name || this.filename;
    }

    get isText() {
        const textMimeType = [
            "application/javascript",
            "application/json",
            "text/css",
            "text/html",
            "text/plain",
        ];
        return textMimeType.includes(this.mimetype);
    }

    get isPdf() {
        return this.mimetype && this.mimetype.startsWith("application/pdf");
    }

    get isImage() {
        const imageMimetypes = [
            "image/bmp",
            "image/gif",
            "image/jpeg",
            "image/png",
            "image/svg+xml",
            "image/tiff",
            "image/x-icon",
            "image/webp",
        ];
        return imageMimetypes.includes(this.mimetype);
    }

    get isUrl() {
        return this.type === "url" && this.url;
    }

    get isUrlYoutube() {
        return !!this.url && this.url.includes("youtu");
    }

    get isVideo() {
        const videoMimeTypes = ["audio/mpeg", "video/x-matroska", "video/mp4", "video/webm"];
        return videoMimeTypes.includes(this.mimetype);
    }

    get isViewable() {
        return (
            (this.isText || this.isImage || this.isVideo || this.isPdf || this.isUrlYoutube) &&
            !this.uploading
        );
    }

    get defaultSource() {
        const route = url(this.urlRoute, this.urlQueryParams);
        const encodedRoute = encodeURIComponent(route);
        if (this.isPdf) {
            return `/web/static/lib/pdfjs/web/viewer.html?file=${encodedRoute}#pagemode=none`;
        }
        if (this.isUrlYoutube) {
            const urlArr = this.url.split("/");
            let token = urlArr[urlArr.length - 1];
            if (token.includes("watch")) {
                token = token.split("v=")[1];
                const amp = token.indexOf("&");
                if (amp !== -1) {
                    token = token.substring(0, amp);
                }
            }
            return `https://www.youtube.com/embed/${token}`;
        }
        return route;
    }

    get downloadUrl() {
        return url(this.urlRoute, { ...this.urlQueryParams, download: true });
    }

    /**
     * @returns {string}
     */
    get urlRoute() {
        if (this.uploading && this.tmpUrl) {
            return this.tmpUrl;
        }
        return this.isImage ? `/web/image/${this.id}` : `/web/content/${this.id}`;
    }

    /**
     * @returns {Object}
     */
    get urlQueryParams() {
        if (this.uploading && this.tmpUrl) {
            return {};
        }
        return assignDefined(
            {},
            {
                access_token: this.accessToken || undefined,
                filename: this.name || undefined,
                unique: this.checksum || undefined,
            }
        );
    }
}

modelRegistry.add(Attachment.name, Attachment);
