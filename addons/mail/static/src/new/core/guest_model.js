/* @odoo-module */

export class Guest {
    /** @type {number} */
    id;
    /** @type {string} */
    name;
    /** @type {'offline' | 'bot' | 'online' | 'away' | 'im_partner' | undefined} im_status */
    im_status;
    /** @type {import("@mail/new/core/store_service").Store} */
    _store;

    get avatarUrl() {
        return `/web/image/mail.guest/${this.id}/avatar_128?unique=${this.name}`;
    }
}
