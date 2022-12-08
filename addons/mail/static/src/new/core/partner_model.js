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
    /** @type {'offline' | 'bot' | 'online' | 'away' | 'im_partner' | undefined} im_status */
    im_status;

    /**
     * @param {import("@mail/new/core/messaging").Messaging['state']} state
     * @param {import("@mail/new/core/partner_model").Data} data
     * @returns {import("@mail/new/core/partner_model").Partner}
     */
    static insert(state, data) {
        let partner = state.partners[data.id];
        if (!partner) {
            partner = new Partner();
            partner._state = state;
            state.partners[data.id] = partner;
            // Get reactive version.
            partner = state.partners[data.id];
        }
        const { id = partner.id, name = partner.name, im_status = partner.im_status, email = partner.email } = data;
        Object.assign(partner, {
            id,
            name,
            im_status,
            email,
        });
        if (
            partner.im_status !== "im_partner" &&
            !partner.is_public &&
            !state.registeredImStatusPartners.includes(partner.id)
        ) {
            state.registeredImStatusPartners.push(partner.id);
        }
        // return reactive version
        return partner;
    }

    get avatarUrl() {
        return `/mail/channel/1/partner/${this.id}/avatar_128`;
    }

    get nameOrDisplayName() {
        return this.name || this.display_name;
    }

    get isCurrentUser() {
        return this.id !== this._state.user.partnerId;
    }
}
