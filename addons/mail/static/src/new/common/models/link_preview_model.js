/** @odoo-module */

/**
 * @class LinkPreview
 */
export class LinkPreview {
    /**
     * @param {Object} data
     */
    constructor(data) {
        /** @type {Number} */
        void this.id;
        /** @type {Object} */
        void this.message;
        /** @type {string} */
        void this.image_mimetype;
        /** @type {string} */
        void this.og_description;
        /** @type {string} */
        void this.og_image;
        /** @type {string} */
        void this.og_mimetype;
        /** @type {string} */
        void this.og_title;
        /** @type {string} */
        void this.og_type;
        /** @type {string} */
        void this.og_source_url;

        // Assign every field from the server RPC to the class
        Object.assign(this, data);
    }

    get imageUrl() {
        return this.og_image ? this.og_image : this.og_source_url;
    }

    get isImage() {
        return Boolean(this.image_mimetype || this.og_mimetype === "image/gif");
    }

    get isVideo() {
        return Boolean(!this.isImage && this.og_type && this.og_type.startsWith("video"));
    }

    get isCard() {
        return !this.isImage && !this.isVideo;
    }
}
