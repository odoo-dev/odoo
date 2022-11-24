/** @odoo-module */

/**
 * @class LinkPreview
 */
export class LinkPreview {
    /**
     * @type {Number}
     */
    id;
    /**
     * @type {Object}
     */
    message;
    /**
     * @type {string}
     */
    image_mimetype;
    /**
     * @type {string}
     */
    og_description;
    /**
     * @type {string}
     */
    og_image;
    /**
     * @type {string}
     */
    og_mimetype;
    /**
     * @type {string}
     */
    og_title;
    /**
     * @type {string}
     */
    og_type;
    /**
     * @type {string}
     */
    og_source_url;

    /**
     * @param {Object} data
     */
    constructor(data) {
        // Assign every field form the server RPC to the class
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
