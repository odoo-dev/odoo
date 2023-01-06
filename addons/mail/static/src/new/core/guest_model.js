/* @odoo-module */

/**
 * @typedef Data
 * @property {number} id
 * @property {string} name
 */

export class Guest {
    /** @type {number} */
    id;
    /** @type {string} */
    name;
    /** @type {'offline' | 'bot' | 'online' | 'away' | 'im_partner' | undefined} im_status */
    im_status;
    /** @type {import("@mail/new/core/store_service").Store} */
    _store;

    /**
     * @param {import("@mail/new/core/store_service").Store} store
     * @param {Data} data
     * @returns {Guest}
     */
    static insert(store, data) {
        let guest = store.guests[data.id];
        if (!guest) {
            guest = new Guest();
            guest._store = store;
            store.guests[data.id] = guest;
            // Get reactive version.
            guest = store.guests[data.id];
        }
        const { id = guest.id, name = guest.name, im_status = guest.im_status } = data;
        Object.assign(guest, {
            id,
            name,
            im_status,
        });
        return guest;
    }

    get avatarUrl() {
        return `/web/image/mail.guest/${this.id}/avatar_128?unique=${this.name}`;
    }
}
