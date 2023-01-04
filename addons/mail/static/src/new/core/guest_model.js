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

    /**
     * @param {import("@mail/new/core/messaging").Messaging['state']} state
     * @param {Data} data
     * @returns {Guest}
     */
    static insert(state, data) {
        let guest = state.guests[data.id];
        if (!guest) {
            guest = new Guest();
            guest._state = state;
            state.guests[data.id] = guest;
            // Get reactive version.
            guest = state.guests[data.id];
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
