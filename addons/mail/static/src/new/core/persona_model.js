/* @odoo-module */

export class Persona {
    /** @type {string} */
    localId;
    /** @type {number} */
    id;
    /** @type {'partner' | 'guest'} */
    type;
    /** @type {string} */
    name;
    /** @type {string} */
    email;
    /** @type {Array | undefined} */
    user;
    /** @type {'offline' | 'bot' | 'online' | 'away' | 'im_partner' | undefined} im_status */
    im_status;
    isAdmin;
    /** @type {import("@mail/new/core/store_service").Store} */
    _store;

    get avatarUrl() {
        switch (this.type) {
            case "partner":
                return `/mail/channel/1/partner/${this.id}/avatar_128`;
            case "guest":
                return `/web/image/mail.guest/${this.id}/avatar_128?unique=${this.name}`;
            default:
                return "";
        }
    }

    get isSelf() {
        return this === this._store.self;
    }
}
