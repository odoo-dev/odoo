/* @odoo-module */

/**
 * @typedef Data
 * @property {number} id
 * @property {string} name
 * @property {string} email
 */

export class Partner {
    /** @type {number} */
    id;
    /** @type {string} */
    name;
    /** @type {string} */
    email;
    /** @type {'offline' | 'bot' | 'online' | 'away' | 'im_partner' | undefined} im_status */
    im_status;
    /** @type {import("@mail/new/core/store_service").Store} */
    _store;

    get avatarUrl() {
        return `/mail/channel/1/partner/${this.id}/avatar_128`;
    }

    get nameOrDisplayName() {
        return this.name || this.display_name;
    }

    get isCurrentUser() {
        return this.id === this._store.user.partnerId;
    }
}
